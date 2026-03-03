/**
 * STOCK PROCESSOR — BullMQ 'stock-deduct' kuyruğu işçisi
 * ─────────────────────────────────────────────────────────────────────────────
 * Faz 2 AppointmentService.updateStatus() → COMPLETED → kuyruğa eklenen
 * 'deduct-stock' job'larını tüketir.
 *
 * Hata yönetimi:
 *   RedisModule'de tanımlı defaultJobOptions: attempts:3, backoff:exponential(1s)
 *   StockService.deductForAppointment() idempotent olduğu için
 *   retry'lar güvenle tekrarlanabilir.
 *
 * Faz 13: @OnQueueFailed → tüm retry'lar tükendikten sonra DLQ'ya kaydeder.
 * ─────────────────────────────────────────────────────────────────────────────
 */

import { Process, Processor, OnQueueFailed } from '@nestjs/bull';
import { Logger }                            from '@nestjs/common';
import { Job }                               from 'bull';

import { QUEUE_NAMES }    from '../../common/redis.module';
import { StockService }   from './stock.service';
import { FailedJobService } from '../../common/queue/failed-job.service';

/** Faz 2 appointment.service.ts'nin kuyruğa gönderdiği payload shape'i */
interface DeductStockPayload {
  appointmentId: string;
  tenantId:      string;
  serviceId:     string;
}

/** Bull defaultJobOptions'dan gelen attempts sayısı */
const MAX_ATTEMPTS = 3;

@Processor(QUEUE_NAMES.STOCK_DEDUCT)   // 'stock-deduct'
export class StockProcessor {
  private readonly logger = new Logger(StockProcessor.name);

  constructor(
    private readonly stockService: StockService,
    private readonly failedJobs:  FailedJobService,
  ) {}

  @Process('deduct-stock')   // job name — appointment.service.ts: queue.add('deduct-stock', …)
  async handleDeductStock(job: Job<DeductStockPayload>): Promise<void> {
    const { appointmentId, tenantId, serviceId } = job.data;

    this.logger.log(
      `[Worker] Job #${job.id} alındı: stok düşümü randevu=${appointmentId}`,
    );

    await this.stockService.deductForAppointment(appointmentId, tenantId, serviceId);

    this.logger.log(
      `[Worker] Job #${job.id} tamamlandı: randevu=${appointmentId}`,
    );
  }

  /**
   * Faz 13 — DLQ Handler
   * Tüm retry'lar tükendikten sonra (attemptsMade >= MAX_ATTEMPTS) DLQ'ya kaydeder.
   */
  @OnQueueFailed()
  async onFailed(job: Job<DeductStockPayload>, err: Error): Promise<void> {
    this.logger.warn(
      `[StockProcessor] Job başarısız: jobId=${job.id} ` +
      `attempt=${job.attemptsMade}/${MAX_ATTEMPTS} err=${err.message}`,
    );

    if (job.attemptsMade >= MAX_ATTEMPTS) {
      await this.failedJobs.save({
        queueName: QUEUE_NAMES.STOCK_DEDUCT,
        jobName:   'deduct-stock',
        jobId:     String(job.id),
        jobData:   job.data as unknown as Record<string, unknown>,
        errorMsg:  err.message,
        attempts:  job.attemptsMade,
        tenantId:  job.data.tenantId,
      });
    }
  }
}
