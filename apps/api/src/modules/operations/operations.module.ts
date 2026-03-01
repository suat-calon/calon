import { Module } from '@nestjs/common';
import { AppointmentController } from './appointment/appointment.controller';
import { AppointmentService }    from './appointment/appointment.service';

/**
 * OPERATIONS MODULE
 * ─────────────────────────────────────────────────────────────────────────────
 * Randevu, müşteri ve personel işlemlerini kapsar.
 *
 * Not: BullMQ kuyruğu (STOCK_DEDUCT) RedisModule @Global() tarafından
 * sağlandığından burada yeniden kayıt gerekmez.
 * ─────────────────────────────────────────────────────────────────────────────
 */
@Module({
  controllers: [AppointmentController],
  providers:   [AppointmentService],
})
export class OperationsModule {}
