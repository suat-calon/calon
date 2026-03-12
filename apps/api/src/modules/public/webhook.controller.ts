/**
 * WEBHOOK CONTROLLER — Faz 19
 * ──────────────────────────────────────────────────────────────────────────────
 * Base: /webhooks
 *
 * @Public() → TenantGuard bypass (dış servis callback'i, JWT yok)
 * @AllowPastDue() → BillingGuard bypass
 *
 * POST /webhooks/iyzico
 *   İyzico ödeme sonucu callback'i.
 *   İmza: HMAC-SHA256(iyziReferenceCode, secretKey) base64 → signature header'ı
 * ──────────────────────────────────────────────────────────────────────────────
 */

import {
  Controller,
  Post,
  Body,
  HttpCode,
  HttpStatus,
} from '@nestjs/common';

import { Public }       from '../iam/guards/tenant.guard';
import { AllowPastDue } from '../billing/decorators/allow-past-due.decorator';
import { PaymentService, IyzicoWebhookPayload } from './payment.service';

@Public()
@AllowPastDue()
@Controller('webhooks')
export class WebhookController {
  constructor(private readonly payments: PaymentService) {}

  /**
   * İyzico webhook — ödeme sonucu callback'i.
   *
   * İyzico, ödeme tamamlandığında (başarılı veya başarısız) bu URL'e POST atar.
   * Body: application/x-www-form-urlencoded (veya JSON — İyzico ayarına bağlı).
   *
   * Idempotency: aynı paymentId gelirse sessizce 200 döner.
   */
  @Post('iyzico')
  @HttpCode(HttpStatus.OK)
  handleIyzico(@Body() payload: IyzicoWebhookPayload) {
    return this.payments.handleIyzicoWebhook(payload);
  }
}
