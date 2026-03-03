/**
 * BILLING SERVICE — Abonelik Durum Makinesi
 * ──────────────────────────────────────────────────────────────────────────────
 * Tek giriş noktası: bu servis dışında status değişikliği yapılmaz.
 *
 * State Machine:
 *   TRIAL ──(trialEndsAt geçti)──► PAST_DUE
 *   PAST_DUE ──(graceUntil geçti)──► SUSPENDED
 *   PAST_DUE / SUSPENDED ──(ödeme)──► ACTIVE
 *   ACTIVE / PAST_DUE ──(cancel)──► CANCELED
 *
 * Tenant oluşturulunca (AuthService.register):
 *   - status = TRIAL
 *   - trialEndsAt = now + 7 gün
 *   - graceUntil  = trialEndsAt + 3 gün
 * ──────────────────────────────────────────────────────────────────────────────
 */

import {
  Injectable,
  Logger,
  NotFoundException,
  ConflictException,
} from '@nestjs/common';
import { BillingStatus, BillingCycle, TenantPlan, UsageEventType, Prisma } from '@prisma/client';

import { PrismaService }        from '../../common/prisma.service';
import { EntitlementsService }  from './entitlements.service';
import { getPlanEntry }         from './plan.catalog'; // activate() içinde plan bazlı SMS/AI hesabı için

// ── Sabitler ──────────────────────────────────────────────────────────────────

const TRIAL_DAYS  = 7;
const GRACE_DAYS  = 3;

// ── Servis ────────────────────────────────────────────────────────────────────

@Injectable()
export class BillingService {
  private readonly logger = new Logger(BillingService.name);

  constructor(
    private readonly prisma:          PrismaService,
    private readonly entitlements:    EntitlementsService,
  ) {}

