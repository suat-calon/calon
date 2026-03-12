/**
 * PUSH DELIVERY PROCESSOR
 * ──────────────────────────────────────────────────────────────────────────────
 * calon:queue:notification-push kuyruğunu tüketir.
 * Skeleton implementasyon — stub provider ile çalışır.
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

export const PUSH_PROVIDER_TIMEOUT_MS = 10_000;

const MAX_ATTEMPTS = 3;

@Processor(QUEUE_NAMES.NOTIFICATION_PUSH)
export class PushDeliveryProcessor {
  private readonly logger = new Logger(PushDeliveryProcessor.name);

  constructor(
    private readonly delivery:    DeliveryRepository,
    private readonly outbox:      OutboxRepository,
    private readonly providers:   ProviderRegistryService,
    private readonly costPolicy:  CostPolicyEngine,
    private readonly failedJobs:  FailedJobService,
    private readonly metrics:     MetricsService,
    @InjectQueue(QUEUE_NAMES.NOTIFICATION_DLQ)
    private readonly dlqQueue:    Queue,
  ) {}

  @Process('deliver')
  async handleDeliver(job: Job<DeliveryJobPayload>): Promise<void> {
    const { deliveryId, tenantId } = job.data;

    this.logger.log(`[PushWorker] İşleniyor: deliveryId=${deliveryId}`);

    // ── 1. Atomik claim — tek SQL round-trip, race-condition'a karşı koruma ──
    const claimed = await this.delivery.claimForProcessing(deliveryId);
    if (!claimed) {
      this.logger.log(
        `[PushWorker] Claim başarısız (başka worker veya terminal durum), ` +
        `atlanıyor: deliveryId=${deliveryId}`,
      );
      return;
    }

    const currentAttempts = claimed.attempts;

    const payload   = claimed.payload as Record<string, unknown>;
    const body      = payload['body'] as string | undefined;
    const title     = payload['subject'] as string | undefined;
    const recipient = claimed.recipient; // push token

    if (!body) {
      await this.delivery.markPermanentFailure(deliveryId, 'TEMPLATE_RENDER_ERROR', 'body bulunamadı');
      await this.syncOutboxStatus(claimed.eventId, tenantId);
      return;
    }

    const provider = this.providers.getPushProvider(tenantId);
    let sendError: ProviderError | null = null;

    const timeoutPromise = new Promise<never>((_, reject) =>
      setTimeout(
        () => reject({ code: 'PROVIDER_TIMEOUT', message: `Push provider zaman aşımı (${PUSH_PROVIDER_TIMEOUT_MS / 1000}s)` }),
        PUSH_PROVIDER_TIMEOUT_MS,
      ),
    );

    try {
      const result = await Promise.race([
        provider.send({
          token:          recipient,
          title:          title ?? 'Calon',
          body,
          idempotencyKey: claimed.idempotencyKey,
          tenantId,
        }),
        timeoutPromise,
      ]);

      await this.delivery.markSent(deliveryId, result.providerMessageId, result.provider, 0);

      const { start, end } = this.costPolicy.getCurrentPeriod();
      await this.delivery.incrementUsage(tenantId, 'PUSH', start, end, 1, 0, 0, 0);

      this.metrics.incPushSent();
      this.logger.log(`[PushWorker] Push gönderildi: deliveryId=${deliveryId}`);

    } catch (err: unknown) {
      sendError = this.isProviderError(err)
        ? err
        : { code: 'PROVIDER_ERROR', message: err instanceof Error ? err.message : String(err) };
    }

    if (sendError) {
      const failureClass = classifyFailure(sendError);

      if (failureClass === 'PERMANENT' || isMaxAttemptsReached('PUSH', currentAttempts)) {
        await this.delivery.markPermanentFailure(deliveryId, sendError.code, sendError.message);

        this.metrics.incPushFailed();
        this.metrics.incDlq();

        const { start, end } = this.costPolicy.getCurrentPeriod();
        await this.delivery.incrementUsage(tenantId, 'PUSH', start, end, 0, 1, 0, 0);

        await this.dlqQueue.add('dlq', {
          originalQueue: QUEUE_NAMES.NOTIFICATION_PUSH,
          deliveryId,
          tenantId,
          eventId:      claimed.eventId,
          channel:      claimed.channel,
          errorCode:    sendError.code,
          errorMessage: sendError.message,
        });
      } else {
        const retryAt = nextRetryAt('PUSH', currentAttempts);
        if (retryAt) {
          await this.delivery.markFailedWithRetry(
            deliveryId, sendError.code, sendError.message, retryAt,
          );
        }
      }
    }

    await this.syncOutboxStatus(claimed.eventId, tenantId);
  }

  private async syncOutboxStatus(eventId: string, _tenantId: string): Promise<void> {
    const allDone = await this.delivery.areAllDelivered(eventId);
    if (allDone) {
      await this.outbox.markDelivered(eventId);
    }
  }

  private isProviderError(err: unknown): err is ProviderError {
    return typeof err === 'object' && err !== null && 'code' in err && 'message' in err;
  }

  @OnQueueFailed()
  async onFailed(job: Job<DeliveryJobPayload>, err: Error): Promise<void> {
    this.logger.warn(`[PushWorker] Job başarısız: jobId=${job.id} err=${err.message}`);

    if (job.attemptsMade >= MAX_ATTEMPTS) {
      await this.failedJobs.save({
        queueName: QUEUE_NAMES.NOTIFICATION_PUSH,
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
