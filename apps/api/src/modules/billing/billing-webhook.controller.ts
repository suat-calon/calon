/**
 * BILLING WEBHOOK CONTROLLER — Faz 22
 * ──────────────────────────────────────────────────────────────────────────────
 * POST /webhooks/billing/iyzico
 *
 * İyzico abonelik webhook'u:
 *   1. İmza doğrulama (primary: raw body x-iyz-signature; fallback: referenceCode HMAC)
 *   2. BillingAttempt'i bul (tenantId audit için)
 *   3. WebhookEvent @unique insert → idempotency (P2002 = zaten işlendi → 200)
 *   4. BillingService.resolveWebhookPayment() → FSM geçişi
 *
 * @Public() + @AllowPastDue(): TenantGuard ve BillingGuard bypass.
 * RLS: superuser bağlantısı (tenantContext YOK) → uygulama katmanı UUID+HMAC izolasyonu.
 * ──────────────────────────────────────────────────────────────────────────────
 */

import {
  Controller,
  Post,
  Body,
  Req,
  HttpCode,
  HttpStatus,
  Logger,
  UnauthorizedException,
  BadRequestException,
} from '@nestjs/common';
import { RawBodyRequest } from '@nestjs/common';
import { Prisma }         from '@prisma/client';
import { Request }        from 'express';

import { PrismaService }          from '../../common/prisma.service';
import { Public }                 from '../iam/guards/tenant.guard';
import { BillingService }         from './billing.service';
import { IyzicoService }          from '../public/iyzico.service';
import { AllowPastDue }           from './decorators/allow-past-due.decorator';
import { IyzicoWebhookPayload }   from '../public/payment.service';

@Public()
@AllowPastDue()
@Controller('webhooks/billing')
export class BillingWebhookController {
  private readonly logger = new Logger(BillingWebhookController.name);

  constructor(
    private readonly billing: BillingService,
    private readonly iyzico:  IyzicoService,
    private readonly prisma:  PrismaService,
  ) {}

  @Post('iyzico')
  @HttpCode(HttpStatus.OK)
  async handleBillingIyzico(
    @Body() payload: IyzicoWebhookPayload,
    @Req()  req:     RawBodyRequest<Request>,
  ) {
    // ── 1. İmza doğrulama — eksikse direkt reddet ────────────────────────────
    if (!payload.signature) {
      throw new UnauthorizedException('Webhook: signature alanı eksik.');
    }

    // Primary: raw body HMAC-SHA256 (x-iyz-signature header)
    const rawBodySig = req.headers['x-iyz-signature'] as string | undefined;
    if (rawBodySig && req.rawBody) {
      const valid = this.iyzico.verifyBodySignature(req.rawBody, rawBodySig);
      if (!valid) {
        throw new UnauthorizedException('Webhook ham gövde imzası geçersiz.');
      }
    } else {
      // Fallback: iyziReferenceCode HMAC (eski imzalama yöntemi)
      const sigRef = payload.iyziReferenceCode ?? payload.paymentId;
      if (!sigRef) {
        throw new UnauthorizedException('Webhook: imza referansı eksik.');
      }
      const valid = this.iyzico.verifyWebhookSignature(sigRef, payload.signature);
      if (!valid) {
        throw new UnauthorizedException('Webhook imza geçersiz.');
      }
    }

    // ── 2. BillingAttempt lookup — tenantId için (audit + RLS) ──────────────
    const attemptId = payload.conversationId;
    const attempt = attemptId
      ? await this.prisma.billingAttempt.findUnique({
          where:  { id: attemptId },
          select: { tenantId: true },
        })
      : null;

    // ── 3. Idempotency: WebhookEvent @unique insert ──────────────────────────
    // Öncelik: paymentId > iyziReferenceCode
    const providerEventId = payload.paymentId ?? payload.iyziReferenceCode;
    if (!providerEventId) {
      this.logger.warn('[BillingWebhook] paymentId ve iyziReferenceCode her ikisi de eksik — reddediliyor');
      throw new BadRequestException('Webhook: tanımlayıcı alan eksik.');
    }

    try {
      await this.prisma.webhookEvent.create({
        data: {
          source:          'iyzico_billing',
          providerEventId,
          eventType:       payload.status ?? payload.iyziEventType ?? 'unknown',
          payload:         payload as unknown as Prisma.InputJsonValue,
          tenantId:        attempt?.tenantId ?? null,
          processedAt:     new Date(),
        },
      });
    } catch (err) {
      if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2002') {
        this.logger.log(`[BillingWebhook] Idempotent tekrar tespit edildi: ${providerEventId}`);
        return { received: true };
      }
      throw err;
    }

    // ── 4. FSM geçişi ────────────────────────────────────────────────────────
    const isSuccess         = payload.status === 'SUCCESS';
    const providerPaymentId = payload.paymentId ?? '';

    if (attemptId) {
      await this.billing.resolveWebhookPayment(attemptId, isSuccess, providerPaymentId);
    } else {
      this.logger.warn(`[BillingWebhook] conversationId eksik — FSM geçişi atlandı`);
    }

    return { received: true };
  }
}
