/**
 * WEBHOOK CONTROLLER — Faz 19 + CHECKOUT-LEDGER-02 Hardening
 * ──────────────────────────────────────────────────────────────────────────────
 * Base: /webhooks
 *
 * @Public() → TenantGuard bypass (dış servis callback'i, JWT yok)
 * @AllowPastDue() → BillingGuard bypass
 * @Throttle — Rate limited to prevent replay attacks
 *
 * POST /webhooks/iyzico
 *   İyzico ödeme sonucu callback'i.
 *   İmza: HMAC-SHA256(iyziReferenceCode, secretKey) base64 → signature header'ı
 *   Signature ZORUNLU — missing/invalid → 401 (CHECKOUT-LEDGER-02)
 * ──────────────────────────────────────────────────────────────────────────────
 */

import {
  Controller,
  Post,
  Body,
  HttpCode,
  HttpStatus,
} from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';

import { Public }       from '../iam/guards/tenant.guard';
import { AllowPastDue } from '../billing/decorators/allow-past-due.decorator';
import { PaymentService, IyzicoWebhookPayload } from './payment.service';
import { WebhookAuditService }                  from './webhook-audit.service';

@Public()
@AllowPastDue()
@Controller('webhooks')
export class WebhookController {
  constructor(
    private readonly payments:       PaymentService,
    private readonly webhookAudit:   WebhookAuditService,
  ) {}

  /**
   * İyzico webhook — ödeme sonucu callback'i.
   * Rate limited: max 10 requests/60s per IP.
   * Signature: ZORUNLU (CHECKOUT-LEDGER-02 hardening).
   */
  @Post('iyzico')
  @HttpCode(HttpStatus.OK)
  @Throttle({ default: { limit: 10, ttl: 60_000 } })
  handleIyzico(@Body() payload: IyzicoWebhookPayload) {
    this.webhookAudit.log('iyzico-webhook', payload);
    return this.payments.handleIyzicoWebhook(payload);
  }
}
