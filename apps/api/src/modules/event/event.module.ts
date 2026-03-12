/**
 * EVENT MODULE
 * ──────────────────────────────────────────────────────────────────────────────
 * Sorumluluklar:
 *   - OutboxRepository: event_outbox CRUD + state transitions
 *   - EventProducerService: domain event → outbox insert helper'ları
 *
 * @Global() — EventProducerService tüm domain modüllerine açık.
 * ──────────────────────────────────────────────────────────────────────────────
 */

import { Global, Module } from '@nestjs/common';
import { OutboxRepository }      from './outbox.repository';
import { EventProducerService }  from './event-producer.service';

@Global()
@Module({
  providers: [
    OutboxRepository,
    EventProducerService,
  ],
  exports: [
    OutboxRepository,
    EventProducerService,
  ],
})
export class EventModule {}
