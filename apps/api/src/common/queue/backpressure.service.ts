/**
 * BACKPRESSURE SERVICE — Kuyruk Yoğunluğu Denetimi
 * ──────────────────────────────────────────────────────────────────────────────
 * Toplam bekleyen job sayısı THRESHOLD'u aşarsa yeni enqueue'ları engeller.
 * Caller (AppointmentService, BillingService vs.) bunu kontrol eder ve
 * 429 Too Many Requests fırlatır.
 *
 * İzlenen kuyruklar: loyalty-earn, stock-deduct (kritik iş kuyruklarının)
 * THRESHOLD: 500 waiting job (üretimde Prometheus metriğine göre ayarla)
 * ──────────────────────────────────────────────────────────────────────────────
 */

import { Injectable, Logger } from '@nestjs/common';
import { InjectQueue }         from '@nestjs/bull';
import { Queue }               from 'bull';
import { QUEUE_NAMES }         from './queue-names';

/** Toplam pending job eşiği — aşılınca backpressure devreye girer */
const BACKPRESSURE_THRESHOLD = 500;

@Injectable()
export class BackpressureService {
  private readonly logger = new Logger(BackpressureService.name);

  constructor(
    @InjectQueue(QUEUE_NAMES.LOYALTY_EARN)  private readonly loyaltyQueue: Queue,
    @InjectQueue(QUEUE_NAMES.STOCK_DEDUCT)  private readonly stockQueue: Queue,
  ) {}

  /**
   * Kritik kuyruklardaki toplam waiting + active job sayısını döner.
   * Eşik kontrolü için isOverloaded() tercih edilir.
   */
  async getTotalPendingJobs(): Promise<number> {
    const [loyaltyWaiting, loyaltyActive, stockWaiting, stockActive] =
      await Promise.all([
        this.loyaltyQueue.getWaitingCount(),
        this.loyaltyQueue.getActiveCount(),
        this.stockQueue.getWaitingCount(),
        this.stockQueue.getActiveCount(),
      ]);

    return loyaltyWaiting + loyaltyActive + stockWaiting + stockActive;
  }

  /**
   * Eşiği aşıldıysa true döner.
   * Caller bu değer true ise 429 / 503 fırlatmalı.
   */
  async isOverloaded(): Promise<boolean> {
    const total = await this.getTotalPendingJobs();
    if (total >= BACKPRESSURE_THRESHOLD) {
      this.logger.warn(
        `[Backpressure] Eşik aşıldı: total=${total} threshold=${BACKPRESSURE_THRESHOLD}`,
      );
      return true;
    }
    return false;
  }

  /**
   * Belirli bir kuyruk için waiting sayısını döner.
   * Admin metrics endpoint'inde kullanılır.
   */
  async getQueueStats(): Promise<Record<string, { waiting: number; active: number }>> {
    const [lw, la, sw, sa] = await Promise.all([
      this.loyaltyQueue.getWaitingCount(),
      this.loyaltyQueue.getActiveCount(),
      this.stockQueue.getWaitingCount(),
      this.stockQueue.getActiveCount(),
    ]);

    return {
      [QUEUE_NAMES.LOYALTY_EARN]: { waiting: lw, active: la },
      [QUEUE_NAMES.STOCK_DEDUCT]: { waiting: sw, active: sa },
    };
  }
}
