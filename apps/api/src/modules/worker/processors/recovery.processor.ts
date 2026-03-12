/**
 * RECOVERY / RECONCILER PROCESSOR
 * ──────────────────────────────────────────────────────────────────────────────
 * calon:queue:notification-recovery kuyruğunu tüketir.
 * Cron tetiklemeli (her 5 dakika): WorkerModule'de @Cron ile kuyruğa basılır.
 *
 * Görevleri:
 *   1. Stuck PROCESSING event'leri bul → PENDING'e döndür (dispatcher yeniden alır)
 *   2. Stuck PROCESSING delivery'leri bul → retry kuyruğuna geri bas
 *   3. Retry zamanı gelmiş FAILED delivery'leri bul → kanal queue'larına bas
 *   4. DISPATCHED event: tüm delivery'ler terminal mi → DELIVERED/PARTIALLY_DELIVERED yap
 * ──────────────────────────────────────────────────────────────────────────────
 */

import { Logger }                 from '@nestjs/common';
import { Processor, Process }     from '@nestjs/bull';
import { InjectQueue }            from '@nestjs/bull';
import { Queue, Job }             from 'bull';

import { QUEUE_NAMES }             from '../../../common/queue/queue-names';
import { PrismaService }           from '../../../common/prisma.service';
import { OutboxRepository }        from '../../event/outbox.repository';
import { DeliveryRepository }      from '../../delivery/delivery.repository';
import { MAX_DELIVERY_ATTEMPTS }   from '../../delivery/retry-policy';
import type { DeliveryJobPayload } from '../../event/schemas/event-envelope';

/** Recovery job parametresi (opsiyonel) */
interface RecoveryJobPayload {
  triggeredBy?: string;
}

@Processor(QUEUE_NAMES.NOTIFICATION_RECOVERY)
export class RecoveryProcessor {
  private readonly logger = new Logger(RecoveryProcessor.name);

  /** Outbox stuck threshold — dispatcher'ın PROCESSING'de bırakabileceği süre */
  private readonly OUTBOX_STUCK_THRESHOLD_MIN = 10;
  /** Delivery stuck threshold */
  private readonly DELIVERY_STUCK_THRESHOLD_MIN = 5;

  constructor(
    private readonly prisma:    PrismaService,
    private readonly outbox:    OutboxRepository,
    private readonly delivery:  DeliveryRepository,
    @InjectQueue(QUEUE_NAMES.EVENT_DISPATCH)
    private readonly dispatchQueue:  Queue,
    @InjectQueue(QUEUE_NAMES.NOTIFICATION_SMS)
    private readonly smsQueue:       Queue,
    @InjectQueue(QUEUE_NAMES.NOTIFICATION_EMAIL)
    private readonly emailQueue:     Queue,
    @InjectQueue(QUEUE_NAMES.NOTIFICATION_PUSH)
    private readonly pushQueue:      Queue,
    @InjectQueue(QUEUE_NAMES.NOTIFICATION_DLQ)
    private readonly dlqQueue:       Queue,
  ) {}

