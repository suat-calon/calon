/**
 * SMS DELIVERY PROCESSOR
 * ──────────────────────────────────────────────────────────────────────────────
 * calon:queue:notification-sms kuyruğunu tüketir.
 *
 * Görev:
 *   1. claimForProcessing(deliveryId) — atomik SQL claim (PENDING/FAILED → PROCESSING)
 *      null → başka worker claim etti veya terminal durum → erken dön
 *   2. Payload'dan body/recipient al
 *   3. SMS provider'a gönder
 *   4. Başarı: markSent → incrementUsage → parent outbox durumunu güncelle
 *   5. Transient hata: markFailedWithRetry → delayed job kuyruğa ekle
 *   6. Permanent hata: markPermanentFailure → DLQ
 *
 * Retry:
 *   BullMQ retry KAPALI (attempts: 1).
 *   DB'de nextAttemptAt set edilir; recovery processor yeniden kuyruğa basar.
 * ──────────────────────────────────────────────────────────────────────────────
 */

import { Logger }                            from '@nestjs/common';
import { Processor, Process, OnQueueFailed } from '@nestjs/bull';
import { InjectQueue }                       from '@nestjs/bull';
import { Queue, Job }                        from 'bull';

import { QUEUE_NAMES }              from '../../../common/queue/queue-names';
import { DeliveryRepository }       from '../../delivery/delivery.repository';
import { OutboxRepository }         from '../../event/outbox.repository';
import { ProviderRegistryService }  from '../../provider/provider-registry.service';
import { CostPolicyEngine }         from '../../notification/cost-policy.engine';
import { FailedJobService }         from '../../../common/queue/failed-job.service';
import { MetricsService }           from '../../../common/logging/metrics.service';
import {
  classifyFailure,
  nextRetryAt,
  isMaxAttemptsReached,
  type ProviderError,
} from '../../delivery/retry-policy';
import type { DeliveryJobPayload } from '../../event/schemas/event-envelope';

export const SMS_PROVIDER_TIMEOUT_MS = 10_000;

const MAX_ATTEMPTS = 3;

@Processor(QUEUE_NAMES.NOTIFICATION_SMS)
export class SmsDeliveryProcessor {
  private readonly logger = new Logger(SmsDeliveryProcessor.name);

  constructor(
    private readonly delivery:    DeliveryRepository,
    private readonly outbox:      OutboxRepository,
    private readonly providers:   ProviderRegistryService,
    private readonly costPolicy:  CostPolicyEngine,
    private readonly failedJobs:  FailedJobService,
    private readonly metrics:     MetricsService,
    @InjectQueue(QUEUE_NAMES.NOTIFICATION_SMS)
    private readonly smsQueue:    Queue,
    @InjectQueue(QUEUE_NAMES.NOTIFICATION_DLQ)
    private readonly dlqQueue:    Queue,
  ) {}

