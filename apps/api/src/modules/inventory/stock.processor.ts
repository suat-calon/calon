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
 * ─────────────────────────────────────────────────────────────────────────────
 */

import { Process, Processor } from '@nestjs/bull';
import { Logger }             from '@nestjs/common';
import { Job }                from 'bull';

import { QUEUE_NAMES }  from '../../common/redis.module';
import { StockService } from './stock.service';

/** Faz 2 appointment.service.ts'nin kuyruğa gönderdiği payload shape'i */
interface DeductStockPayload {
  appointmentId: string;
  tenantId:      string;
  serviceId:     string;
}

@Processor(QUEUE_NAMES.STOCK_DEDUCT)   // 'stock-deduct'
export class StockProcessor {
  private readonly logger = new Logger(StockProcessor.name);

  constructor(private readonly stockService: StockService) {}

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
}
