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
}