  // ═══════════════════════════════════════════════════════════════════════════
  // INIT — Tenant oluşturulunca TenantBilling kaydını açar
  // AuthService.register() ana $transaction tamamlandıktan sonra çağırır.
  // ═══════════════════════════════════════════════════════════════════════════
  async initTrial(tenantId: string): Promise<void> {
    const now          = new Date();
    const trialEndsAt  = addDays(now, TRIAL_DAYS);
    const graceUntil   = addDays(trialEndsAt, GRACE_DAYS);
    const periodEnd    = addDays(now, 30); // ilk deneme dönemi

    await this.prisma.tenantBilling.create({
      data: {
        tenantId,
        plan:               'SOLO',
        cycle:              'MONTHLY',
        status:             'TRIAL',
        trialEndsAt,
        graceUntil,
        currentPeriodStart: now,
        currentPeriodEnd:   periodEnd,
        provider:           'NONE',
      },
    });

    // İlk kullanım dönemi oluştur (TRIAL override kotaları)
    await this.prisma.usagePeriod.create({
      data: {
        tenantId,
        periodStart: now,
        periodEnd,
        smsIncluded: 50,   // TRIAL override
        aiIncluded:  20,   // TRIAL override
      },
    });

    this.logger.log(
      `[Billing] TRIAL başlatıldı: tenantId=${tenantId} trialEndsAt=${trialEndsAt.toISOString()}`,
    );
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // ACTIVATE — Ödeme alındı (manuel simülasyon veya webhook)
  // ═══════════════════════════════════════════════════════════════════════════
  async activate(
    tenantId:               string,
    providerSubscriptionId?: string,
    cycle:                  BillingCycle = 'MONTHLY',
  ): Promise<void> {
    const billing = await this.requireBilling(tenantId);
    const now     = new Date();
    const days    = cycle === 'YEARLY' ? 365 : 30;
    const periodEnd = addDays(now, days);

    await this.prisma.tenantBilling.update({
      where: { tenantId },
      data: {
        status:                'ACTIVE',
        cycle,
        lastPaymentAt:         now,
        currentPeriodStart:    now,
        currentPeriodEnd:      periodEnd,
        providerSubscriptionId: providerSubscriptionId ?? billing.providerSubscriptionId,
      },
    });

    // Yeni kullanım dönemi oluştur (mevcut dönemi kapat)
    const planEntry = getPlanEntry(billing.plan);
    await this.prisma.usagePeriod.create({
      data: {
        tenantId,
        periodStart: now,
        periodEnd,
        smsIncluded: planEntry.includedUsage.smsIncluded,
        aiIncluded:  planEntry.includedUsage.aiIncluded,
      },
    });

    await this.entitlements.invalidate(tenantId);
    this.logger.log(`[Billing] ACTIVE: tenantId=${tenantId}`);
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // MARK PAST DUE — Ödeme gecikmesi (cron veya webhook)
  // ═══════════════════════════════════════════════════════════════════════════
  async markPastDue(tenantId: string): Promise<void> {
    await this.requireBilling(tenantId);

    await this.prisma.tenantBilling.update({
      where: { tenantId },
      data:  { status: 'PAST_DUE' },
    });

    await this.entitlements.invalidate(tenantId);
    this.logger.warn(`[Billing] PAST_DUE: tenantId=${tenantId}`);
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // SUSPEND — Grace süresi doldu
  // ═══════════════════════════════════════════════════════════════════════════
  async suspend(tenantId: string): Promise<void> {
    await this.requireBilling(tenantId);

    await this.prisma.tenantBilling.update({
      where: { tenantId },
      data:  { status: 'SUSPENDED' },
    });

    await this.entitlements.invalidate(tenantId);
    this.logger.warn(`[Billing] SUSPENDED: tenantId=${tenantId}`);
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // CANCEL — Abonelik iptal
  // ═══════════════════════════════════════════════════════════════════════════
  async cancel(tenantId: string): Promise<void> {
    await this.requireBilling(tenantId);

    await this.prisma.tenantBilling.update({
      where: { tenantId },
      data: {
        status:           'CANCELED',
        cancelAtPeriodEnd: true,
      },
    });

    await this.entitlements.invalidate(tenantId);
    this.logger.warn(`[Billing] CANCELED: tenantId=${tenantId}`);
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // SET PLAN — Plan değiştirme (admin)
  // ═══════════════════════════════════════════════════════════════════════════
  async setPlan(tenantId: string, plan: TenantPlan): Promise<void> {
    await this.requireBilling(tenantId);

    await this.prisma.$transaction(async (tx) => {
      await tx.tenantBilling.update({
        where: { tenantId },
        data:  { plan },
      });
      // Tenant.plan'ı da güncelle (JWT claim kaynağı)
      await tx.tenant.update({
        where: { id: tenantId },
        data:  { plan },
      });
    });

    await this.entitlements.invalidate(tenantId);
    this.logger.log(`[Billing] Plan güncellendi: tenantId=${tenantId} plan=${plan}`);
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // SET STATUS — Genel durum geçişi (cron ve admin tarafından kullanılır)
  // ═══════════════════════════════════════════════════════════════════════════
  async setStatus(tenantId: string, status: BillingStatus, reason?: string): Promise<void> {
    await this.requireBilling(tenantId);

    await this.prisma.tenantBilling.update({
      where: { tenantId },
      data:  { status },
    });

    await this.entitlements.invalidate(tenantId);
    this.logger.log(
      `[Billing] Status: tenantId=${tenantId} → ${status}${reason ? ` (${reason})` : ''}`,
    );
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // GET BILLING — Tek tenant için durum bilgisi
  // ═══════════════════════════════════════════════════════════════════════════
  async getBilling(tenantId: string) {
    return this.requireBilling(tenantId);
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // LIST BILLINGS — Admin: durum filtreli liste
  // ═══════════════════════════════════════════════════════════════════════════
  async listBillings(statusFilter?: BillingStatus) {
    return this.prisma.tenantBilling.findMany({
      where:  statusFilter ? { status: statusFilter } : undefined,
      include: { tenant: { select: { name: true, slug: true } } },
      orderBy: { createdAt: 'desc' },
    });
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // RECORD USAGE — Atomik kullanım kaydı (UsageEvent + UsagePeriod increment)
  // ═══════════════════════════════════════════════════════════════════════════
  /**
   * Kullanım olayını atomik şekilde kaydeder:
   *   1. UsageEvent oluştur (idempotencyKey UNIQUE constraint)
   *   2. Aynı transaction içinde UsagePeriod kotasını artır
   *
   * İdempotency (Finansal Kalkan):
   *   - externalId sağlanmışsa ve aynı externalId daha önce kaydedildiyse
   *     Prisma P2002 (unique constraint) hatası fırlar.
   *   - Bu hata sessizce yakalanır → çifte sayım engellenir.
   *
   * @param tenantId       Tenant kimliği
   * @param type           'SMS_SENT' | 'AI_CALL' | diğer enum değerleri
   * @param units          Tüketilen birim sayısı
   * @param idempotencyKey API isteği idempotency anahtarı (zorunlu, UNIQUE)
   * @param externalId     Dış servis işlem ID'si (opsiyonel, UNIQUE) — çifte sayım kalkanı
   * @returns              Oluşturulan UsageEvent kaydı veya null (idempotent tekrar)
   */
  async recordUsage(
    tenantId:       string,
    type:           UsageEventType,
    units:          number,
    idempotencyKey: string,
    externalId?:    string,
  ) {
    // Provider ID yoksa deterministik fallback üret (her zaman aynı → idempotent)
    const resolvedExternalId = externalId ?? `internal:${idempotencyKey}`;

    try {
      return await this.prisma.$transaction(async (tx) => {
        // 1. UsageEvent oluştur — idempotencyKey veya externalId çakışırsa P2002
        const event = await tx.usageEvent.create({
          data: {
            tenantId,
            type,
            units,
            idempotencyKey,
            externalId: resolvedExternalId,
          },
        });

        // 2. Aktif UsagePeriod kotasını artır (aynı transaction)
        const field: 'smsUsed' | 'aiUsed' =
          type === UsageEventType.SMS ? 'smsUsed' : 'aiUsed';

        const period = await tx.usagePeriod.findFirst({
          where: {
            tenantId,
            periodStart: { lte: new Date() },
            periodEnd:   { gte: new Date() },
          },
          orderBy: { periodStart: 'desc' },
        });

        if (period) {
          await tx.usagePeriod.update({
            where: { id: period.id },
            data:  { [field]: { increment: units } },
          });
        }

        return event;
      });
    } catch (err) {
      // P2002: Unique constraint violation — idempotent tekrar
      // RESTful idempotency: ilk başarılı işlemin sonucunu (mevcut kaydı) dön
      if (
        err instanceof Prisma.PrismaClientKnownRequestError &&
        err.code === 'P2002'
      ) {
        this.logger.warn(
          `[Usage] Idempotent tekrar (P2002): tenantId=${tenantId} type=${type} ` +
          `idempotencyKey=${idempotencyKey} externalId=${resolvedExternalId} — mevcut kayıt dönülüyor`,
        );
        // İlk başarılı kaydı idempotencyKey veya externalId ile bul ve dön
        const existing = await this.prisma.usageEvent.findFirst({
          where: {
            OR: [
              { idempotencyKey },
              { externalId: resolvedExternalId },
            ],
          },
        });
        return existing;
      }
      throw err;
    }
  }

  // ── Yardımcı ────────────────────────────────────────────────────────────────

  private async requireBilling(tenantId: string) {
    const billing = await this.prisma.tenantBilling.findUnique({
      where: { tenantId },
    });
    if (!billing) {
      throw new NotFoundException(`TenantBilling bulunamadı: ${tenantId}`);
    }
    return billing;
  }
}

// ── Util ─────────────────────────────────────────────────────────────────────

function addDays(date: Date, days: number): Date {
  const d = new Date(date);
  d.setDate(d.getDate() + days);
  return d;
}
