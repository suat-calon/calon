/**
 * SCHEDULING CRON — Faz 23
 * ─────────────────────────────────────────────────────────────────────────────
 * Hold sona erme tarayıcısı.
 *
 * Her 5 dakikada bir:
 *   ACTIVE + expiresAt < now → EXPIRED + Redis hold key temizle + availability cache invalidate
 *
 * Neden ayrı Cron sınıfı?
 *   BillingCron'a eklemek çapraz modül bağımlılığı yaratır (OperationsModule ↔ BillingModule).
 *   Bu sınıf OperationsModule içinde kalır; bağımlılık tek yönlü olur.
 *
 * ScheduleModule: BillingModule @Global() içinde forRoot() ile kayıtlı —
 *   OperationsModule'de tekrar import gerekmez.
 * ─────────────────────────────────────────────────────────────────────────────
 */

import { Injectable, Logger } from '@nestjs/common';
import { Cron }               from '@nestjs/schedule';
import { AppointmentHoldService } from './appointment-hold.service';

@Injectable()
export class SchedulingCron {
  private readonly logger = new Logger(SchedulingCron.name);

  constructor(private readonly holds: AppointmentHoldService) {}

  /**
   * Her 5 dakikada bir çalışır.
   * Süresi dolmuş ACTIVE hold'ları EXPIRED olarak işaretler,
   * Redis key'lerini temizler ve availability cache'i invalidate eder.
   *
   * Concurrency: NestJS Schedule tek thread'de çalışır; çakışma riski yok.
   * Hata toleransı: expireStaleHolds() kendi hata yönetimini yapar (best-effort).
   */
  @Cron('*/5 * * * *')
  async expireStaleHolds(): Promise<void> {
    this.logger.debug('[SchedulingCron] Stale hold sona erme taraması başladı.');
    try {
      await this.holds.expireStaleHolds();
      this.logger.debug('[SchedulingCron] Tamamlandı.');
    } catch (err) {
      // Cron hatası uygulamayı çökertmemeli — logla ve geç.
      this.logger.error(
        `[SchedulingCron] expireStaleHolds hatası: ${(err as Error).message}`,
        (err as Error).stack,
      );
    }
  }
}
