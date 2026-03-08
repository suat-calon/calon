import { Module }                          from '@nestjs/common';
import { AppointmentController }          from './appointment/appointment.controller';
import { AppointmentService }             from './appointment/appointment.service';
import { AppointmentLockService }         from './appointment/appointment-lock.service';
import { AppointmentAvailabilityService } from './appointment/appointment-availability.service';
import { FinanceModule }                  from '../finance/finance.module';
import { StaffModule }                    from '../staff/staff.module';

/**
 * OPERATIONS MODULE
 * ─────────────────────────────────────────────────────────────────────────────
 * Randevu, müşteri ve personel işlemlerini kapsar.
 *
 * Not: BullMQ kuyruğu (STOCK_DEDUCT, LOYALTY_EARN) ve REDIS_CLIENT,
 * RedisModule @Global() tarafından sağlandığından burada yeniden kayıt gerekmez.
 *
 * FinanceModule importu: AppointmentService → LedgerService bağımlılığı
 * StaffModule importu:   AppointmentService → CommissionService bağımlılığı
 *
 * Faz 14:
 *   AppointmentLockService         — Redis SETNX tabanlı Soft-Lock + Concurrency Lock
 *   AppointmentAvailabilityService — Redis cache tabanlı takvim sorgu optimizasyonu
 * ─────────────────────────────────────────────────────────────────────────────
 */
@Module({
  imports:     [FinanceModule, StaffModule],
  controllers: [AppointmentController],
  providers:   [
    AppointmentService,
    AppointmentLockService,
    AppointmentAvailabilityService,
  ],
  // PublicModule tarafından kullanılır (Faz 16 + Faz 20)
  exports: [AppointmentService, AppointmentAvailabilityService, AppointmentLockService],
})
export class OperationsModule {}
