import { Module } from '@nestjs/common';

import { StaffController }    from './staff.controller';
import { StaffService }       from './staff.service';
import { CommissionService }  from './commission.service';

/**
 * STAFF MODULE
 * ─────────────────────────────────────────────────────────────────────────────
 * Kapsam:
 *   • StaffService      — Personel profili, çalışma saatleri, vardiya CRUD
 *   • CommissionService — Hakediş hesaplama + loglama
 *
 * CommissionService export edilir → OperationsModule (AppointmentService)
 * tarafından $transaction içinde çağrılır.
 *
 * Bağımlılıklar:
 *   • PrismaService → DatabaseModule @Global() aracılığıyla erişilebilir
 * ─────────────────────────────────────────────────────────────────────────────
 */
@Module({
  controllers: [StaffController],
  providers:   [StaffService, CommissionService],
  exports:     [CommissionService],
})
export class StaffModule {}
