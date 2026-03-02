import { Module }                  from '@nestjs/common';
import { AppointmentController }   from './appointment/appointment.controller';
import { AppointmentService }      from './appointment/appointment.service';
import { AppointmentLockService }  from './appointment/appointment-lock.service';
import { FinanceModule }           from '../finance/finance.module';

/**
 * OPERATIONS MODULE
 * ─────────────────────────────────────────────────────────────────────────────
 * Randevu, müşteri ve personel işlemlerini kapsar.
 *
 * Not: BullMQ kuyruğu (STOCK_DEDUCT) ve REDIS_CLIENT, RedisModule @Global()
 * tarafından sağlandığından burada yeniden kayıt gerekmez.
 *
 * FinanceModule importu: AppointmentService → LedgerService bağımlılığı
 * için (Faz 6 Adım 3 — XState COMPLETED → Ledger entegrasyonu).
 *
 * AppointmentLockService: Redis SETNX tabanlı Soft-Lock (Faz 8 Adım 1-2).
 * ─────────────────────────────────────────────────────────────────────────────
 */
@Module({
  imports:     [FinanceModule],
  controllers: [AppointmentController],
  providers:   [AppointmentService, AppointmentLockService],
})
export class OperationsModule {}
