/**
 * DISPATCHER PROCESSOR
 * ──────────────────────────────────────────────────────────────────────────────
 * event-dispatch kuyruğunu tüketir.
 *
 * Görev:
 *   1. event_outbox row'unu ID ile yükle
 *   2. Partition lock kontrol et (aynı aggregate race condition önleme)
 *   3. Status → PROCESSING (row kilit)
 *   4. Preference resolve et (aktif kanallar)
 *   5. Template resolve et (her kanal için)
 *   6. Cost policy kontrol et
 *   7. event_delivery record'larını oluştur
 *   8. Kanal queue'larına deliveryId ile iş bas
 *   9. event_outbox → DISPATCHED
 *
 * İdempotency:
 *   UNIQUE(tenantId, idempotency_key) — aynı delivery iki kez oluşturulamaz (P2002 = güvenli)
 * ──────────────────────────────────────────────────────────────────────────────
 */

import { Logger }                            from '@nestjs/common';
import { Processor, Process, OnQueueFailed } from '@nestjs/bull';
import { InjectQueue }                       from '@nestjs/bull';
import { Queue, Job }                        from 'bull';
import { Prisma }                            from '@prisma/client';
import { v4 as uuidv4 }                     from 'uuid';

import { QUEUE_NAMES }            from '../../../common/queue/queue-names';
import { PrismaService }          from '../../../common/prisma.service';
import { OutboxRepository }       from '../../event/outbox.repository';
import { DeliveryRepository }     from '../../delivery/delivery.repository';
import { PreferenceResolver }     from '../../notification/preference.resolver';
import { TemplateResolver }       from '../../notification/template.resolver';
import { CostPolicyEngine, estimateSmsSegments, estimateCostMinor }
  from '../../notification/cost-policy.engine';
import { FailedJobService }       from '../../../common/queue/failed-job.service';
import { MetricsService }         from '../../../common/logging/metrics.service';
import type {
  DispatcherJobPayload,
  DeliveryJobPayload,
} from '../../event/schemas/event-envelope';

const MAX_ATTEMPTS = 3;

/** Token-safe lock release: sadece token sahibi kendi lock'unu siler. */
const LUA_RELEASE_LOCK = `
if redis.call("get",KEYS[1]) == ARGV[1] then
  return redis.call("del",KEYS[1])
else
  return 0
end
`.trim();

@Processor(QUEUE_NAMES.EVENT_DISPATCH)
export class DispatcherProcessor {
  private readonly logger = new Logger(DispatcherProcessor.name);

  constructor(
    private readonly prisma:      PrismaService,
    private readonly outbox:      OutboxRepository,
    private readonly delivery:    DeliveryRepository,
    private readonly preference:  PreferenceResolver,
    private readonly template:    TemplateResolver,
    private readonly costPolicy:  CostPolicyEngine,
    private readonly failedJobs:  FailedJobService,
    private readonly metrics:     MetricsService,
    @InjectQueue(QUEUE_NAMES.NOTIFICATION_SMS)
    private readonly smsQueue:    Queue,
    @InjectQueue(QUEUE_NAMES.NOTIFICATION_EMAIL)
    private readonly emailQueue:  Queue,
    @InjectQueue(QUEUE_NAMES.NOTIFICATION_PUSH)
    private readonly pushQueue:   Queue,
    @InjectQueue(QUEUE_NAMES.NOTIFICATION_DLQ)
    private readonly dlqQueue:    Queue,
  ) {}

