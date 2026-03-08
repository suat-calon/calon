/**
 * BILLING CRON — Günlük Durum Geçiş Denetimi
 * ──────────────────────────────────────────────────────────────────────────────
 * Her gün 01:00 UTC'de çalışır:
 *   TRIAL   + now > trialEndsAt → PAST_DUE
 *   PAST_DUE + now > graceUntil  → SUSPENDED
 *
 * Geçişler BillingService.setStatus() üzerinden yapılır →
 * EntitlementsService.invalidate() otomatik çağrılır.
 * ──────────────────────────────────────────────────────────────────────────────
 */

import { Injectable, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { PrismaService }       from '../../common/prisma.service';
import { EntitlementsService } from './entitlements.service';

@Injectable()
export class BillingCron {
  private readonly logger = new Logger(BillingCron.name);

  constructor(
    private readonly prisma:       PrismaService,
    private readonly entitlements: EntitlementsService,
  ) {}

  /**
   * Her gün 01:00 UTC — TRIAL → PAST_DUE → SUSPENDED geçişlerini uygula.
   * @CronExpression.EVERY_DAY_AT_1AM = "0 1 * * *"
   */
  @Cron(CronExpression.EVERY_DAY_AT_1AM)
  async runDailyTransitions(): Promise<void> {
    const now = new Date();
    this.logger.log(`[BillingCron] Günlük geçiş denetimi başladı: ${now.toISOString()}`);

    await Promise.all([
      this.transitionTrialToPastDue(now),
      this.transitionPastDueToSuspended(now),
      this.transitionExpiredActivePeriods(now),   // Faz 22.5: period renewal
    ]);

    this.logger.log('[BillingCron] Geçiş denetimi tamamlandı.');
  }

  // ── TRIAL → PAST_DUE ──────────────────────────────────────────────────────

  private async transitionTrialToPastDue(now: Date): Promise<void> {
    const expiredTrials = await this.prisma.tenantBilling.findMany({
      where: {
        status:      'TRIAL',
        trialEndsAt: { lt: now },
      },
      select: { tenantId: true },
    });

    if (expiredTrials.length === 0) return;

    const ids = expiredTrials.map(b => b.tenantId);

    await this.prisma.tenantBilling.updateMany({
      where: { tenantId: { in: ids } },
      data:  { status: 'PAST_DUE' },
    });

    // Her biri için cache invalidate
    await Promise.all(ids.map(id => this.entitlements.invalidate(id)));

    this.logger.warn(
      `[BillingCron] TRIAL→PAST_DUE: ${ids.length} tenant (${ids.join(', ')})`,
    );
  }

  // ── PAST_DUE → SUSPENDED ─────────────────────────────────────────────────

  private async transitionPastDueToSuspended(now: Date): Promise<void> {
    const graceExpired = await this.prisma.tenantBilling.findMany({
      where: {
        status:     'PAST_DUE',
        graceUntil: { lt: now },
      },
      select: { tenantId: true },
    });

    if (graceExpired.length === 0) return;

    const ids = graceExpired.map(b => b.tenantId);

    await this.prisma.tenantBilling.updateMany({
      where: { tenantId: { in: ids } },
      data:  { status: 'SUSPENDED' },
    });

    await Promise.all(ids.map(id => this.entitlements.invalidate(id)));

    this.logger.warn(
      `[BillingCron] PAST_DUE→SUSPENDED: ${ids.length} tenant (${ids.join(', ')})`,
    );
  }

  /**
   * Test için elle tetiklenebilen geçiş — E2E testlerde cron'u simüle eder.
   * Üretimde admin API çağrılmaz; sadece gerçek cron kullanılır.
   */
  async runNow(): Promise<{ trialToPastDue: number; pastDueToSuspended: number }> {
    const now = new Date();

    const [expiredTrials, graceExpired] = await Promise.all([
      this.prisma.tenantBilling.findMany({
        where: { status: 'TRIAL',    trialEndsAt: { lt: now } },
        select: { tenantId: true },
      }),
      this.prisma.tenantBilling.findMany({
        where: { status: 'PAST_DUE', graceUntil:  { lt: now } },
        select: { tenantId: true },
      }),
    ]);

    const trialIds = expiredTrials.map(b => b.tenantId);
    const graceIds = graceExpired.map(b  => b.tenantId);

    if (trialIds.length > 0) {
      await this.prisma.tenantBilling.updateMany({
        where: { tenantId: { in: trialIds } },
        data:  { status: 'PAST_DUE' },
      });
      await Promise.all(trialIds.map(id => this.entitlements.invalidate(id)));
    }

    if (graceIds.length > 0) {
      await this.prisma.tenantBilling.updateMany({
        where: { tenantId: { in: graceIds } },
        data:  { status: 'SUSPENDED' },
      });
      await Promise.all(graceIds.map(id => this.entitlements.invalidate(id)));
    }

    return {
      trialToPastDue:      trialIds.length,
      pastDueToSuspended:  graceIds.length,
    };
  }

  // ── ACTIVE period sona erdi → PAST_DUE (Faz 22.5) ──────────────────────────

  /**
   * ACTIVE BillingPeriod'u sona eren tenant'ları PAST_DUE'ya geçir.
   * Akış:
   *   1. ACTIVE dönemler içinde periodEnd < now olanları bul.
   *   2. Her dönemi CLOSED olarak işaretle (immutable kural: sadece status değişir).
   *   3. Tenant'ın TenantBilling.status ACTIVE ise PAST_DUE yap.
   *   4. graceUntil = now + 3 gün güncelle (renewal grace window).
   *   5. Entitlement cache'i invalidate et.
   *
   * Neden burada? BillingService.activate() dönemi kapatan adımı içermiyor;
   * renewal lifecycle billing.cron sorumluluğundadır.
   */
  private async transitionExpiredActivePeriods(now: Date): Promise<void> {
    // Süresi dolmuş ACTIVE dönemler
    const expiredPeriods = await this.prisma.billingPeriod.findMany({
      where: {
        status:    'ACTIVE',
        periodEnd: { lt: now },
      },
      select: { id: true, tenantId: true },
    });

    if (expiredPeriods.length === 0) return;

    const periodIds = expiredPeriods.map(p => p.id);
    const tenantIds = [...new Set(expiredPeriods.map(p => p.tenantId))];

    // Dönemleri CLOSED yap (immutable ledger: sadece status değişir)
    await this.prisma.billingPeriod.updateMany({
      where: { id: { in: periodIds } },
      data:  { status: 'CLOSED' },
    });

    // ACTIVE tenant'ları PAST_DUE'ya geçir (graceUntil = now + 3 gün)
    const graceUntil = new Date(now.getTime() + 3 * 24 * 60 * 60 * 1000);

    await this.prisma.tenantBilling.updateMany({
      where: {
        tenantId: { in: tenantIds },
        status:   'ACTIVE',           // PAST_DUE/SUSPENDED zaten işlenmiş olabilir
      },
      data: {
        status:     'PAST_DUE',
        graceUntil,
      },
    });

    await Promise.all(tenantIds.map(id => this.entitlements.invalidate(id)));

    this.logger.warn(
      `[BillingCron] ACTIVE period→PAST_DUE: ${tenantIds.length} tenant ` +
      `(${tenantIds.join(', ')}) — ${periodIds.length} dönem CLOSED`,
    );
  }

  /**
   * Her 10 dakikada bir — TTL'i geçmiş PENDING BillingAttempt'leri FAILED yap.
   * Cron/webhook race guard: webhook zaten paymentId set etmişse hiç dokunma.
   */
  @Cron('*/10 * * * *')
  async expireStaleAttempts(): Promise<void> {
    const result = await this.prisma.billingAttempt.updateMany({
      where: {
        status:            'PENDING',
        expiresAt:         { lt: new Date() },
        providerPaymentId: null, // webhook zaten yanıt verdiyse sona erdirme
      },
      data: { status: 'FAILED' },
    });
    if (result.count > 0) {
      this.logger.warn(`[BillingCron] ${result.count} stale attempt FAILED yapıldı`);
    }
  }

  /**
   * Her ayın 1'inde 03:00 — 90 günden eski webhook_events satırlarını sil.
   * 90 gün: chargeback/dispute penceresini karşılar; tabloyu sınırsız büyümeden korur.
   */
  @Cron('0 3 1 * *')
  async pruneWebhookEvents(): Promise<void> {
    const cutoff = new Date(Date.now() - 90 * 24 * 60 * 60 * 1000);
    const deleted = await this.prisma.$executeRaw`
      DELETE FROM webhook_events WHERE "createdAt" < ${cutoff}
    `;
    this.logger.log(`[BillingCron] ${deleted} eski webhook_events satırı silindi (>90 gün)`);
  }
}
