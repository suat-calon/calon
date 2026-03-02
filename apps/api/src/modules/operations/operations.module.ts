import { Module }               from '@nestjs/common';
import { AppointmentController } from './appointment/appointment.controller';
import { AppointmentService }    from './appointment/appointment.service';
import { FinanceModule }         from '../finance/finance.module';

/**
 * OPERATIONS MODULE
 * ─────────────────────────────────────────────────────────────────────────────
 * Randevu, müşteri ve personel işlemlerini kapsar.
 *
 * Not: BullMQ kuyruğu (STOCK_DEDUCT) RedisModule @Global() tarafından
 * sağlandığından burada yeniden kayıt gerekmez.
 *
 * FinanceModule importu: AppointmentService → LedgerService bağımlılığı
 * için (Faz 6 Adım 3 — XState COMPLETED → Ledger entegrasyonu).
 * ─────────────────────────────────────────────────────────────────────────────
 */
@Module({
  imports:     [FinanceModule],          // LedgerService → AppointmentService'e açılır
  controllers: [AppointmentController],
  providers:   [AppointmentService],
})
export class OperationsModule {}
