/**
 * APPOINTMENT AVAILABILITY SERVICE — Faz 14
 * ─────────────────────────────────────────────────────────────────────────────
 * Takvim ekranlarının DB'yi öldürmesini önlemek için availability sonuçlarını
 * Redis'te cache'ler.
 *
 * Cache key formatı:
 *   calon:availability:{tenantId}:{staffId}:{YYYY-MM-DD}
 *
 * TTL: 60 saniye
 *
 * Invalidation tetikleyicileri:
 *   • Randevu create   → AppointmentService.create()
 *   • Randevu iptal    → AppointmentService.updateStatus(CANCELLED/NO_SHOW)
 *   • Randevu taşıma   → AppointmentService.reschedule()
 *     (eski ve yeni tarih için her ikisi de invalidate edilir)
 *
 * Cache içeriği:
 *   Belirli bir gün için personelin dolu slot'larını içeren JSON dizisi.
 *   Format: Array<{ startTime: string; endTime: string; status: string }>
 * ─────────────────────────────────────────────────────────────────────────────
 */

import { Inject, Injectable, Logger } from '@nestjs/common';
import { Appointment }                from '@prisma/client';
import Redis                          from 'ioredis';
import { PrismaService }              from '../../../common/prisma.service';
import { REDIS_CLIENT }               from '../../../common/redis.module';
import { redisKey }                   from '../../../common/redis.util';

/** Cache TTL: 60 saniye */
const AVAILABILITY_TTL_SECONDS = 60;

/** Slot özeti (cache içeriği) */
export interface SlotSummary {
  id:        string;
  startTime: string;
  endTime:   string;
  status:    string;
}

@Injectable()
export class AppointmentAvailabilityService {
  private readonly logger = new Logger(AppointmentAvailabilityService.name);

  constructor(
    @Inject(REDIS_CLIENT) private readonly redis: Redis,
    private readonly prisma: PrismaService,
  ) {}

  // ── Cache key ─────────────────────────────────────────────────────────────

  /**
   * calon:availability:{tenantId}:{staffId}:{YYYY-MM-DD}
   * startTime'dan gün kısmı alınarak normalize edilir.
   */
  private buildKey(tenantId: string, staffId: string, date: string): string {
    // date: 'YYYY-MM-DD' formatında beklenir
    return redisKey('availability', tenantId, staffId, date);
  }

  /**
   * ISO 8601 timestamp'tan gün stringi çıkarır (UTC).
   * '2026-03-15T09:00:00.000Z' → '2026-03-15'
   */
  private toDateString(dt: string | Date): string {
    const d = dt instanceof Date ? dt : new Date(dt);
    return d.toISOString().slice(0, 10);
  }

  // ── getOccupiedSlots ──────────────────────────────────────────────────────

  /**
   * Belirtilen gün için personelin dolu slotlarını döner.
   * Cache miss'te DB sorgusu yapılır ve sonuç cache'lenir.
   *
   * @param tenantId  JWT'den gelen doğrulanmış tenant
   * @param staffId   Sorgulanacak personel
   * @param date      YYYY-MM-DD formatında gün
   * @returns         Dolu slotların özet listesi
   */
  async getOccupiedSlots(
    tenantId: string,
    staffId:  string,
    date:     string,
  ): Promise<SlotSummary[]> {
    const cacheKey = this.buildKey(tenantId, staffId, date);

    // ── Cache hit ─────────────────────────────────────────────────────────
    const cached = await this.redis.get(cacheKey).catch(() => null);
    if (cached) {
      this.logger.debug(`Availability cache hit: ${cacheKey}`);
      return JSON.parse(cached) as SlotSummary[];
    }

    // ── Cache miss → DB sorgusu ───────────────────────────────────────────
    const dayStart = new Date(`${date}T00:00:00.000Z`);
    // dayEnd = bir sonraki günün UTC gece yarısı (exclusive üst sınır)
    // Range overlap: start < dayEnd AND end > dayStart
    // Bu sayede gece yarısını geçen çok saatlik randevular da yakalanır.
    const dayEnd   = new Date(dayStart.getTime() + 24 * 60 * 60 * 1000);

    const appointments = await this.prisma.appointment.findMany({
      where: {
        tenantId,
        staffId,
        isDeleted: false,
        status: {
          notIn: ['CANCELLED', 'NO_SHOW', 'COMPLETED'] as Appointment['status'][],
        },
        startTime: { lt: dayEnd },   // randevu gün bitmeden başlamışsa dahil et
        endTime:   { gt: dayStart }, // randevu gün başladıktan sonra bitiyorsa dahil et
      },
      select: {
        id:        true,
        startTime: true,
        endTime:   true,
        status:    true,
      },
      orderBy: { startTime: 'asc' },
    });

    const slots: SlotSummary[] = appointments.map((a) => ({
      id:        a.id,
      startTime: a.startTime.toISOString(),
      endTime:   a.endTime.toISOString(),
      status:    a.status,
    }));

    // Cache'e yaz — Redis çökerse sessizce devam et
    await this.redis.set(
      cacheKey,
      JSON.stringify(slots),
      'EX',
      AVAILABILITY_TTL_SECONDS,
    ).catch((err: Error) => {
      this.logger.warn(`Availability cache write failed: ${err.message}`);
    });

    this.logger.debug(`Availability cache miss → DB sorgusu: ${cacheKey} (${slots.length} slot)`);
    return slots;
  }

  // ── invalidate ────────────────────────────────────────────────────────────

  /**
   * Belirli bir gün için availability cache'ini siler.
   *
   * Çağrılma zamanları:
   *   • Randevu create sonrası
   *   • Randevu cancel/no-show sonrası
   *   • Randevu reschedule sonrası (eski + yeni gün)
   *
   * DEL idempotent'tir — key yoksa hata fırlatmaz.
   */
  async invalidate(
    tenantId:  string,
    staffId:   string,
    startTime: string | Date,
  ): Promise<void> {
    const date     = this.toDateString(startTime);
    const cacheKey = this.buildKey(tenantId, staffId, date);
    const deleted  = await this.redis.del(cacheKey).catch(() => 0);
    this.logger.debug(`Availability cache invalidated (deleted=${deleted}): ${cacheKey}`);
  }

  /**
   * Birden fazla gün için toplu invalidation.
   * Reschedule'da eski ve yeni günleri birlikte invalidate eder.
   */
  async invalidateMany(
    tenantId:  string,
    staffId:   string,
    times:     Array<string | Date>,
  ): Promise<void> {
    const keys = [...new Set(
      times.map((t) => this.buildKey(tenantId, staffId, this.toDateString(t))),
    )];
    if (keys.length > 0) {
      const deleted = await this.redis.del(...keys).catch(() => 0);
      this.logger.debug(`Availability cache bulk invalidated (deleted=${deleted}): ${keys.join(', ')}`);
    }
  }
}
