/**
 * BILLING ADMIN CONTROLLER — Platform Yönetici API'si
 * ──────────────────────────────────────────────────────────────────────────────
 * Sadece SUPER_ADMIN rolü erişebilir.
 * Ödeme simülasyonu (activate/suspend/set-plan) ve tenant listesi.
 *
 * Base: /api/v1/admin/billing
 * ──────────────────────────────────────────────────────────────────────────────
 */

import {
  Controller,
  Get,
  Post,
  Param,
  Query,
  Body,
  ForbiddenException,
  Req,
  ParseUUIDPipe,
  HttpCode,
  HttpStatus,
} from '@nestjs/common';
import { IsEnum, IsOptional, IsString } from 'class-validator';
import { BillingStatus, TenantPlan } from '@prisma/client';

import { BillingService }        from '../billing/billing.service';
import { BillingCron }           from '../billing/billing.cron';
import { EntitlementsService }   from '../billing/entitlements.service';

// ── DTO'lar ───────────────────────────────────────────────────────────────────

class SetPlanDto {
  @IsEnum(TenantPlan)
  plan!: TenantPlan;
}

class ActivateDto {
  @IsOptional()
  @IsString()
  providerSubscriptionId?: string;

  @IsOptional()
  @IsEnum(['MONTHLY', 'YEARLY'])
  cycle?: 'MONTHLY' | 'YEARLY';
}

// ── Controller ────────────────────────────────────────────────────────────────

@Controller('admin/billing')
export class BillingAdminController {
  constructor(
    private readonly billing:      BillingService,
    private readonly cron:         BillingCron,
    private readonly entitlements: EntitlementsService,
  ) {}

  // ── Süper admin yetki kontrolü ────────────────────────────────────────────
  private assertSuperAdmin(req: { userRole?: string }): void {
    if (req.userRole !== 'SUPER_ADMIN') {
      throw new ForbiddenException('Bu endpoint yalnızca SUPER_ADMIN için erişilebilir.');
    }
  }

  // ── GET /admin/billing/tenants?status= ───────────────────────────────────
  @Get('tenants')
  async listTenants(
    @Req()    req: { userRole?: string },
    @Query('status') status?: string,
  ) {
    this.assertSuperAdmin(req);
    const statusFilter = status as BillingStatus | undefined;
    return this.billing.listBillings(statusFilter);
  }

  // ── POST /admin/billing/tenants/:id/activate ─────────────────────────────
  @Post('tenants/:id/activate')
  @HttpCode(HttpStatus.OK)
  async activate(
    @Req()    req: { userRole?: string },
    @Param('id', ParseUUIDPipe) tenantId: string,
    @Body() dto: ActivateDto,
  ) {
    this.assertSuperAdmin(req);
    await this.billing.activate(
      tenantId,
      dto.providerSubscriptionId,
      dto.cycle ?? 'MONTHLY',
    );
    return { success: true, tenantId, status: 'ACTIVE' };
  }

  // ── POST /admin/billing/tenants/:id/suspend ──────────────────────────────
  @Post('tenants/:id/suspend')
  @HttpCode(HttpStatus.OK)
  async suspend(
    @Req()    req: { userRole?: string },
    @Param('id', ParseUUIDPipe) tenantId: string,
  ) {
    this.assertSuperAdmin(req);
    await this.billing.suspend(tenantId);
    return { success: true, tenantId, status: 'SUSPENDED' };
  }

  // ── POST /admin/billing/tenants/:id/set-plan ─────────────────────────────
  @Post('tenants/:id/set-plan')
  @HttpCode(HttpStatus.OK)
  async setPlan(
    @Req()    req: { userRole?: string },
    @Param('id', ParseUUIDPipe) tenantId: string,
    @Body() dto: SetPlanDto,
  ) {
    this.assertSuperAdmin(req);
    await this.billing.setPlan(tenantId, dto.plan);
    return { success: true, tenantId, plan: dto.plan };
  }

  // ── POST /admin/billing/tenants/:id/mark-past-due ────────────────────────
  @Post('tenants/:id/mark-past-due')
  @HttpCode(HttpStatus.OK)
  async markPastDue(
    @Req()    req: { userRole?: string },
    @Param('id', ParseUUIDPipe) tenantId: string,
  ) {
    this.assertSuperAdmin(req);
    await this.billing.markPastDue(tenantId);
    return { success: true, tenantId, status: 'PAST_DUE' };
  }

  // ── GET /admin/billing/tenants/:id ───────────────────────────────────────
  @Get('tenants/:id')
  async getTenant(
    @Req()    req: { userRole?: string },
    @Param('id', ParseUUIDPipe) tenantId: string,
  ) {
    this.assertSuperAdmin(req);
    return this.billing.getBilling(tenantId);
  }

  // ── POST /admin/billing/cron/run-now ─────────────────────────────────────
  /** Test / debug: Cron geçişlerini anında tetikle */
  @Post('cron/run-now')
  @HttpCode(HttpStatus.OK)
  async runCronNow(@Req() req: { userRole?: string }) {
    this.assertSuperAdmin(req);
    const result = await this.cron.runNow();
    return { success: true, ...result };
  }

  // ── POST /admin/billing/tenants/:id/invalidate-cache ─────────────────────
  /** Entitlements cache'ini zorla geçersiz kıl */
  @Post('tenants/:id/invalidate-cache')
  @HttpCode(HttpStatus.OK)
  async invalidateCache(
    @Req()    req: { userRole?: string },
    @Param('id', ParseUUIDPipe) tenantId: string,
  ) {
    this.assertSuperAdmin(req);
    await this.entitlements.invalidate(tenantId);
    return { success: true, tenantId };
  }
}