  @Process('deliver')
  async handleDeliver(job: Job<DeliveryJobPayload>): Promise<void> {
    const { deliveryId, tenantId } = job.data;

    this.logger.log(`[SmsWorker] İşleniyor: deliveryId=${deliveryId}`);

    // ── 1. Atomik claim — tek SQL round-trip, race-condition'a karşı koruma ──
    // PENDING/FAILED → PROCESSING + attempts++ (atomik)
    // Boş RETURNING → başka worker claim etti veya terminal durum → erken dön
    const claimed = await this.delivery.claimForProcessing(deliveryId);
    if (!claimed) {
      this.logger.log(
        `[SmsWorker] Claim başarısız (başka worker veya terminal durum), ` +
        `atlanıyor: deliveryId=${deliveryId}`,
      );
      return;
    }

    // attempts SQL tarafından artırıldı — stale read yok
    const currentAttempts = claimed.attempts;

    // ── 2. Payload'dan body/recipient al ────────────────────────────────────
    const payload   = claimed.payload as Record<string, unknown>;
    const body      = payload['body'] as string | undefined;
    const recipient = claimed.recipient;

    if (!body) {
      await this.delivery.markPermanentFailure(
        deliveryId,
        'TEMPLATE_RENDER_ERROR',
        'Payload içinde body bulunamadı',
      );
      await this.syncOutboxStatus(claimed.eventId, tenantId);
      return;
    }

    // ── 3. SMS Provider gönderim (timeout korumalı) ─────────────────────────
    const provider = this.providers.getSmsProvider(tenantId);
    let sendError: ProviderError | null = null;

    const timeoutPromise = new Promise<never>((_, reject) =>
      setTimeout(
        () => reject({ code: 'PROVIDER_TIMEOUT', message: `SMS provider zaman aşımı (${SMS_PROVIDER_TIMEOUT_MS / 1000}s)` }),
        SMS_PROVIDER_TIMEOUT_MS,
      ),
    );

    try {
      const result = await Promise.race([
        provider.send({
          to:             recipient,
          body,
          idempotencyKey: claimed.idempotencyKey,
          tenantId,
        }),
        timeoutPromise,
      ]);

      // ── 5. Başarı ────────────────────────────────────────────────────────
      await this.delivery.markSent(
        deliveryId,
        result.providerMessageId,
        result.provider,
        result.costEstimateMinor,
      );

      // Usage ledger güncelle
      const { start: periodStart, end: periodEnd } = this.costPolicy.getCurrentPeriod();
      await this.delivery.incrementUsage(
        tenantId,
        'SMS',
        periodStart,
        periodEnd,
        1,       // sentDelta
        0,       // failedDelta
        claimed.costEstimateMinor ?? 0,
        result.costEstimateMinor,
      );

      this.metrics.incSmsSent();
      this.logger.log(
        `[SmsWorker] SMS gönderildi: deliveryId=${deliveryId} ` +
        `msgId=${result.providerMessageId}`,
      );

    } catch (err: unknown) {
      // ProviderError mi? Yoksa genel Error?
      if (this.isProviderError(err)) {
        sendError = err;
      } else {
        sendError = {
          code:    'PROVIDER_ERROR',
          message: err instanceof Error ? err.message : String(err),
        };
      }
    }

    // ── 6/7. Hata işleme ────────────────────────────────────────────────────
    if (sendError) {
      const failureClass = classifyFailure(sendError);

      if (
        failureClass === 'PERMANENT' ||
        isMaxAttemptsReached('SMS', currentAttempts)
      ) {
        // Kalıcı hata veya max retry — PERMANENT_FAILURE
        await this.delivery.markPermanentFailure(
          deliveryId,
          sendError.code,
          sendError.message,
        );

        // Usage: failed sayacını artır
        const { start, end } = this.costPolicy.getCurrentPeriod();
        await this.delivery.incrementUsage(tenantId, 'SMS', start, end, 0, 1, 0, 0);

        this.metrics.incSmsFailed();
        this.metrics.incDlq();

        // DLQ
        await this.dlqQueue.add('dlq', {
          originalQueue: QUEUE_NAMES.NOTIFICATION_SMS,
          deliveryId,
          tenantId,
          eventId:      claimed.eventId,
          channel:      claimed.channel,
          errorCode:    sendError.code,
          errorMessage: sendError.message,
        });

        this.logger.warn(
          `[SmsWorker] Kalıcı hata/max retry: deliveryId=${deliveryId} ` +
          `code=${sendError.code}`,
        );
      } else {
        // Geçici hata — retry zamanla
        const retryAt = nextRetryAt('SMS', currentAttempts);
        if (retryAt) {
          await this.delivery.markFailedWithRetry(
            deliveryId,
            sendError.code,
            sendError.message,
            retryAt,
          );

          // Recovery processor delayed job'u yeniden kuyruğa basacak
          this.logger.warn(
            `[SmsWorker] Geçici hata, retry zamanlandı: deliveryId=${deliveryId} ` +
            `retryAt=${retryAt.toISOString()} code=${sendError.code}`,
          );
        }
      }
    }

    // ── Outbox durumu güncelle ────────────────────────────────────────────
    await this.syncOutboxStatus(claimed.eventId, tenantId);
  }

  /**
   * Event'in tüm delivery'leri tamamlandıysa outbox'ı DELIVERED yap.
   */
  private async syncOutboxStatus(eventId: string, _tenantId: string): Promise<void> {
    const allDone = await this.delivery.areAllDelivered(eventId);
    if (allDone) {
      await this.outbox.markDelivered(eventId);
      this.logger.log(`[SmsWorker] Tüm delivery'ler tamamlandı → eventId=${eventId} DELIVERED`);
    }
  }

  private isProviderError(err: unknown): err is ProviderError {
    return (
      typeof err === 'object' &&
      err !== null &&
      'code' in err &&
      'message' in err
    );
  }

  @OnQueueFailed()
  async onFailed(job: Job<DeliveryJobPayload>, err: Error): Promise<void> {
    this.logger.warn(
      `[SmsWorker] Job başarısız: jobId=${job.id} ` +
      `attempt=${job.attemptsMade}/${MAX_ATTEMPTS} err=${err.message}`,
    );

    if (job.attemptsMade >= MAX_ATTEMPTS) {
      await this.failedJobs.save({
        queueName: QUEUE_NAMES.NOTIFICATION_SMS,
        jobName:   'deliver',
        jobId:     String(job.id),
        jobData:   job.data as unknown as Record<string, unknown>,
        errorMsg:  err.message,
        attempts:  job.attemptsMade,
        tenantId:  job.data.tenantId,
      });
    }
  }
}
