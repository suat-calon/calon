/**
 * PUBLIC CONTROLLER — Faz 16 + Faz 19 + Faz 23 + MVP-GATE-1
 * ──────────────────────────────────────────────────────────────────────────────
 * Base: /api/v1/public
 *
 * Tüm endpoint'ler @Public() → TenantGuard, BillingGuard bypass.
 * JWT gerekmez — dünya açık erişim.
 *
 * Faz 23 eklemeleri:
 *   POST   /public/holds          — DB-backed slot kilidi al (ThrottleGuard korumalı)
 *   DELETE /public/holds/:holdId  — Hold'u serbest bırak (kullanıcı akıştan çıktı)
 *
 * MVP-GATE-1 rate limit düzenlemeleri:
 *   /public/holds → PUBLIC_HOLDS_LIMIT / PUBLIC_RATE_TTL_MS   (varsayılan: 10/60s)
 *   /public/book  → PUBLIC_BOOK_LIMIT  / PUBLIC_RATE_TTL_MS   (varsayılan:  5/60s)
 *   Limitler .env üzerinden yapılandırılabilir — hardcode yasak.
 * ──────────────────────────────────────────────────────────────────────────────
 */

import {
  BadRequestException,
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
  Req,
  UseGuards,
} from '@nestjs/common';
import { Request } from 'express';
import { Throttle } from '@nestjs/throttler';

// ── Rate limit sabitleri — env-var driven, başlangıçta okunur ─────────────────
const RATE_TTL_MS        = Number(process.env['PUBLIC_RATE_TTL_MS']         ?? 60_000);
const HOLDS_LIMIT        = Number(process.env['PUBLIC_HOLDS_LIMIT']         ?? 10);
const BOOK_LIMIT         = Number(process.env['PUBLIC_BOOK_LIMIT']          ?? 10);
const AVAILABILITY_LIMIT = Number(process.env['PUBLIC_AVAILABILITY_LIMIT']  ?? 30);
const PAYMENTS_LIMIT     = Number(process.env['PUBLIC_PAYMENTS_LIMIT']      ?? 10);

import { Public }           from '../iam/guards/tenant.guard';
import { AllowPastDue }     from '../billing/decorators/allow-past-due.decorator';
import { PublicService }    from './public.service';
import { PaymentService }   from './payment.service';
import { AcquireHoldDto }   from './dto/acquire-hold.dto';
import { BookPublicDto }    from './dto/book-public.dto';
import { CreatePaymentDto }  from './dto/create-payment.dto';
import { resolveClientIp }        from '../../common/ip-resolver.util';
import { AvailabilityAbuseGuard } from './guards/availability-abuse.guard';

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

  // ── GET /public/services?slug={slug} ──────────────────────────────────────
  @Get('services')
  getServices(@Query('slug') slug: string) {
    if (!slug) throw new BadRequestException('slug gerekli');
    return this.svc.getServices(slug);
  }

  // ── GET /public/staff?slug={slug} ─────────────────────────────────────────
  @Get('staff')
  getStaff(@Query('slug') slug: string) {
    if (!slug) throw new BadRequestException('slug gerekli');
    return this.svc.getStaff(slug);
  }

  // ── GET /public/availability?slug&staffId&date&serviceDurationMin ──────────
  /**
   * Belirtilen personel ve tarih için boş slot listesi.
   * date: YYYY-MM-DD (tenant yerel tarihi)
   * serviceDurationMin: varsayılan 30
   */
  @Get('availability')
  @Throttle({ default: { limit: AVAILABILITY_LIMIT, ttl: RATE_TTL_MS } })
  @UseGuards(AvailabilityAbuseGuard)
  getAvailability(
    @Query('slug')              slug:    string,
    @Query('staffId')           staffId: string,
    @Query('date')              date:    string,
    @Query('serviceDurationMin', new DefaultValuePipe(30), ParseIntPipe)
    serviceDurationMin: number,
  ) {
    if (!slug)    throw new BadRequestException('slug gerekli');
    if (!staffId) throw new BadRequestException('staffId gerekli');
    if (!date)    throw new BadRequestException('date gerekli (YYYY-MM-DD)');
    return this.svc.getAvailability(slug, staffId, date, serviceDurationMin);
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
  @Throttle({ default: { limit: HOLDS_LIMIT, ttl: RATE_TTL_MS } })
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
    @Param('holdId') holdId: string,
    @Query('slug')   slug:   string,
  ) {
    if (!slug) throw new BadRequestException('slug gerekli');
    return this.svc.releaseHold(holdId, slug);
  }

  // ── POST /public/book ─────────────────────────────────────────────────────
  /**
   * Randevu oluştur.
   * Customer upsert + GIST çift-rezervasyon koruması + Redis lock.
   * Faz 23: holdId (opsiyonel — Phase 1 geriye uyumluluk).
   */
  @Post('book')
  @HttpCode(HttpStatus.CREATED)
  @Throttle({ default: { limit: BOOK_LIMIT, ttl: RATE_TTL_MS } })
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
  @Throttle({ default: { limit: PAYMENTS_LIMIT, ttl: RATE_TTL_MS } })
  createPayment(@Body() dto: CreatePaymentDto, @Req() req: Request) {
    return this.payments.createPayment(dto, resolveClientIp(req));
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
