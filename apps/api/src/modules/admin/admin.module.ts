/**
 * ADMIN MODULE — Super Admin Platform
 * ──────────────────────────────────────────────────────────────────────────────
 * Bağımlılıklar:
 *   • PrismaService   — DatabaseModule (@Global) üzerinden erişilebilir
 *   • BillingService  — BillingModule  (@Global) üzerinden erişilebilir
 *
 * Global import gerektirmez — mevcut global modüller yeterli.
 *
 * AdminController: GET/POST /api/v1/admin/tenants/**
 * AdminGuard:      x-admin-api-key header kontrolü
 * AdminService:    İş mantığı + AuditLog yazımı
 * ──────────────────────────────────────────────────────────────────────────────
 */

import { Module } from '@nestjs/common';

import { AdminGuard }      from './admin.guard';
import { AdminService }    from './admin.service';
import { AdminController } from './admin.controller';

@Module({
  providers:   [AdminGuard, AdminService],
  controllers: [AdminController],
})
export class AdminModule {}
