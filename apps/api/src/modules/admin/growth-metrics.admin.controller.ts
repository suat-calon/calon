/**
 * GROWTH METRICS ADMIN CONTROLLER — Platform Büyüme Metrikleri
 * ──────────────────────────────────────────────────────────────────────────────
 * Sadece SUPER_ADMIN rolü erişebilir.
 * GET /api/v1/admin/dashboard/metrics
 *
 * Metrikler:
 *   - totalSalons           : Toplam aktif salon sayısı
 *   - newSalonsThisMonth    : Bu ay açılan salon sayısı
 *   - bookingsToday         : Bugünkü aktif randevu sayısı
 *   - activationRateThisMonth : Bu ay açılan salonların aktif oranı (%)
 *   - estimatedMRR          : Tahmini aylık yinelenen gelir (TRY)
 * ──────────────────────────────────────────────────────────────────────────────
 */

import {
  Controller,
  Get,
  Req,
  ForbiddenException,
} from '@nestjs/common';

import { AllowPastDue }  from '../billing/decorators/allow-past-due.decorator';
import { PrismaService } from '../../common/prisma.service';

// ── Plan fiyatları (TRY/ay, hardcoded) ───────────────────────────────────────
const PLAN_MONTHLY_PRICE: Record<string, number> = {
  SOLO:       499,
  BOUTIQUE:   999,
  ENTERPRISE: 2499,
};

// ── Controller ────────────────────────────────────────────────────────────────

@AllowPastDue()
@Controller('admin/dashboard')
export class GrowthMetricsAdminController {
  constructor(private readonly prisma: PrismaService) {}

  private assertSuperAdmin(req: { userRole?: string }): void {
    if (req.userRole !== 'SUPER_ADMIN') {
      throw new ForbiddenException('Bu endpoint yalnızca SUPER_ADMIN için erişilebilir.');
    }
  }

  // ── GET /admin/dashboard/metrics ─────────────────────────────────────────
  @Get('metrics')
  async getMetrics(@Req() req: { userRole?: string }) {
    this.assertSuperAdmin(req);

    const now            = new Date();
    const monthStart     = new Date(now.getFullYear(), now.getMonth(), 1);
    const todayStart     = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const tomorrowStart  = new Date(todayStart);
    tomorrowStart.setDate(tomorrowStart.getDate() + 1);

    // ── 1. Toplam salon sayısı (billing.status IN TRIAL | ACTIVE) ───────────
    const totalSalons = await this.prisma.tenant.count({
      where: {
        isDeleted: false,
        billing:   { status: { in: ['TRIAL', 'ACTIVE'] } },
      },
    });

    // ── 2. Bu ay açılan salon sayısı ─────────────────────────────────────────
    const newSalonsThisMonth = await this.prisma.tenant.count({
      where: {
        isDeleted: false,
        createdAt: { gte: monthStart },
        billing:   { status: { in: ['TRIAL', 'ACTIVE'] } },
      },
    });

    // ── 3. Bugünkü aktif randevu sayısı ──────────────────────────────────────
    // Filtre: status NOT IN (CANCELLED, NO_SHOW), isDeleted=false, startTime bugün
    // Faz 21.9: isTestBooking=true randevular finansal metrikten dışlanır (hizmet katmanı).
    const bookingsToday = await this.prisma.appointment.count({
      where: {
        isDeleted:     false,
        isTestBooking: false,
        status:        { notIn: ['CANCELLED', 'NO_SHOW'] },
        startTime:     { gte: todayStart, lt: tomorrowStart },
      },
    });

    // ── 4. Bu ayın aktivasyon oranı ───────────────────────────────────────────
    // Bu ay kurulan tenant'lardan billing.status = ACTIVE olanların oranı
    const newTenantsWithBilling = await this.prisma.tenantBilling.findMany({
      where: {
        tenant: {
          isDeleted: false,
          createdAt: { gte: monthStart },
        },
      },
      select: { status: true },
    });

    const activationRateThisMonth =
      newTenantsWithBilling.length === 0
        ? 0
        : Math.round(
            (newTenantsWithBilling.filter(b => b.status === 'ACTIVE').length /
              newTenantsWithBilling.length) *
              100,
          );

    // ── 5. Tahmini MRR — ACTIVE tenant'lar × plan fiyatı ─────────────────────
    const activeBillings = await this.prisma.tenantBilling.findMany({
      where: { status: 'ACTIVE' },
      select: { plan: true },
    });

    const estimatedMRR = activeBillings.reduce(
      (sum, b) => sum + (PLAN_MONTHLY_PRICE[b.plan] ?? 0),
      0,
    );

    return {
      totalSalons,
      newSalonsThisMonth,
      bookingsToday,
      activationRateThisMonth,
      estimatedMRR,
      currency: 'TRY',
      generatedAt: now.toISOString(),
    };
  }
}
