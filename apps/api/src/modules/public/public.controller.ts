/**
 * PUBLIC CONTROLLER — Faz 16
 * ──────────────────────────────────────────────────────────────────────────────
 * Base: /api/v1/public
 *
 * Tüm endpoint'ler @Public() → TenantGuard, BillingGuard bypass.
 * JWT gerekmez — dünya açık erişim.
 * ──────────────────────────────────────────────────────────────────────────────
 */

import {
  Controller,
  Get,
  Post,
  Param,
  Query,
  Body,
  HttpCode,
  HttpStatus,
  ParseIntPipe,
  DefaultValuePipe,
} from '@nestjs/common';

import { Public }         from '../iam/guards/tenant.guard';
import { AllowPastDue }   from '../billing/decorators/allow-past-due.decorator';
import { PublicService }  from './public.service';
import { BookPublicDto }  from './dto/book-public.dto';

@Public()
@AllowPastDue()
@Controller('public')
export class PublicController {
  constructor(private readonly svc: PublicService) {}

  // ── GET /public/salon/:slug ────────────────────────────────────────────────
  /**
   * Salon genel bilgisi.
   * Next.js RSC cache: revalidate 60s
   */
  @Get('salon/:slug')
  getSalon(@Param('slug') slug: string) {
    return this.svc.getSalon(slug);
  }

  // ── GET /public/services?tenantId={id} ────────────────────────────────────
  @Get('services')
  getServices(@Query('tenantId') tenantId: string) {
    return this.svc.getServices(tenantId);
  }

  // ── GET /public/staff?tenantId={id} ──────────────────────────────────────
  @Get('staff')
  getStaff(@Query('tenantId') tenantId: string) {
    return this.svc.getStaff(tenantId);
  }

  // ── GET /public/availability?tenantId&staffId&date&serviceDurationMin ─────
  /**
   * Belirtilen personel ve tarih için boş slot listesi.
   * date: YYYY-MM-DD (UTC gün)
   * serviceDurationMin: varsayılan 30
   */
  @Get('availability')
  getAvailability(
    @Query('tenantId')          tenantId: string,
    @Query('staffId')           staffId:  string,
    @Query('date')              date:     string,
    @Query('serviceDurationMin', new DefaultValuePipe(30), ParseIntPipe)
    serviceDurationMin: number,
  ) {
    return this.svc.getAvailability(tenantId, staffId, date, serviceDurationMin);
  }

  // ── POST /public/book ─────────────────────────────────────────────────────
  /**
   * Randevu oluştur.
   * Customer upsert + GIST çift-rezervasyon koruması + Redis lock.
   */
  @Post('book')
  @HttpCode(HttpStatus.CREATED)
  book(@Body() dto: BookPublicDto) {
    return this.svc.book(dto);
  }

  // ── GET /public/sitemap-slugs ─────────────────────────────────────────────
  /**
   * Sitemap üreteci için aktif salon slug listesi.
   * Next.js sitemap.ts tarafından kullanılır.
   */
  @Get('sitemap-slugs')
  getSitemapSlugs() {
    return this.svc.getAllActiveSlugs();
  }
}
