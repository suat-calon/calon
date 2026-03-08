/**
 * APPOINTMENT LOCK SERVICE — Redis Soft-Lock (Hold TTL) + Concurrency Lock
 * ─────────────────────────────────────────────────────────────────────────────
 * İki farklı kilit mekanizması yönetir:
 *
 * 1. HOLD LOCK (Kullanıcı yüzü)
 *    • calon:hold:{tenantId}:{staffId}:{startTime} — TTL 10 dakika
 *    • Kullanıcı UI'da saat seçince ödeme/onay ekranına geçiş sırasında
 *      slotu geçici olarak kilitler.
 *    • API: POST /appointments/hold
 *
 * 2. CONCURRENCY LOCK (Sunucu içi — Faz 14)
 *    • calon:lock:appointment:{tenantId}:{staffId}:{startTime} — TTL 10 saniye
 *    • AppointmentService.create() ve reschedule() içinde DB transaction
 *      başlamadan önce alınır.
 *    • Eş zamanlı isteklerin aynı slotu yarışarak oluşturmasını engeller.
 *    • Transaction bitince release edilir.
 *
 * Güvenlik:
 *   • TenantGuard tüm isteklerde tenantId doğrular
 *   • Cross-tenant çakışması imkânsız (tenantId anahtar parçası)
 * ─────────────────────────────────────────────────────────────────────────────
 */

import { ConflictException, Inject, Injectable, Logger } from '@nestjs/common';
import Redis                                              from 'ioredis';
import { REDIS_CLIENT }                                  from '../../../common/redis.module';
import { redisKey }                                      from '../../../common/redis.util';

/** Hold lock TTL: 10 dakika (kullanıcı ödeme/onay ekranında bekleme süresi) */
const HOLD_TTL_SECONDS = 10 * 60;

/** Concurrency lock TTL: 10 saniye (DB transaction süresinden uzun olmalı) */
const CONCURRENCY_TTL_SECONDS = 10;

@Injectable()
export class AppointmentLockService {
  private readonly logger = new Logger(AppointmentLockService.name);

  constructor(
    @Inject(REDIS_CLIENT) private readonly redis: Redis,
  ) {}

  // ── Anahtar oluşturucular ──────────────────────────────────────────────────

  /**
   * calon:hold:{tenantId}:{staffId}:{startTime}
   * 5 dakikalık kullanıcı hold kilidi
   */
  private buildHoldKey(
    tenantId:  string,
    staffId:   string,
    startTime: string | Date,
  ): string {
    const ts = startTime instanceof Date ? startTime.toISOString() : startTime;
    return redisKey('hold', tenantId, staffId, ts);
  }

  /**
   * calon:lock:appointment:{tenantId}:{staffId}:{startTime}
   * 10 saniyelik concurrency kilidi (transaction içi kullanım)
   */
  private buildConcurrencyKey(
    tenantId:  string,
    staffId:   string,
    startTime: string | Date,
  ): string {
    const ts = startTime instanceof Date ? startTime.toISOString() : startTime;
    return redisKey('lock', 'appointment', tenantId, staffId, ts);
  }

  // ── HOLD LOCK ─────────────────────────────────────────────────────────────

  /**
   * Bir slot'u kullanıcı hold kilidiyle kilitler.
   *
   * Redis komutu: SET key value NX EX 300
   * @throws ConflictException  eğer slot zaten kilitliyse (409)
   */
  async holdSlot(
    tenantId:  string,
    staffId:   string,
    startTime: string | Date,
    holdBy?:   string,
  ): Promise<void> {
    const key    = this.buildHoldKey(tenantId, staffId, startTime);
    const value  = holdBy ?? 'anonymous';
    const result = await this.redis.set(key, value, 'EX', HOLD_TTL_SECONDS, 'NX');

    if (result === null) {
      this.logger.warn(`Hold kilidi aktif: ${key}`);
      throw new ConflictException(
        'Bu saat dilimi geçici olarak kilitli. Lütfen birkaç dakika sonra tekrar deneyin.',
      );
    }

    this.logger.debug(`Hold kilidi alındı (${HOLD_TTL_SECONDS}s): ${key} → ${value}`);
  }

