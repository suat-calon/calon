/**
 * LOYALTY MODULE — Faz 11 Sadakat MVP
 * ──────────────────────────────────────────────────────────────────────────────
 * Notlar:
 *   • BullModule import EDİLMEZ — RedisModule @Global() ile 'loyalty-earn' kuyruğunu
 *     zaten kayıt etti ve tüm modüllere açtı.
 *   • PrismaService provide EDİLMEZ — DatabaseModule @Global().
 *   • IdempotencyInterceptor: PrismaService global olduğundan DI ile çözümlenir.
 * ──────────────────────────────────────────────────────────────────────────────
 */

import { Module } from '@nestjs/common';

import { IdempotencyInterceptor } from '../../common/idempotency.interceptor';
import { LoyaltyController }      from './loyalty.controller';
import { LoyaltyService }         from './loyalty.service';
import { LoyaltyProcessor }       from './loyalty.processor';
import { ProPlanGuard }           from './guards/pro-plan.guard';

@Module({
  controllers: [LoyaltyController],
  providers:   [
    LoyaltyService,
    LoyaltyProcessor,
    ProPlanGuard,
    IdempotencyInterceptor, // Redeem endpoint'inde @UseInterceptors ile kullanılır
  ],
  exports:     [LoyaltyService], // AppointmentService'e gerekirse inject edilebilir
})
export class LoyaltyModule {}
