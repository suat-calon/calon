/**
 * LOYALTY PROCESSOR — BullMQ Consumer (loyalty-earn kuyruğu)
 * ──────────────────────────────────────────────────────────────────────────────
 * Appointment COMPLETED → AppointmentService → loyaltyQueue.add('earn-points', payload)
 *   → Bu processor çalışır → LoyaltyService.earnFromAppointment()
 *
 * İdempotency: LoyaltyService.earnFromAppointment() içinde idempotencyKey UNIQUE
 * kısıtı ile korunur; BullMQ retry'larında çift puan verilmez.
 * ──────────────────────────────────────────────────────────────────────────────
 */

import { Logger }            from '@nestjs/common';
import { Processor, Process } from '@nestjs/bull';
import { Job }               from 'bull';

import { QUEUE_NAMES }            from '../../common/redis.module';
import { LoyaltyService, EarnFromAppointmentPayload } from './loyalty.service';

@Processor(QUEUE_NAMES.LOYALTY_EARN)
export class LoyaltyProcessor {
  private readonly logger = new Logger(LoyaltyProcessor.name);

  constructor(private readonly loyalty: LoyaltyService) {}

  @Process('earn-points')
  async handleEarnPoints(job: Job<EarnFromAppointmentPayload>): Promise<void> {
    this.logger.log(
      `[LoyaltyProcessor] İşleniyor: jobId=${job.id} | key=${job.data.idempotencyKey}`,
    );

    await this.loyalty.earnFromAppointment(job.data);

    this.logger.log(`[LoyaltyProcessor] Tamamlandı: jobId=${job.id}`);
  }
}
