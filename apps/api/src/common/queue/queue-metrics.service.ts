/**
 * QUEUE METRICS SERVICE — §7 MVP-EXIT-FINAL+
 * ──────────────────────────────────────────────────────────────────────────────
 * Tüm Bull queue'ları için anlık iş sayılarını döner.
 * PrometheusController scrape anında bu servisi çağırır ve
 * queue_jobs_active Gauge değerlerini günceller.
 *
 * GET /api/v1/admin/metrics endpoint'i de queueStats alanında bu veriyi kullanır.
 * ──────────────────────────────────────────────────────────────────────────────
 */

import { Injectable } from '@nestjs/common';
import { InjectQueue } from '@nestjs/bull';
import { Queue }       from 'bull';
import { QUEUE_NAMES } from './queue-names';

export interface QueueStats {
  waiting:   number;
  active:    number;
  completed: number;
  failed:    number;
  delayed:   number;
}

@Injectable()
export class QueueMetricsService {
  constructor(
    @InjectQueue(QUEUE_NAMES.NOTIFICATIONS)
    private readonly notificationsQueue: Queue,

    @InjectQueue(QUEUE_NAMES.STOCK_DEDUCT)
    private readonly stockDeductQueue: Queue,

    @InjectQueue(QUEUE_NAMES.LOYALTY_EARN)
    private readonly loyaltyEarnQueue: Queue,

    @InjectQueue(QUEUE_NAMES.HUMAN_HANDOFF)
    private readonly humanHandoffQueue: Queue,

    @InjectQueue(QUEUE_NAMES.CAMPAIGN)
    private readonly campaignQueue: Queue,

    @InjectQueue(QUEUE_NAMES.REFERRAL_PROCESS)
    private readonly referralProcessQueue: Queue,

    @InjectQueue(QUEUE_NAMES.EVENT_DISPATCH)
    private readonly eventDispatchQueue: Queue,

    @InjectQueue(QUEUE_NAMES.NOTIFICATION_SMS)
    private readonly smsQueue: Queue,

    @InjectQueue(QUEUE_NAMES.NOTIFICATION_EMAIL)
    private readonly emailQueue: Queue,

    @InjectQueue(QUEUE_NAMES.NOTIFICATION_PUSH)
    private readonly pushQueue: Queue,

    @InjectQueue(QUEUE_NAMES.NOTIFICATION_DLQ)
    private readonly dlqQueue: Queue,

    @InjectQueue(QUEUE_NAMES.NOTIFICATION_RECOVERY)
    private readonly recoveryQueue: Queue,
  ) {}

  /**
   * Tüm queue'ların anlık sayılarını döner.
   * Key: queue adı, Value: { waiting, active, completed, failed, delayed }
   */
  async getAll(): Promise<Record<string, QueueStats>> {
    const queues: [string, Queue][] = [
      [QUEUE_NAMES.NOTIFICATIONS,         this.notificationsQueue],
      [QUEUE_NAMES.STOCK_DEDUCT,          this.stockDeductQueue],
      [QUEUE_NAMES.LOYALTY_EARN,          this.loyaltyEarnQueue],
      [QUEUE_NAMES.HUMAN_HANDOFF,         this.humanHandoffQueue],
      [QUEUE_NAMES.CAMPAIGN,              this.campaignQueue],
      [QUEUE_NAMES.REFERRAL_PROCESS,      this.referralProcessQueue],
      [QUEUE_NAMES.EVENT_DISPATCH,        this.eventDispatchQueue],
      [QUEUE_NAMES.NOTIFICATION_SMS,      this.smsQueue],
      [QUEUE_NAMES.NOTIFICATION_EMAIL,    this.emailQueue],
      [QUEUE_NAMES.NOTIFICATION_PUSH,     this.pushQueue],
      [QUEUE_NAMES.NOTIFICATION_DLQ,      this.dlqQueue],
      [QUEUE_NAMES.NOTIFICATION_RECOVERY, this.recoveryQueue],
    ];

    const entries = await Promise.all(
      queues.map(async ([name, queue]) => {
        const [waiting, active, completed, failed, delayed] = await Promise.all([
          queue.getWaitingCount(),
          queue.getActiveCount(),
          queue.getCompletedCount(),
          queue.getFailedCount(),
          queue.getDelayedCount(),
        ]);
        return [name, { waiting, active, completed, failed, delayed }] as const;
      }),
    );

    return Object.fromEntries(entries);
  }
}
