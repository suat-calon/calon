/**
 * LOYALTY PROCESSOR — BullMQ Consumer (loyalty-earn kuyruğu)
 * ──────────────────────────────────────────────────────────────────────────────
 * Appointment COMPLETED → AppointmentService → loyaltyQueue.add('earn-points', payload)
 *   → Bu processor çalışır → LoyaltyService.earnFromAppointment()
 *
 * İdempotency: LoyaltyService.earnFromAppointment() içinde idempotencyKey UNIQUE
 * kısıtı ile korunur; BullMQ retry'larında çift puan verilmez.
 *
 * Faz 13: @OnQueueFailed → tüm retry'lar tükendikten sonra DLQ'ya kaydeder.
 * ──────────────────────────────────────────────────────────────────────────────
 */

import { Logger }                            from '@nestjs/common';
import { Processor, Process, OnQueueFailed } from '@nestjs/bull';
import { Job }                               from 'bull';

import { QUEUE_NAMES }                           from '../../common/redis.module';
import { LoyaltyService, EarnFromAppointmentPayload } from './loyalty.service';
import { FailedJobService }                      from '../../common/queue/failed-job.service';

/** Bull defaultJobOptions'dan gelen attempts sayısı */
const MAX_ATTEMPTS = 3;

@Processor(QUEUE_NAMES.LOYALTY_EARN)
export class LoyaltyProcessor {
  private readonly logger = new Logger(LoyaltyProcessor.name);

  constructor(
    private readonly loyalty:    LoyaltyService,
    private readonly failedJobs: FailedJobService,
  ) {}

  @Process('earn-points')
  async handleEarnPoints(job: Job<EarnFromAppointmentPayload>): Promise<void> {
    this.logger.log(
      `[LoyaltyProcessor] İşleniyor: jobId=${job.id} | key=${job.data.idempotencyKey}`,
    );

    await this.loyalty.earnFromAppointment(job.data);

    this.logger.log(`[LoyaltyProcessor] Tamamlandı: jobId=${job.id}`);
  }

  /**
   * Faz 13 — DLQ Handler
   * Her başarısız deneme sonrası çalışır.
   * Tüm retry'lar tükendikten sonra (attemptsMade >= MAX_ATTEMPTS) kalıcı olarak kaydeder.
   */
  @OnQueueFailed()
  async onFailed(job: Job<EarnFromAppointmentPayload>, err: Error): Promise<void> {
    this.logger.warn(
      `[LoyaltyProcessor] Job başarısız: jobId=${job.id} ` +
      `attempt=${job.attemptsMade}/${MAX_ATTEMPTS} err=${err.message}`,
    );

    // Tüm retry'lar tükendiyse DLQ'ya kaydet
    if (job.attemptsMade >= MAX_ATTEMPTS) {
      await this.failedJobs.save({
        queueName: QUEUE_NAMES.LOYALTY_EARN,
        jobName:   'earn-points',
        jobId:     String(job.id),
        jobData:   job.data as unknown as Record<string, unknown>,
        errorMsg:  err.message,
        attempts:  job.attemptsMade,
        tenantId:  job.data.tenantId,
      });
    }
  }
}
