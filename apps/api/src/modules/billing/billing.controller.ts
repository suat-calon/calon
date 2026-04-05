/**
 * BILLING CONTROLLER — Faz 22
 * ──────────────────────────────────────────────────────────────────────────────
 * Tenant-facing abonelik yönetimi:
 *   GET  /billing/status          → mevcut billing durumu
 *   POST /billing/payment-session → İyzico ödeme formu başlat
 *
 * PAST_DUE tenant'lar bu endpoint'lere erişebilir (@AllowPastDue).
 * buyerIp her zaman req.ip'den alınır — client body'den ALDIRILMAZ.
 * ──────────────────────────────────────────────────────────────────────────────
 */

import {
  Controller,
  Get,
  Post,
  Body,
  Req,
} from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import { ConfigService } from '@nestjs/config';
import { Request }       from 'express';

import { BillingService }     from './billing.service';
import { IyzicoService }      from '../public/iyzico.service';
import { PaymentSessionDto }  from './dto/payment-session.dto';
import { AllowPastDue }       from './decorators/allow-past-due.decorator';

@AllowPastDue()
@Controller('billing')
export class BillingController {
  constructor(
    private readonly billing: BillingService,
    private readonly iyzico:  IyzicoService,
    private readonly config:  ConfigService,
  ) {}

  // ─────────────────────────────────────────────────────────────────────────
  // GET /billing/status
  // ─────────────────────────────────────────────────────────────────────────

  @Get('status')
  getStatus(@Req() req: { tenantId: string }) {
    return this.billing.getBilling(req.tenantId);
  }

  // ─────────────────────────────────────────────────────────────────────────
  // POST /billing/payment-session
  // Plan + cycle body'den gelir; buyerIp req.ip'den alınır (spoofing önlemi).
  // Response: { paymentPageUrl, attemptId }
  // ─────────────────────────────────────────────────────────────────────────

  @Post('payment-session')
  @Throttle({ default: { limit: 5, ttl: 60_000 } })
  async createPaymentSession(
    @Req() req: { tenantId: string } & Request,
    @Body() dto: PaymentSessionDto,
  ) {
    const tenantId = req.tenantId;
    // req.ip: Express proxy güveni yapılandırılmışsa gerçek client IP'si gelir
    const buyerIp  = req.ip ?? '127.0.0.1';

    const { attemptId, amountCents, currency } =
      await this.billing.createBillingAttempt(tenantId, dto.plan, dto.cycle);

    const price      = (amountCents / 100).toFixed(2);
    const apiUrl     = this.config.get<string>('API_URL', 'http://localhost:4000');
    const callbackUrl = `${apiUrl}/api/v1/webhooks/billing/iyzico`;

    const iyzRes = await this.iyzico.initializeCheckoutForm({
      locale:         'tr',
      conversationId: attemptId,      // attemptId = İyzico conversationId
      price,
      paidPrice:      price,
      currency,
      basketId:       attemptId,
      paymentGroup:   'PRODUCT',
      callbackUrl,
      buyer: {
        id:      tenantId,
        name:    dto.buyerName,
        surname: dto.buyerSurname ?? '-',
        email:   dto.buyerEmail,
        // TODO(prod): KYC — gerçek TC kimlik numarası gerektirir. Şimdilik sandbox placeholder.
        identityNumber:      tenantId.replace(/-/g, '').slice(0, 11).padEnd(11, '0'),
        registrationAddress: 'Turkey',
        city:                'Istanbul',
        country:             'Turkey',
        ip:                  buyerIp,
      },
      shippingAddress: {
        contactName: dto.buyerName,
        city:        'Istanbul',
        country:     'Turkey',
        address:     'Turkey',
      },
      billingAddress: {
        contactName: dto.buyerName,
        city:        'Istanbul',
        country:     'Turkey',
        address:     'Turkey',
      },
      basketItems: [
        {
          id:        `plan-${dto.plan}-${dto.cycle}`,
          name:      `Calon ${dto.plan} Plan (${dto.cycle})`,
          category1: 'Yazılım',
          itemType:  'VIRTUAL',
          price,
        },
      ],
    });

    return { paymentPageUrl: iyzRes.paymentPageUrl, attemptId };
  }
}
