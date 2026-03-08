/**
 * PUBLIC CONTROLLER — Faz 16 + Faz 19 + Faz 23
 * ──────────────────────────────────────────────────────────────────────────────
 * Base: /api/v1/public
 *
 * Tüm endpoint'ler @Public() → TenantGuard, BillingGuard bypass.
 * JWT gerekmez — dünya açık erişim.
 *
 * Faz 23 eklemeleri:
 *   POST   /public/holds          — DB-backed slot kilidi al (ThrottleGuard korumalı)
 *   DELETE /public/holds/:holdId  — Hold'u serbest bırak (kullanıcı akıştan çıktı)
 * ──────────────────────────────────────────────────────────────────────────────
 */

import {
  Controller,
  Delete,
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
import { Throttle } from '@nestjs/throttler';

import { Public }           from '../iam/guards/tenant.guard';
import { AllowPastDue }     from '../billing/decorators/allow-past-due.decorator';
import { PublicService }    from './public.service';
import { PaymentService }   from './payment.service';
import { AcquireHoldDto }   from './dto/acquire-hold.dto';
import { BookPublicDto }    from './dto/book-public.dto';
import { CreatePaymentDto } from './dto/create-payment.dto';

@Public()
@AllowPastDue()
@Controller('public')
export class PublicController {
  constructor(
    private readonly svc:      PublicService,
    private readonly payments: PaymentService,
  ) {}

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

  // ── POST /public/holds ────────────────────────────────────────────────────
  /**
   * Faz 23: DB-backed slot kilidi al.
   * Kullanıcı ödeme/onay ekranındayken slotu 10 dk bloke eder.
   *
   * Throttle: 10 istek / 60 saniye per IP.
   * Slot-squatting saldırılarını (tüm slotları kilitleme) engeller.
   * Response: { holdId, expiresAt }
   */
  @Post('holds')
  @HttpCode(HttpStatus.CREATED)
  @Throttle({ default: { limit: 10, ttl: 60_000 } })
  acquireHold(@Body() dto: AcquireHoldDto) {
    return this.svc.acquireHold(dto);
  }

  // ── DELETE /public/holds/:holdId ──────────────────────────────────────────
  /**
   * Faz 23: Aktif hold'u serbest bırak.
   * Kullanıcı booking akışından çıktığında veya vazgeçtiğinde çağrılır.
   * Idempotent: terminal durumda hold'a dokunmaz.
   * tenantId: query param (public endpoint — JWT yok)
   */
  @Delete('holds/:holdId')
  @HttpCode(HttpStatus.NO_CONTENT)
  releaseHold(
    @Param('holdId') holdId:   string,
    @Query('tenantId') tenantId: string,
  ) {
    return this.svc.releaseHold(holdId, tenantId);
  }

  // ── POST /public/book ─────────────────────────────────────────────────────
  /**
   * Randevu oluştur.
   * Customer upsert + GIST çift-rezervasyon koruması + Redis lock.
   * Faz 23: holdId (opsiyonel — Phase 1 geriye uyumluluk).
   */
  @Post('book')
  @HttpCode(HttpStatus.CREATED)
  book(@Body() dto: BookPublicDto) {
    return this.svc.book(dto);
  }

  // ── POST /public/payments/create ──────────────────────────────────────────
  /**
   * Faz 19: İyzico kaparo ödeme başlatma.
   * Amount server-side: appointment → service.price (client body'si güvenilmez)
   * Response: { paymentUrl: string }
   */
  @Post('payments/create')
  @HttpCode(HttpStatus.CREATED)
  createPayment(@Body() dto: CreatePaymentDto) {
    return this.payments.createPayment(dto);
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
