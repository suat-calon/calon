/**
 * PLATFORM METRICS PROCESSOR — Super Admin Metrik Snapshot Cron'u
 * ──────────────────────────────────────────────────────────────────────────────
 * Her 5 dakikada bir platform geneli metrik snapshot'ı hesaplar ve
 * `platform_metrics_snapshots` tablosuna yazar.
 *
 * KURAL: Analytics sorguları transactional tablolara değil, bu snapshot
 *        tablosuna yönelir. Cron çalışamazsa son geçerli snapshot kullanılır.
 *
 * Hesaplanan metrikler:
 *   - Tenant billing durumu dağılımı (total/active/trial/pastDue/suspended/canceled)
 *   - Bu ay yeni tenant sayısı
 *   - Bugünkü randevu sayısı (CANCELLED + NO_SHOW hariç)
 *   - Tahmini MRR (ACTIVE tenant'ların aylık normalize planı)
 *   - Açık / başarısız ödeme girişimi sayıları
 *   - Plan bazında tenant dağılımı
 * ──────────────────────────────────────────────────────────────────────────────
 */

import { Injectable, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { TenantPlan, BillingCycle } from '@prisma/client';

import { PrismaService } from '../../../common/prisma.service';
import { PLAN_PRICES }   from '../../billing/plan.catalog';

@Injectable()
export class PlatformMetricsProcessor {
  private readonly logger = new Logger(PlatformMetricsProcessor.name);

  constructor(private readonly prisma: PrismaService) {}

  // ── Cron: Her 5 dakika ────────────────────────────────────────────────────

  @Cron(CronExpression.EVERY_5_MINUTES)
  async captureSnapshot(): Promise<void> {
    this.logger.log('[PlatformMetrics] Snapshot hesaplanıyor...');

    const now           = new Date();
    const startOfToday  = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const endOfToday    = new Date(startOfToday.getTime() + 86_400_000); // +1 gün
    const startOfMonth  = new Date(now.getFullYear(), now.getMonth(), 1);
    const last24h       = new Date(now.getTime() - 86_400_000);

    // 7 sorgu paralel — tüm transactional tablolara tek geçiş
    const [
      billingStatusGroups,
      planGroups,
      newTenantsThisMonth,
      bookingsToday,
      openAttemptCount,
      failedAttemptCount,
      activePlanCycleGroups,
    ] = await Promise.all([
      // 1) Billing durumu dağılımı
      this.prisma.tenantBilling.groupBy({
        by: ['status'],
        _count: { status: true },
      }),

      // 2) Plan bazında tenant dağılımı
      this.prisma.tenantBilling.groupBy({
        by: ['plan'],
        _count: { plan: true },
      }),

      // 3) Bu ay oluşturulan tenant sayısı
      this.prisma.tenant.count({
        where: {
          createdAt: { gte: startOfMonth },
          isDeleted: false,
        },
      }),

      // 4) Bugünkü randevular (iptal + gelmedi hariç)
      this.prisma.appointment.count({
        where: {
          startTime: { gte: startOfToday, lt: endOfToday },
          status:    { notIn: ['CANCELLED', 'NO_SHOW'] },
        },
      }),

      // 5) Açık (PENDING) ödeme girişimleri
      this.prisma.billingAttempt.count({
        where: { status: 'PENDING' },
      }),

      // 6) Son 24 saatte başarısız olan ödeme girişimleri
      this.prisma.billingAttempt.count({
        where: {
          status:    'FAILED',
          updatedAt: { gte: last24h },
        },
      }),

      // 7) ACTIVE tenant'ları plan × döngü gruplarına göre — MRR için
      this.prisma.tenantBilling.groupBy({
        by:    ['plan', 'cycle'],
        where: { status: 'ACTIVE' },
        _count: { plan: true },
      }),
    ]);

    // ── Billing durum metriklerini çöz ─────────────────────────────────────

    type StatusGroup = (typeof billingStatusGroups)[number];

    const statusCount = (status: string): number =>
      billingStatusGroups.find((r: StatusGroup) => r.status === status)?._count.status ?? 0;

    const totalTenants     = billingStatusGroups.reduce(
      (s: number, r: StatusGroup) => s + r._count.status, 0,
    );
    const activeTenants    = statusCount('ACTIVE');
    const trialTenants     = statusCount('TRIAL');
    const pastDueTenants   = statusCount('PAST_DUE');
    const suspendedTenants = statusCount('SUSPENDED');
    const canceledTenants  = statusCount('CANCELED');

    // ── Plan breakdown ─────────────────────────────────────────────────────

    const planBreakdown: Record<string, number> = {
      SOLO:       0,
      BOUTIQUE:   0,
      ENTERPRISE: 0,
    };
    for (const row of planGroups) {
      if (row.plan in planBreakdown) {
        planBreakdown[row.plan] = row._count.plan;
      }
    }

    // ── Tahmini MRR (kuruş cinsinden) ──────────────────────────────────────
    // MONTHLY: count × aylık tutar
    // YEARLY:  count × (yıllık tutar / 12) — aylıklaştırılmış

    let estimatedMRR = 0;
    for (const row of activePlanCycleGroups) {
      const count   = row._count.plan;
      const plan    = row.plan  as TenantPlan;
      const cycle   = row.cycle as BillingCycle;
      const prices  = PLAN_PRICES[plan];
      if (!prices) continue;

      if (cycle === 'MONTHLY') {
        estimatedMRR += count * prices.MONTHLY.amountCents;
      } else {
        // Yıllık tutarı 12'ye bölerek aylıklaştır
        estimatedMRR += count * Math.round(prices.YEARLY.amountCents / 12);
      }
    }

    // ── Snapshot yaz ───────────────────────────────────────────────────────

    await this.prisma.platformMetricsSnapshot.create({
      data: {
        totalTenants,
        activeTenants,
        trialTenants,
        pastDueTenants,
        suspendedTenants,
        canceledTenants,
        newTenantsThisMonth,
        bookingsToday,
        estimatedMRR,
        openAttemptCount,
        failedAttemptCount,
        planBreakdown,
      },
    });

    this.logger.log(
      `[PlatformMetrics] Snapshot yazıldı — ` +
      `total:${totalTenants} active:${activeTenants} ` +
      `MRR:${estimatedMRR} bookings:${bookingsToday}`,
    );
  }
}
