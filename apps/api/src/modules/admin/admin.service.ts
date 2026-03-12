/**
 * ADMIN SERVICE — Super Admin Platform İş Katmanı
 * ──────────────────────────────────────────────────────────────────────────────
 * Tüm mutasyonlar AuditLog yazar.
 * Abonelik durum geçişleri BillingService üzerinden çalışır —
 * outbox event'leri oradan atomik olarak yazılır.
 *
 * KURAL: Müşteri PII bu servis tarafından asla yüklenmez.
 * ──────────────────────────────────────────────────────────────────────────────
 */

import {
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { BillingStatus, TenantPlan, Prisma } from '@prisma/client';

import { PrismaService }   from '../../common/prisma.service';
import { BillingService }  from '../billing/billing.service';

// ── Pagination ────────────────────────────────────────────────────────────────

export interface TenantListOptions {
  status?: BillingStatus;
  plan?:   TenantPlan;
  page:    number;
  limit:   number;
}

// ── Servis ────────────────────────────────────────────────────────────────────

@Injectable()
export class AdminService {
  private readonly logger = new Logger(AdminService.name);

  constructor(
    private readonly prisma:   PrismaService,
    private readonly billing:  BillingService,
  ) {}

  // ═══════════════════════════════════════════════════════════════════════════
  // TENANT LIST — sayfalanmış, durum/plan filtreli
  // ═══════════════════════════════════════════════════════════════════════════

  async listTenants(opts: TenantListOptions) {
    const { status, plan, page, limit } = opts;
    const skip = (page - 1) * limit;

    const billingWhere: Prisma.TenantBillingWhereInput = {
      ...(status ? { status } : {}),
      ...(plan   ? { plan }   : {}),
    };

    const hasBillingFilter = status != null || plan != null;

    const where: Prisma.TenantWhereInput = {
      isDeleted: false,
      ...(hasBillingFilter ? { billing: billingWhere } : {}),
    };

    const [tenants, total] = await Promise.all([
      this.prisma.tenant.findMany({
        where,
        skip,
        take:    limit,
        select: {
          id:        true,
          name:      true,
          slug:      true,
          plan:      true,
          createdAt: true,
          billing: {
            select: {
              status:       true,
              cycle:        true,
              trialEndsAt:  true,
              graceUntil:   true,
              lastPaymentAt: true,
            },
          },
        },
        orderBy: { createdAt: 'desc' },
      }),
      this.prisma.tenant.count({ where }),
    ]);

    return {
      items: tenants,
      total,
      page,
      limit,
      totalPages: Math.ceil(total / limit),
    };
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // TENANT DETAIL — identity + billing + son girişimler + son aktivite
  // ═══════════════════════════════════════════════════════════════════════════

  async getTenantDetail(tenantId: string) {
    const [tenant, billing, recentAttempts, latestActivity, usagePeriod] =
      await Promise.all([

        this.prisma.tenant.findFirst({
          where:  { id: tenantId, isDeleted: false },
          select: {
            id:        true,
            name:      true,
            slug:      true,
            plan:      true,
            createdAt: true,
          },
        }),

        this.prisma.tenantBilling.findUnique({
          where: { tenantId },
        }),

        this.prisma.billingAttempt.findMany({
          where:   { tenantId },
          orderBy: { createdAt: 'desc' },
          take:    5,
          select: {
            id:                true,
            plan:              true,
            cycle:             true,
            status:            true,
            amountCents:       true,
            currency:          true,
            providerPaymentId: true,
            createdAt:         true,
          },
        }),

        this.prisma.auditLog.findMany({
          where:   { tenantId },
          orderBy: { createdAt: 'desc' },
          take:    10,
          select: {
            id:         true,
            entityType: true,
            entityId:   true,
            action:     true,
            actorRole:  true,
            createdAt:  true,
          },
        }),

        this.prisma.usagePeriod.findFirst({
          where: {
            tenantId,
            periodStart: { lte: new Date() },
            periodEnd:   { gte: new Date() },
          },
          orderBy: { periodStart: 'desc' },
          select: {
            periodStart:  true,
            periodEnd:    true,
            smsIncluded:  true,
            smsUsed:      true,
            aiIncluded:   true,
            aiUsed:       true,
          },
        }),
      ]);

    if (!tenant) {
      throw new NotFoundException(`Tenant bulunamadı: ${tenantId}`);
    }

    return {
      identity:       tenant,
      billing,
      recentAttempts,
      latestActivity,
      currentUsage:   usagePeriod ?? null,
    };
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // SUSPEND — Tenant'ı askıya al
  // ═══════════════════════════════════════════════════════════════════════════

  async suspendTenant(tenantId: string): Promise<void> {
    const before = await this.requireBillingStatus(tenantId);

    await this.billing.suspend(tenantId);

    await this.writeAdminAudit(tenantId, 'ADMIN_SUSPEND', {
      before: { status: before },
      after:  { status: 'SUSPENDED' },
    });

    this.logger.warn(`[Admin] SUSPEND: tenantId=${tenantId}`);
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // ACTIVATE — Tenant'ı aktifleştir
  // ═══════════════════════════════════════════════════════════════════════════

  async activateTenant(
    tenantId: string,
    cycle: 'MONTHLY' | 'YEARLY' = 'MONTHLY',
  ): Promise<void> {
    const before = await this.requireBillingStatus(tenantId);

    await this.billing.activate(tenantId, undefined, cycle);

    await this.writeAdminAudit(tenantId, 'ADMIN_ACTIVATE', {
      before: { status: before },
      after:  { status: 'ACTIVE', cycle },
    });

    this.logger.log(`[Admin] ACTIVATE: tenantId=${tenantId} cycle=${cycle}`);
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // SET PLAN — Plan değiştir
  // ═══════════════════════════════════════════════════════════════════════════

  async setPlanForTenant(tenantId: string, plan: TenantPlan): Promise<void> {
    const billing = await this.prisma.tenantBilling.findUnique({
      where:  { tenantId },
      select: { plan: true },
    });

    if (!billing) {
      throw new NotFoundException(`TenantBilling bulunamadı: ${tenantId}`);
    }

    await this.billing.setPlan(tenantId, plan);

    await this.writeAdminAudit(tenantId, 'ADMIN_SET_PLAN', {
      before: { plan: billing.plan },
      after:  { plan },
    });

    this.logger.log(`[Admin] SET_PLAN: tenantId=${tenantId} plan=${plan}`);
  }

  // ── Özel yardımcılar ──────────────────────────────────────────────────────

  /** Billing kaydını doğrular ve mevcut durumu döner */
  private async requireBillingStatus(tenantId: string): Promise<string> {
    const billing = await this.prisma.tenantBilling.findUnique({
      where:  { tenantId },
      select: { status: true },
    });
    if (!billing) {
      throw new NotFoundException(`TenantBilling bulunamadı: ${tenantId}`);
    }
    return billing.status;
  }

  /** Admin aksiyonu için AuditLog kaydı yazar — actorId boş (API key) */
  private async writeAdminAudit(
    tenantId: string,
    action:   string,
    diff:     { before: Record<string, unknown>; after: Record<string, unknown> },
  ): Promise<void> {
    await this.prisma.auditLog.create({
      data: {
        tenantId,
        entityType: 'Tenant',
        entityId:   tenantId,
        action,
        actorRole:  'SUPER_ADMIN',
        before:     diff.before as Prisma.InputJsonValue,
        after:      diff.after  as Prisma.InputJsonValue,
      },
    });
  }
}
