/**
 * PUBLIC MODULE — Faz 16 + Faz 17 + Faz 18 + Faz 19
 * ──────────────────────────────────────────────────────────────────────────────
 * Faz 16: Herkese açık booking endpoint'leri.
 * Faz 17: SEO Discovery — city/service/salon marketplace sorgular.
 * Faz 18: Viral Growth — ReferralProcessor (BullMQ) + LoyaltyModule import.
 * Faz 19: İyzico Ödeme Motoru — PaymentService + WebhookController + IyzicoService.
 *
 * OperationsModule import: AppointmentService (GIST + Redis lock) +
 *   AppointmentAvailabilityService (Redis cache)
 * ──────────────────────────────────────────────────────────────────────────────
 */

import { Module }                from '@nestjs/common';
import { PublicController }      from './public.controller';
import { PublicService }         from './public.service';
import { DiscoveryController }   from './discovery.controller';
import { DiscoveryService }      from './discovery.service';
import { ReferralProcessor }     from './referral.processor';
import { PaymentService }        from './payment.service';
import { WebhookController }     from './webhook.controller';
import { WebhookAuditService }   from './webhook-audit.service';
import { OperationsModule }       from '../operations/operations.module';
import { LoyaltyModule }          from '../loyalty/loyalty.module';
import { AvailabilityAbuseGuard } from './guards/availability-abuse.guard';

@Module({
  imports:     [OperationsModule, LoyaltyModule],
  controllers: [PublicController, DiscoveryController, WebhookController],
  providers:   [
    PublicService,
    DiscoveryService,
    ReferralProcessor,
    PaymentService,
    WebhookAuditService,
    AvailabilityAbuseGuard,   // §8: per-IP/staff distinct-date probe abuse protection
  ],
})
export class PublicModule {}