  @Process('recover')
  async handleRecover(job: Job<RecoveryJobPayload>): Promise<void> {
    const triggeredBy = job.data?.triggeredBy ?? 'cron';
    this.logger.log(`[Recovery] Başlatılıyor: trigger=${triggeredBy}`);

    let recovered = 0;

    // ── 1. Stuck PROCESSING event_outbox ─────────────────────────────────────
    const stuckEvents = await this.outbox.findStuckProcessing(this.OUTBOX_STUCK_THRESHOLD_MIN);
    for (const event of stuckEvents) {
      this.logger.warn(
        `[Recovery] Stuck outbox event bulundu: eventId=${event.id} ` +
        `partitionKey=${event.partitionKey} ` +
        `processingStartedAt=${event.processingStartedAt?.toISOString()}`,
      );

      // PROCESSING → PENDING (retry ile)
      await this.outbox.markForRetry(
        event.id,
        new Date(), // hemen retry
        'recovery: stuck PROCESSING sıfırlandı',
      );

      // Dispatcher queue'ya yeniden bas
      await this.dispatchQueue.add('dispatch', {
        eventId:  event.id,
        tenantId: event.tenantId,
      }, {
        attempts:        1,
        removeOnComplete: 200,
        removeOnFail:     100,
      });

      recovered++;
    }

    // ── 2. Stuck PROCESSING event_deliveries ──────────────────────────────────
    const stuckDeliveries = await this.delivery.findStuckProcessing(this.DELIVERY_STUCK_THRESHOLD_MIN);
    for (const record of stuckDeliveries) {
      this.logger.warn(
        `[Recovery] Stuck delivery bulundu: deliveryId=${record.id} ` +
        `channel=${record.channel} attempts=${record.attempts}`,
      );

      // Max attempts aşıldıysa → kalıcı başarısız + DLQ
      if (record.attempts >= MAX_DELIVERY_ATTEMPTS) {
        const stuckErrMsg = `Stuck PROCESSING: maksimum deneme sayısına ulaşıldı (${record.attempts}/${MAX_DELIVERY_ATTEMPTS})`;
        await this.delivery.markPermanentFailure(
          record.id,
          'MAX_ATTEMPTS_REACHED',
          stuckErrMsg,
        );
        await this.dlqQueue.add('dlq', {
          originalQueue: this.channelToQueueName(record.channel as 'SMS' | 'EMAIL' | 'PUSH'),
          deliveryId:    record.id,
          tenantId:      record.tenantId,
          eventId:       record.eventId,
          channel:       record.channel,
          errorCode:     'MAX_ATTEMPTS_REACHED',
          errorMessage:  stuckErrMsg,
        });
        this.logger.warn(
          `[Recovery] Max attempts (stuck): deliveryId=${record.id} ` +
          `attempts=${record.attempts} → PERMANENT_FAILURE + DLQ`,
        );
        recovered++;
        continue;
      }

      // PROCESSING → FAILED + retry zamanla (şimdi yeniden dene)
      await this.delivery.markFailedWithRetry(
        record.id,
        'STUCK_PROCESSING',
        'recovery: delivery PROCESSING state sıfırlandı',
        new Date(), // hemen
      );

      // Kanal queue'ya yeniden bas
      const payload: DeliveryJobPayload = {
        deliveryId: record.id,
        tenantId:   record.tenantId,
      };
      await this.enqueueDelivery(record.channel as 'SMS' | 'EMAIL' | 'PUSH', payload);
      recovered++;
    }

    // ── 3. Retry zamanı gelmiş FAILED delivery'ler ────────────────────────────
    const failedToRetry = await this.findDeliveriesReadyForRetry();
    for (const record of failedToRetry) {
      // Max attempts aşıldıysa → kalıcı başarısız + DLQ (retry yok)
      if (record.attempts >= MAX_DELIVERY_ATTEMPTS) {
        const retryErrMsg = `Maksimum deneme sayısına ulaşıldı (${record.attempts}/${MAX_DELIVERY_ATTEMPTS})`;
        await this.delivery.markPermanentFailure(
          record.id,
          'MAX_ATTEMPTS_REACHED',
          retryErrMsg,
        );
        await this.dlqQueue.add('dlq', {
          originalQueue: this.channelToQueueName(record.channel as 'SMS' | 'EMAIL' | 'PUSH'),
          deliveryId:    record.id,
          tenantId:      record.tenantId,
          eventId:       record.eventId,
          channel:       record.channel,
          errorCode:     'MAX_ATTEMPTS_REACHED',
          errorMessage:  retryErrMsg,
        });
        this.logger.warn(
          `[Recovery] Max attempts reached: deliveryId=${record.id} ` +
          `channel=${record.channel} attempts=${record.attempts} → PERMANENT_FAILURE + DLQ`,
        );
        recovered++;
        continue;
      }

      this.logger.log(
        `[Recovery] Retry zamanı geldi: deliveryId=${record.id} ` +
        `channel=${record.channel} attempts=${record.attempts}`,
      );

      const payload: DeliveryJobPayload = {
        deliveryId: record.id,
        tenantId:   record.tenantId,
      };
      await this.enqueueDelivery(record.channel as 'SMS' | 'EMAIL' | 'PUSH', payload);
      recovered++;
    }

    // ── 4. DISPATCHED event: tüm delivery'ler terminal mi? ───────────────────
    const dispatchedEvents = await this.findDispatchedEventsWithTerminalDeliveries();
    for (const { eventId, hasPartialFailure } of dispatchedEvents) {
      if (hasPartialFailure) {
        await this.outbox.markPartiallyDelivered(eventId);
      } else {
        await this.outbox.markDelivered(eventId);
      }
      this.logger.log(
        `[Recovery] Event durumu güncellendi: eventId=${eventId} ` +
        `status=${hasPartialFailure ? 'PARTIALLY_DELIVERED' : 'DELIVERED'}`,
      );
    }

    this.logger.log(`[Recovery] Tamamlandı: recovered=${recovered} stuckEvents=${stuckEvents.length} stuckDeliveries=${stuckDeliveries.length} retried=${failedToRetry.length}`);
  }

