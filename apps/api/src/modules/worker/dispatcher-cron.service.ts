/**
 * DISPATCHER CRON SERVICE
 * ──────────────────────────────────────────────────────────────────────────────
 * Sweeper/güvence cron'u: PENDING event_outbox event'lerini her dakika tarar
 * ve EVENT_DISPATCH queue'ya idempotent job olarak basar.
 *
 * Faz 24.5 sonrası bu cron'un rolü değişti:
 *   - Artık "ana taşıyıcı" değil, "sweeper" (ağ kopması / zamanlı event güvencesi).
 *   - Gerçek zamanlı dispatch: OutboxListenerService (pg_notify) tarafından yapılır.
 *   - Bu cron sadece LISTEN/NOTIFY'ın kaçırdığı veya scheduledFor > now olan
 *     event'leri toplar.
 * ──────────────────────────────────────────────────────────────────────────────
 */

import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { InjectQueue }                      from '@nestjs/bull';
import { Cron, CronExpression }             from '@nestjs/schedule';
import { Queue }                            from 'bull';

import { QUEUE_NAMES }      from '../../common/queue/queue-names';
import { OutboxRepository } from '../event/outbox.repository';

@Injectable()
export class DispatcherCronService implements OnModuleInit {
  private readonly logger = new Logger(DispatcherCronService.name);

  constructor(
    private readonly outbox: OutboxRepository,
    @InjectQueue(QUEUE_NAMES.EVENT_DISPATCH)
    private readonly dispatchQueue: Queue,
    @InjectQueue(QUEUE_NAMES.NOTIFICATION_RECOVERY)
    private readonly recoveryQueue: Queue,
  ) {}

  onModuleInit() {
    this.logger.log('[DispatcherCron] Başlatıldı (sweeper modu)');
  }

  /**
   * Her 5 dakika: kaçırılan / zamanlı PENDING event'leri tara.
   * Normal akışta pg_notify zaten anında dispatch eder; bu cron sadece güvence.
   */
  @Cron(CronExpression.EVERY_5_MINUTES)
  async pollAndDispatch(): Promise<void> {
    const events = await this.outbox.findEligibleEvents(50);
    if (events.length === 0) return;

    this.logger.log(`[DispatcherCron] ${events.length} sweeper event, kuyruğa basılıyor`);

    // Tüm queue.add çağrıları paralel — 50 serial Redis call yerine 1 batch
    await Promise.all(
      events.map(event =>
        this.dispatchQueue.add(
          'dispatch',
          { eventId: event.id, tenantId: event.tenantId },
          {
            jobId:            `dispatch:${event.id}`, // idempotent
            attempts:         1,
            removeOnComplete: 200,
            removeOnFail:     100,
          },
        ),
      ),
    );
  }

  /** Her 5 dakika: Recovery processor'ı tetikle */
  @Cron(CronExpression.EVERY_5_MINUTES)
  async triggerRecovery(): Promise<void> {
    await this.recoveryQueue.add(
      'recover',
      { triggeredBy: 'cron' },
      {
        jobId:            `recovery:${Date.now()}`,
        attempts:         1,
        removeOnComplete: 10,
        removeOnFail:     10,
      },
    );
  }
}
