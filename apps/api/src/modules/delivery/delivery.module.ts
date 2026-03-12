/**
 * DELIVERY MODULE
 * ──────────────────────────────────────────────────────────────────────────────
 * Sorumluluklar:
 *   - DeliveryRepository: event_deliveries CRUD + state transitions
 *   - RetryPolicy: kanal bazlı retry konfigürasyonu
 * ──────────────────────────────────────────────────────────────────────────────
 */

import { Global, Module } from '@nestjs/common';
import { DeliveryRepository } from './delivery.repository';

@Global()
@Module({
  providers: [DeliveryRepository],
  exports:   [DeliveryRepository],
})
export class DeliveryModule {}
