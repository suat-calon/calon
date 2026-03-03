/**
 * LOYALTY CONTROLLER — Sadakat Sistemi API Katmanı
 * ──────────────────────────────────────────────────────────────────────────────
 * Tüm endpoint'ler:
 *   1. TenantGuard (global APP_GUARD) — JWT doğrulama + tenantId izolasyonu
 *   2. ProPlanGuard — BOUTIQUE/ENTERPRISE planı zorunlu (SOLO → 403)
 *
 * POST /loyalty/redeem:
 *   IdempotencyInterceptor: x-idempotency-key header ile çift tıklama koruması.
 *   LoyaltyTransaction.idempotencyKey UNIQUE: eş zamanlı istekleri de engeller.
 * ──────────────────────────────────────────────────────────────────────────────
 */

import {
  Controller,
  Get,
  Post,
  Body,
  Param,
  Query,
  ParseUUIDPipe,
  UseGuards,
  UseInterceptors,
  HttpCode,
  HttpStatus,
  Req,
} from '@nestjs/common';
import { Request } from 'express';

import { IdempotencyInterceptor }  from '../../common/idempotency.interceptor';
import { CurrentTenant }           from '../../common/decorators/current-tenant.decorator';
import { ProPlanGuard }            from './guards/pro-plan.guard';
import { LoyaltyService }          from './loyalty.service';
import { RedeemPointsDto }         from './dto/redeem-points.dto';
import { LoyaltyHistoryQueryDto }  from './dto/loyalty-history-query.dto';

@Controller('loyalty')
@UseGuards(ProPlanGuard)
export class LoyaltyController {
  constructor(private readonly loyalty: LoyaltyService) {}

  // ── POST /loyalty/redeem ─────────────────────────────────────────────────

  /**
   * Puan harca.
   * x-idempotency-key header ile çift tıklama koruması aktif.
   * Yetersiz bakiye → 400 | Müşteri bulunamadı → 404
   */
  @Post('redeem')
  @HttpCode(HttpStatus.OK)
  @UseInterceptors(IdempotencyInterceptor)
  async redeem(
    @CurrentTenant() tenantId: string,
    @Body()          dto:      RedeemPointsDto,
    @Req()           req:      Request,
  ) {
    // IdempotencyInterceptor tarafından da okunur; yoksa UUID tabanlı anahtar üret
    const idempotencyKey =
      (req.headers['x-idempotency-key'] as string | undefined) ??
      `${tenantId}:${dto.customerId}:REDEEMED:${Date.now()}`;

    return this.loyalty.redeem(tenantId, dto, idempotencyKey);
  }

  // ── GET /loyalty/customers/:customerId/history ───────────────────────────

  /**
   * Müşterinin puan geçmişi (sayfalı) + güncel bakiye.
   * Tenant izolasyonu: customerId'nin tenantId'ye ait olup olmadığı servis katmanında doğrulanır.
   */
  @Get('customers/:customerId/history')
  async getHistory(
    @CurrentTenant()                 tenantId:   string,
    @Param('customerId', ParseUUIDPipe) customerId: string,
    @Query()                         query:      LoyaltyHistoryQueryDto,
  ) {
    return this.loyalty.getHistory(tenantId, customerId, query);
  }
}
