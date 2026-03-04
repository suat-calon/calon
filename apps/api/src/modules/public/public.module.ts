/**
 * PUBLIC MODULE — Faz 16 + Faz 17 + Faz 18
 * ──────────────────────────────────────────────────────────────────────────────
 * Faz 16: Herkese açık booking endpoint'leri.
 * Faz 17: SEO Discovery — city/service/salon marketplace sorgular.
 * Faz 18: Viral Growth — ReferralProcessor (BullMQ) + LoyaltyModule import.
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
import { OperationsModule }      from '../operations/operations.module';
import { LoyaltyModule }         from '../loyalty/loyalty.module';

@Module({
  imports:     [OperationsModule, LoyaltyModule],
  controllers: [PublicController, DiscoveryController],
  providers:   [PublicService, DiscoveryService, ReferralProcessor],
})
export class PublicModule {}
