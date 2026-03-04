/**
 * PUBLIC MODULE — Faz 16 + Faz 17
 * ──────────────────────────────────────────────────────────────────────────────
 * Faz 16: Herkese açık booking endpoint'leri.
 * Faz 17: SEO Discovery — city/service/salon marketplace sorgular.
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
import { OperationsModule }      from '../operations/operations.module';

@Module({
  imports:     [OperationsModule],
  controllers: [PublicController, DiscoveryController],
  providers:   [PublicService, DiscoveryService],
})
export class PublicModule {}
