/**
 * PUBLIC MODULE — Faz 16
 * ──────────────────────────────────────────────────────────────────────────────
 * Herkese açık booking endpoint'leri.
 *
 * OperationsModule import: AppointmentService (GIST + Redis lock) +
 *   AppointmentAvailabilityService (Redis cache)
 * ──────────────────────────────────────────────────────────────────────────────
 */

import { Module }            from '@nestjs/common';
import { PublicController }  from './public.controller';
import { PublicService }     from './public.service';
import { OperationsModule }  from '../operations/operations.module';

@Module({
  imports:     [OperationsModule],
  controllers: [PublicController],
  providers:   [PublicService],
})
export class PublicModule {}