  @Process('dispatch')
  async handleDispatch(job: Job<DispatcherJobPayload>): Promise<void> {
    const { eventId, tenantId } = job.data;

    this.logger.log(`[Dispatcher] İşleniyor: eventId=${eventId}`);

    // ── 1. Event yükle ─────────────────────────────────────────────────────
    const event = await this.outbox.findById(eventId);
    if (!event) {
      this.logger.warn(`[Dispatcher] Event bulunamadı: eventId=${eventId}`);
      return;
    }

    // Zaten işlendi mi?
    if (['DISPATCHED', 'DELIVERED', 'CANCELLED'].includes(event.status)) {
      this.logger.log(
        `[Dispatcher] Event zaten işlenmiş (${event.status}), atlanıyor: eventId=${eventId}`,
      );
      return;
    }

    // ── 2. Redis partition lock (NX, 30s TTL) ──────────────────────────────
    // Aynı partitionKey için eşzamanlı iki dispatcher'ı engeller.
    // Lock serbest kalmazsa job yeniden kuyruğa girer (OnQueueFailed → retry).
    const lockKey   = `event-partition-lock:${event.partitionKey}`;
    const lockToken = uuidv4(); // Token-safe: her işçi kendi token'ını taşır
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const redis = (this.smsQueue as any).client as {
      set(key: string, value: string, mode: string, duration: number, flag: string): Promise<'OK' | null>;
      eval(script: string, numkeys: number, ...args: string[]): Promise<unknown>;
    };
    const lockResult = await redis.set(lockKey, lockToken, 'PX', 30_000, 'NX');
    if (!lockResult) {
      this.logger.warn(
        `[Dispatcher] Partition kilitli, sonraya bırakılıyor: ` +
        `partitionKey=${event.partitionKey} eventId=${eventId}`,
      );
      throw new Error(`PARTITION_LOCKED:${event.partitionKey}`);
    }

    try {
      // ── 3. PROCESSING durumuna geç ───────────────────────────────────────
      await this.prisma.$transaction(async (tx) => {
        await this.outbox.markProcessing(eventId, tx as Prisma.TransactionClient);
      });

      try {
        await this.processEvent(event, tenantId);
      } catch (err) {
        // PROCESSING'den geri çek — recovery alacak
        await this.outbox.markForRetry(
          eventId,
          new Date(Date.now() + 60_000), // 1 dakika sonra
          err instanceof Error ? err.message : String(err),
        );
        throw err;
      }
    } finally {
      // Token-safe lock release: sadece token sahibi kendi lock'unu siler.
      // TTL dolmuş ve başka bir işçi aynı key'i almışsa lock silinmez.
      await redis.eval(LUA_RELEASE_LOCK, 1, lockKey, lockToken);
    }
  }

  private async processEvent(
    event: Awaited<ReturnType<OutboxRepository['findById']>>,
    tenantId: string,
  ): Promise<void> {
    if (!event) return;

    const payload   = event.payload as Record<string, unknown>;
    const eventName = event.eventName;
    const locale    = 'tr'; // Faz 24: tenant locale'dan alınacak

    // ── 4. Preference resolve ───────────────────────────────────────────────
    const customerId = payload['customerId'] as string | undefined;
    const pref = await this.preference.resolve(
      tenantId,
      eventName,
      customerId,
      customerId ? 'CUSTOMER' : 'TENANT',
    );

    if (pref.enabledChannels.length === 0) {
      this.logger.log(
        `[Dispatcher] Hiçbir kanal aktif değil, event iptal: eventId=${event.id}`,
      );
      await this.outbox.markDelivered(event.id);
      return;
    }

    const { start: periodStart, end: periodEnd } = this.costPolicy.getCurrentPeriod();
    const deliveryJobs: Array<{ queue: Queue; payload: DeliveryJobPayload }> = [];

    // ── Transaction: delivery record'ları oluştur ─────────────────────────
    await this.prisma.$transaction(async (tx) => {
      for (const channel of pref.enabledChannels) {
        // Alıcı adres çözümle
        const recipient = this.resolveRecipient(payload, channel);
        if (!recipient) {
          this.logger.warn(
            `[Dispatcher] Alıcı bulunamadı: channel=${channel} eventId=${event.id}`,
          );
          continue;
        }

        // Template resolve
        const tpl = await this.template.resolveAndRender(
          tenantId,
          eventName,
          channel,
          locale,
          this.buildTemplateVariables(payload),
        );

        if (!tpl) {
          this.logger.warn(
            `[Dispatcher] Template bulunamadı: ` +
            `channel=${channel} event=${eventName} locale=${locale}`,
          );
          continue;
        }

        // Cost policy kontrol
        const policy = await this.costPolicy.checkPolicy(
          tenantId,
          channel,
          tpl.body,
          periodStart,
          periodEnd,
        );

        if (!policy.allowed) {
          this.logger.warn(
            `[Dispatcher] Cost policy engeli: ` +
            `channel=${channel} reason=${policy.reason} fallback=${policy.fallback}`,
          );
          // Fallback kanalı varsa o kanala geç
          if (policy.fallback) {
            // Fallback delivery oluşturmak için sonraki iterasyonda işlenecek
            // (basitlik için şimdilik log'la ve geç)
          }
          continue;
        }

        // SMS segment / cost tahmini
        const segments = channel === 'SMS' ? estimateSmsSegments(tpl.body) : 1;
        const cost     = estimateCostMinor(channel, segments);

        // Delivery idempotency key
        const deliveryIdempotencyKey =
          `${eventName}:${event.id}:${channel.toLowerCase()}:${recipient}:v${tpl.templateVersion}`;

        // Delivery record oluştur — P2002 → null (idempotent)
        const deliveryRecord = await this.delivery.createIdempotentInTx(
          {
            tenantId,
            eventId:           event.id,
            channel,
            recipient,
            templateKey:       tpl.templateKey,
            templateVersion:   tpl.templateVersion,
            locale,
            idempotencyKey:    deliveryIdempotencyKey,
            payload:           {
              body:    tpl.body,
              subject: tpl.subject,
              providerHint: tpl.providerHint,
            },
            costEstimateMinor: cost,
          },
          tx as Prisma.TransactionClient,
        );

        if (!deliveryRecord) {
          this.logger.debug(
            `[Dispatcher] Duplicate delivery, atlanıyor: key=${deliveryIdempotencyKey}`,
          );
          continue;
        }

        // Queue gönderimini transaction dışında yap
        const targetQueue =
          channel === 'SMS'   ? this.smsQueue   :
          channel === 'EMAIL' ? this.emailQueue  :
                                this.pushQueue;

        deliveryJobs.push({
          queue:   targetQueue,
          payload: { deliveryId: deliveryRecord.id, tenantId },
        });
      }

      // event_outbox → DISPATCHED
      await this.outbox.markDispatched(event.id, tx as Prisma.TransactionClient);
    });

    // ── Transaction dışında queue'lara bas (paralel) ─────────────────────
    await Promise.all(
      deliveryJobs.map(({ queue, payload }) =>
        queue.add('deliver', payload, {
          attempts:         1, // Bull retry kapalı — DB retry yönetiyor
          removeOnComplete: 200,
          removeOnFail:     100,
        }),
      ),
    );

    this.metrics.incEventDispatched();
    this.logger.log(
      `[Dispatcher] Event dispatched: eventId=${event.id} ` +
      `deliveries=${deliveryJobs.length}`,
    );
  }