  /**
   * Hold kilidini serbest bırakır.
   * Randevu Prisma'ya kaydedilince veya kullanıcı vazgeçince çağrılır.
   */
  async releaseSlot(
    tenantId:  string,
    staffId:   string,
    startTime: string | Date,
  ): Promise<void> {
    const key     = this.buildHoldKey(tenantId, staffId, startTime);
    const deleted = await this.redis.del(key);
    this.logger.debug(`Hold kilidi serbest (deleted=${deleted}): ${key}`);
  }

  /**
   * Belirli bir gün için aktif hold kilitleri olan başlangıç zamanlarını döndürür.
   *
   * Availability hesaplamasında kullanılır: Redis'te kilitli slotlar DB sorgusu
   * dışında da müsait görünmemeli.
   *
   * Pattern: calon:hold:{tenantId}:{staffId}:*
   * Sonuçlar `date` (YYYY-MM-DD) ile başlayan startTime ISO string'lerine filtreler.
   *
   * Redis bağlantı hatasında boş dizi döner (graceful fallback — availability
   * hesabı sadece DB slotlarına düşer, double-booking riski kabul edilir).
   */
  async getHeldSlots(
    tenantId: string,
    staffId:  string,
    date:     string, // YYYY-MM-DD
  ): Promise<string[]> {
    try {
      // calon:hold:{tenantId}:{staffId}:* — tüm hold kilitlerini SCAN ile tara
      // KEYS O(n) yerine cursor-tabanlı SCAN: production'da bloklamaz
      const pattern = redisKey('hold', tenantId, staffId, '*');
      const keys: string[] = [];
      let cursor = '0';

      do {
        const [nextCursor, batch] = await this.redis.scan(
          cursor,
          'MATCH', pattern,
          'COUNT', 100,
        );
        cursor = nextCursor;
        keys.push(...batch);
      } while (cursor !== '0');

      if (keys.length === 0) return [];

      // Anahtarın son parçası startTime ISO string'i; gün eşleştir
      return keys
        .map((k) => {
          // redisKey separator ':' — son segment'i al
          const parts = k.split(':');
          return parts[parts.length - 1] ?? '';
        })
        .filter((ts) => ts.startsWith(date)); // 2025-06-15T... gibi
    } catch (err) {
      this.logger.warn(`getHeldSlots Redis hatası (graceful fallback): ${(err as Error).message}`);
      return [];
    }
  }

  // ── CONCURRENCY LOCK (Faz 14) ─────────────────────────────────────────────

  /**
   * Kısa süreli concurrency kilidi alır.
   *
   * AppointmentService.create() ve reschedule() içinde DB transaction
   * başlamadan önce çağrılır. Aynı slot için eş zamanlı yarışı önler.
   *
   * Redis komutu: SET key 1 NX EX 10
   * @returns lockKey — releaseConcurrencyLock() için kullanılır
   * @throws ConflictException  eğer slot zaten işlemdeyse (409)
   */
  async acquireConcurrencyLock(
    tenantId:  string,
    staffId:   string,
    startTime: string | Date,
  ): Promise<string> {
    const key    = this.buildConcurrencyKey(tenantId, staffId, startTime);
    const result = await this.redis.set(key, '1', 'EX', CONCURRENCY_TTL_SECONDS, 'NX');

    if (result === null) {
      this.logger.warn(`Concurrency kilidi aktif: ${key}`);
      throw new ConflictException(
        'Appointment slot currently locked — eş zamanlı istek çakışması',
      );
    }

    this.logger.debug(`Concurrency kilidi alındı (${CONCURRENCY_TTL_SECONDS}s): ${key}`);
    return key;
  }

  /**
   * Concurrency kilidini serbest bırakır.
   * Transaction başarılı veya başarısız olsun, finally bloğunda çağrılır.
   */
  async releaseConcurrencyLock(lockKey: string): Promise<void> {
    const deleted = await this.redis.del(lockKey);
    this.logger.debug(`Concurrency kilidi serbest (deleted=${deleted}): ${lockKey}`);
  }
}
