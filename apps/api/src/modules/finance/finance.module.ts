/**
 * FINANCE MODULE — Finans Çekirdeği
 * ─────────────────────────────────────────────────────────────────────────────
 * İçerik:
 *   • LedgerService  — Değiştirilemez finansal defter (Append-Only)
 *   • PaymentService — Atomik kaparo alma ve hesap kapatma işlemleri
 *   • PaymentController — REST API uç noktaları (Idempotency korumalı)
 *
 * Exports:
 *   • LedgerService — OperationsModule → AppointmentService tarafından
 *     COMPLETED hook'ta kullanılır (XState entegrasyonu — Faz 6 Adım 3)
 *
 * Bağımlılıklar (Global modüllerden):
 *   • PrismaService  → DatabaseModule @Global()
 *   • BullMQ Queue   → RedisModule @Global()
 * ─────────────────────────────────────────────────────────────────────────────
 */

import { Module }            from '@nestjs/common';
import { LedgerService }     from './ledger.service';
import { PaymentService }    from './payment.service';
import { PaymentController } from './payment.controller';

@Module({
  controllers: [PaymentController],
  providers:   [LedgerService, PaymentService],
  exports:     [LedgerService],   // AppointmentService (OperationsModule) tarafından kullanılır
})
export class FinanceModule {}
