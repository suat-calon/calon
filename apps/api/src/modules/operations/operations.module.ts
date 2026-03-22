import { Module }                          from '@nestjs/common';
import { AppointmentController }          from './appointment/appointment.controller';
import { AppointmentService }             from './appointment/appointment.service';
import { AppointmentLockService }         from './appointment/appointment-lock.service';
import { AppointmentAvailabilityService } from './appointment/appointment-availability.service';
import { AppointmentHoldService }         from './appointment/appointment-hold.service';
import { SchedulingAvailabilityService }  from './appointment/scheduling-availability.service';
import { SchedulingCron }                 from './appointment/scheduling.cron';
import { FinanceModule }                  from '../finance/finance.module';
import { StaffModule }                    from '../staff/staff.module';
import { PrismaAppointmentRepository }   from './appointment/appointment.repository';
import { APPOINTMENT_REPO }              from './appointment/appointment.repository.interface';

/**
 * OPERATIONS MODULE
 * ─────────────────────────────────────────────────────────────────────────────
 * Randevu, müşteri ve personel işlemlerini kapsar.
 *
 * Not: BullMQ kuyruğu (STOCK_DEDUCT, LOYALTY_EARN) ve REDIS_CLIENT,
 * RedisModule @Global() tarafından sağlandığından burada yeniden kayıt gerekmez.
 *
 * ScheduleModule: BillingModule @Global() içinde forRoot() ile kayıtlı —
 * buraya tekrar import gerekmez; @Cron() dekoratörleri otomatik çalışır.
 *
 * FinanceModule importu: AppointmentService → LedgerService bağımlılığı
 * StaffModule importu:   AppointmentService → CommissionService bağımlılığı
 *
 * Faz 14:
 *   AppointmentLockService         — Redis SETNX tabanlı Soft-Lock + Concurrency Lock
 *   AppointmentAvailabilityService — Redis cache tabanlı takvim sorgu optimizasyonu
 *
 * Faz 23:
 *   AppointmentHoldService         — DB-backed slot kilidi (Redis NX + GIST EXCLUDE)
 *   SchedulingAvailabilityService  — Timezone-aware, shift-aware, hold-aware slot motoru
 *   SchedulingCron                 — Hold sona erme tarayıcısı (her 5 dakikada bir)
 * ─────────────────────────────────────────────────────────────────────────────
 */
@Module({
  imports:     [FinanceModule, StaffModule],
  controllers: [AppointmentController],
  providers:   [
    AppointmentService,
    AppointmentLockService,
    AppointmentAvailabilityService,
    AppointmentHoldService,         // Faz 23
    SchedulingAvailabilityService,  // Faz 23
    SchedulingCron,                 // Faz 23 — cron is module-internal, not exported
    {
      provide:  APPOINTMENT_REPO,
      useClass: PrismaAppointmentRepository,
    },
  ],
  // PublicModule tarafından kullanılır (Faz 16 + Faz 20 + Faz 23)
  exports: [
    AppointmentService,
    AppointmentAvailabilityService,
    AppointmentLockService,
    AppointmentHoldService,         // Faz 23 — PublicService.acquireHold / releaseHold
    SchedulingAvailabilityService,  // Faz 23 — PublicService.getAvailability
  ],
})
export class OperationsModule {}
