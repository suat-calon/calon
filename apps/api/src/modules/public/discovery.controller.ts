/**
 * DISCOVERY CONTROLLER — Faz 17
 * ──────────────────────────────────────────────────────────────────────────────
 * Base: /api/v1/public/discovery
 *
 * Tüm endpoint'ler @Public() → JWT, TenantGuard, BillingGuard bypass.
 * Cross-tenant okuma: marketplace RLS politikaları etkin; calon_app
 * table owner olduğu için bypass — uygulama sorguları etkilenmez.
 * ──────────────────────────────────────────────────────────────────────────────
 */

import { Controller, Get, Param } from '@nestjs/common';

import { Public }            from '../iam/guards/tenant.guard';
import { AllowPastDue }      from '../billing/decorators/allow-past-due.decorator';
import { DiscoveryService }  from './discovery.service';

@Public()
@AllowPastDue()
@Controller('public/discovery')
export class DiscoveryController {
  constructor(private readonly svc: DiscoveryService) {}

  // ── GET /public/discovery/cities ───────────────────────────────────────────
  /**
   * Aktif salonların bulunduğu şehir listesi (salon sayısıyla).
   * Next.js ISR: revalidate 3600
   */
  @Get('cities')
  getCities() {
    return this.svc.getCities();
  }

  // ── GET /public/discovery/services ────────────────────────────────────────
  /**
   * Mevcut hizmet kategorileri + slug + salon sayısı.
   * Next.js ISR: revalidate 3600
   */
  @Get('services')
  getDiscoveryServices() {
    return this.svc.getDiscoveryServices();
  }

  // ── GET /public/discovery/city/:city ──────────────────────────────────────
  /**
   * Belirtilen şehirdeki tüm aktif salonlar.
   * :city  örn: Istanbul (büyük/küçük harf duyarsız)
   * Next.js ISR: revalidate 3600
   */
  @Get('city/:city')
  getCitySalons(@Param('city') city: string) {
    return this.svc.getCitySalons(city);
  }

  // ── GET /public/discovery/service/:city/:service ───────────────────────────
  /**
   * Belirtilen şehirde belirtilen hizmeti sunan salonlar.
   * :city     örn: Istanbul
   * :service  örn: sac-kesimi  (slugified kategori adı)
   * Next.js ISR: revalidate 3600
   */
  @Get('service/:city/:service')
  getCityServiceSalons(
    @Param('city')    city:        string,
    @Param('service') serviceSlug: string,
  ) {
    return this.svc.getCityServiceSalons(city, serviceSlug);
  }

  // ── GET /public/discovery/sitemap-data ────────────────────────────────────
  /**
   * Sitemap üreteci için city × service × salon kombinasyonları.
   * Next.js sitemap.ts tarafından kullanılır.
   * Next.js ISR: revalidate 3600
   */
  @Get('sitemap-data')
  getSitemapData() {
    return this.svc.getSitemapData();
  }
}