  /** Payload'dan kanal bazlı alıcı adresini çıkar */
  private resolveRecipient(
    payload: Record<string, unknown>,
    channel: 'SMS' | 'EMAIL' | 'PUSH',
  ): string | null {
    switch (channel) {
      case 'SMS':
        return (payload['customerPhone'] as string | undefined) ?? null;
      case 'EMAIL':
        return (payload['customerEmail'] as string | undefined) ?? null;
      case 'PUSH':
        return (payload['pushToken'] as string | undefined) ?? null;
      default:
        return null;
    }
  }

  /** Payload'dan template değişkenlerini çıkar */
  private buildTemplateVariables(
    payload: Record<string, unknown>,
  ): Record<string, string> {
    const toStr = (v: unknown): string =>
      v === undefined || v === null ? '' : String(v);

    const startAtUtc = payload['startAtUtc'] as string | undefined;
    let startDate = '';
    let startTime = '';

    if (startAtUtc) {
      const d = new Date(startAtUtc);
      startDate = d.toLocaleDateString('tr-TR', { timeZone: payload['tenantTimezone'] as string ?? 'Europe/Istanbul' });
      startTime = d.toLocaleTimeString('tr-TR', {
        hour:     '2-digit',
        minute:   '2-digit',
        timeZone: (payload['tenantTimezone'] as string) ?? 'Europe/Istanbul',
      });
    }

    return {
      customerName:   toStr(payload['customerName']),
      customerPhone:  toStr(payload['customerPhone']),
      customerEmail:  toStr(payload['customerEmail']),
      staffName:      toStr(payload['staffName']),
      serviceName:    toStr(payload['serviceName']),
      locationName:   toStr(payload['locationName']),
      bookingCode:    toStr(payload['bookingCode']),
      startDate,
      startTime,
      cancelUrl:      toStr(payload['cancelUrl']),
      planName:       toStr(payload['plan']),
      nextRenewalDate: toStr(payload['nextPeriodStart']),
      renewalUrl:     toStr(payload['renewalUrl']),
      amount:         payload['amountCents']
        ? String(Math.round((payload['amountCents'] as number) / 100))
        : '',
    };
  }

  @OnQueueFailed()
  async onFailed(job: Job<DispatcherJobPayload>, err: Error): Promise<void> {
    this.logger.warn(
      `[Dispatcher] Job başarısız: jobId=${job.id} ` +
      `attempt=${job.attemptsMade}/${MAX_ATTEMPTS} err=${err.message}`,
    );

    if (job.attemptsMade >= MAX_ATTEMPTS) {
      await this.failedJobs.save({
        queueName: QUEUE_NAMES.EVENT_DISPATCH,
        jobName:   'dispatch',
        jobId:     String(job.id),
        jobData:   job.data as unknown as Record<string, unknown>,
        errorMsg:  err.message,
        attempts:  job.attemptsMade,
        tenantId:  job.data.tenantId,
      });

      // DLQ'ya taşı
      await this.dlqQueue.add('dlq', {
        originalQueue: QUEUE_NAMES.EVENT_DISPATCH,
        ...job.data,
        error: err.message,
      });

      this.metrics.incEventDispatchFailed();
      this.metrics.incDlq();
      await this.outbox.markDeadLettered(job.data.eventId, err.message);
    }
  }
}
