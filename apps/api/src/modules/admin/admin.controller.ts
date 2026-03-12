/**
 * ADMIN CONTROLLER — Super Admin Tenant Yönetim API'si
 * ──────────────────────────────────────────────────────────────────────────────
 * Base: /api/v1/admin/tenants
 *
 * Güvenlik katmanı:
 *   @Public()     → global TenantGuard + BillingGuard'ı atlar
 *   @UseGuards(AdminGuard) → x-admin-api-key header doğrulama
 *
 * Tüm mutasyonlar AdminService üzerinden AuditLog yazar.
 * ──────────────────────────────────────────────────────────────────────────────
 */

import {
  Controller,
  Get,
  Post,
  Param,
  Query,
  Body,
  ParseUUIDPipe,
  ParseIntPipe,
  HttpCode,
  HttpStatus,
  UseGuards,
  DefaultValuePipe,
} from '@nestjs/common';
import { IsEnum, IsOptional, IsIn } from 'class-validator';
import { BillingStatus, TenantPlan }   from '@prisma/client';

import { Public }       from '../iam/guards/tenant.guard';
import { AdminGuard }   from './admin.guard';
import { AdminService } from './admin.service';

// ── DTO'lar ───────────────────────────────────────────────────────────────────

class SetPlanBodyDto {
  @IsEnum(TenantPlan)
  plan!: TenantPlan;
}

class ActivateBodyDto {
  @IsOptional()
  @IsIn(['MONTHLY', 'YEARLY'])
  cycle?: 'MONTHLY' | 'YEARLY';
}

// ── Yardımcı: standart yanıt sarmalayıcı ─────────────────────────────────────

function ok<T>(data: T): { success: true; data: T } {
  return { success: true, data };
}

// ── Controller ────────────────────────────────────────────────────────────────

@Public()
@UseGuards(AdminGuard)
@Controller('admin/tenants')
export class AdminController {
  constructor(private readonly admin: AdminService) {}

  // ── GET /admin/tenants ────────────────────────────────────────────────────
  /**
   * Tüm tenant'ları listeler.
   * ?page=1 &limit=20 &status=ACTIVE &plan=PRO
   */
  @Get()
  async listTenants(
    @Query('page',  new DefaultValuePipe(1),  ParseIntPipe) page:   number,
    @Query('limit', new DefaultValuePipe(20), ParseIntPipe) limit:  number,
    @Query('status') status?: string,
    @Query('plan')   plan?:   string,
  ) {
    // Clamp limit: 1 – 100
    const safeLimit = Math.min(Math.max(limit, 1), 100);

    const result = await this.admin.listTenants({
      page,
      limit:   safeLimit,
      status:  status as BillingStatus | undefined,
      plan:    plan   as TenantPlan    | undefined,
    });

    return ok(result);
  }

  // ── GET /admin/tenants/:tenantId ──────────────────────────────────────────
  /**
   * Tek tenant detayı:
   *   identity · billing · recentAttempts · latestActivity · currentUsage
   */
  @Get(':tenantId')
  async getTenantDetail(
    @Param('tenantId', ParseUUIDPipe) tenantId: string,
  ) {
    const result = await this.admin.getTenantDetail(tenantId);
    return ok(result);
  }

  // ── POST /admin/tenants/:tenantId/suspend ─────────────────────────────────
  /**
   * Tenant'ı SUSPENDED durumuna alır.
   * BillingService.suspend() + AuditLog (ADMIN_SUSPEND) atomik.
   */
  @Post(':tenantId/suspend')
  @HttpCode(HttpStatus.OK)
  async suspendTenant(
    @Param('tenantId', ParseUUIDPipe) tenantId: string,
  ) {
    await this.admin.suspendTenant(tenantId);
    return ok({ tenantId, status: 'SUSPENDED' });
  }

  // ── POST /admin/tenants/:tenantId/activate ────────────────────────────────
  /**
   * Tenant'ı ACTIVE durumuna alır.
   * Body: { cycle?: "MONTHLY" | "YEARLY" }  (default: "MONTHLY")
   * BillingService.activate() + AuditLog (ADMIN_ACTIVATE) atomik.
   */
  @Post(':tenantId/activate')
  @HttpCode(HttpStatus.OK)
  async activateTenant(
    @Param('tenantId', ParseUUIDPipe) tenantId: string,
    @Body() dto: ActivateBodyDto,
  ) {
    await this.admin.activateTenant(tenantId, dto.cycle ?? 'MONTHLY');
    return ok({ tenantId, status: 'ACTIVE', cycle: dto.cycle ?? 'MONTHLY' });
  }

  // ── POST /admin/tenants/:tenantId/plan ────────────────────────────────────
  /**
   * Tenant planını değiştirir.
   * Body: { plan: "SOLO" | "PRO" | "TEAM" | "ENTERPRISE" }
   * BillingService.setPlan() + AuditLog (ADMIN_SET_PLAN) atomik.
   */
  @Post(':tenantId/plan')
  @HttpCode(HttpStatus.OK)
  async setPlan(
    @Param('tenantId', ParseUUIDPipe) tenantId: string,
    @Body() dto: SetPlanBodyDto,
  ) {
    await this.admin.setPlanForTenant(tenantId, dto.plan);
    return ok({ tenantId, plan: dto.plan });
  }
}