  /** Retry zamanı gelmiş FAILED delivery'leri bul */
  private async findDeliveriesReadyForRetry() {
    const now = new Date();
    return this.prisma.eventDelivery.findMany({
      where: {
        status:        'FAILED',
        nextAttemptAt: { lte: now },
      },
      take: 100,
    });
  }

  /**
   * DISPATCHED outbox event'ler + terminal delivery durumu kontrol.
   *
   * N+1 önleme: 2 sorgu sabit (50 event için 100 sorgu yerine).
   *   1. DISPATCHED event_outbox batch fetch
   *   2. Tüm delivery'leri tek seferde çek → uygulama katmanında filtrele
   */
  private async findDispatchedEventsWithTerminalDeliveries(): Promise<
    Array<{ eventId: string; hasPartialFailure: boolean }>
  > {
    const dispatchedEvents = await this.prisma.eventOutbox.findMany({
      where: { status: 'DISPATCHED' },
      select: { id: true },
      take: 50,
    });

    if (dispatchedEvents.length === 0) return [];

    const eventIds = dispatchedEvents.map(e => e.id);

    // Tek sorguda tüm delivery'leri çek
    const allDeliveries = await this.prisma.eventDelivery.findMany({
      where: { eventId: { in: eventIds } },
      select: { eventId: true, status: true },
    });

    // Uygulama katmanında gruplama
    const byEvent = new Map<string, string[]>();
    for (const d of allDeliveries) {
      const list = byEvent.get(d.eventId) ?? [];
      list.push(d.status);
      byEvent.set(d.eventId, list);
    }

    const ACTIVE_STATUSES = new Set(['PENDING', 'QUEUED', 'PROCESSING', 'FAILED']);

    const result: Array<{ eventId: string; hasPartialFailure: boolean }> = [];
    for (const eventId of eventIds) {
      const statuses = byEvent.get(eventId) ?? [];
      const hasActive = statuses.some(s => ACTIVE_STATUSES.has(s));
      if (!hasActive) {
        result.push({
          eventId,
          hasPartialFailure: statuses.includes('PERMANENT_FAILURE'),
        });
      }
    }

    return result;
  }

  private channelToQueueName(channel: 'SMS' | 'EMAIL' | 'PUSH'): string {
    if (channel === 'SMS')   return QUEUE_NAMES.NOTIFICATION_SMS;
    if (channel === 'EMAIL') return QUEUE_NAMES.NOTIFICATION_EMAIL;
    return QUEUE_NAMES.NOTIFICATION_PUSH;
  }

  private async enqueueDelivery(
    channel: 'SMS' | 'EMAIL' | 'PUSH',
    payload: DeliveryJobPayload,
  ): Promise<void> {
    const queue =
      channel === 'SMS'   ? this.smsQueue   :
      channel === 'EMAIL' ? this.emailQueue  :
                            this.pushQueue;

    await queue.add('deliver', payload, {
      attempts:        1,
      removeOnComplete: 200,
      removeOnFail:     100,
    });
  }
}
