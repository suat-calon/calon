/**
 * APPOINTMENT LOCK SERVICE — Redis Soft-Lock (Hold TTL)
 * ─────────────────────────────────────────────────────────────────────────────
 * Randevu alım akışında "saat seç → ödeme ekranına geç" sürecinde aynı slotu
 * birden fazla kullanıcının eş zamanlı rezerve etmesini önler.
 *
 * Mekanizma:
 *   • Redis SET … NX EX 300 (atomik SETNX + TTL)
 *   • Anahtar zaten varsa → 409 Conflict
 *   • Randevu Prisma'ya kaydedilince kilit silinir (releaseSlot)
 *   • TTL dolunca kilit otomatik kalkar (5 dk) — kullanıcı işlem yapmadıysa
 *
 * Güvenlik:
 *   • TenantGuard zaten tüm isteklerde tenantId doğrular
 *   • Kilit anahtarı: hold:{tenantId}:{staffId}:{startTime ISO}
 *     → Cross-tenant çakışması mümkün değil
 * ─────────────────────────────────────────────────────────────────────────────
 */

import { ConflictException, Inject, Injectable, Logger } from '@nestjs/common';
import Redis                                              from 'ioredis';
import { REDIS_CLIENT }                                  from '../../../common/redis.module';

/** Kilit süresi: 5 dakika (saniye cinsinden) */
const HOLD_TTL_SECONDS = 5 * 60;

@Injectable()
export class AppointmentLockService {
  private readonly logger = new Logger(AppointmentLockService.name);

  constructor(
    @Inject(REDIS_CLIENT) private readonly redis: Redis,
  ) {}

  // ── Anahtar oluşturucu ───────────────────────────────────────────────────

  /**
   * hold:{tenantId}:{staffId}:{startTime}
   * startTime her zaman ISO 8601 string'e normalize edilir.
   */
  private buildKey(
    tenantId:  string,
    staffId:   string,
    startTime: string | Date,
  ): string {
    const ts = startTime instanceof Date
      ? startTime.toISOString()
      : startTime;
    return `hold:${tenantId}:${staffId}:${ts}`;
  }

  // ── holdSlot ─────────────────────────────────────────────────────────────

  /**
   * Bir slot'u geçici olarak kilitler.
   *
   * Redis komutu: SET key value NX EX 300
   *   • NX → yalnızca anahtar yoksa yaz (SETNX semantiği)
   *   • EX 300 → 5 dakika TTL
   *   • result === null → anahtar zaten mevcuttu → ConflictException
   *
   * @param tenantId  - JWT'den gelen doğrulanmış tenant
   * @param staffId   - Kilitlenecek personel
   * @param startTime - Kilitlenecek başlangıç saati
   * @param holdBy    - Kilidi kimin oluşturduğu (userId, debug amaçlı)
   * @throws ConflictException  eğer slot zaten kilitliyse (409)
   */
  async holdSlot(
    tenantId:  string,
    staffId:   string,
    startTime: string | Date,
    holdBy?:   string,
  ): Promise<void> {
    const key   = this.buildKey(tenantId, staffId, startTime);
    const value = holdBy ?? 'anonymous';

    const result = await this.redis.set(key, value, 'EX', HOLD_TTL_SECONDS, 'NX');

    if (result === null) {
      // null → SET NX başarısız → anahtar zaten var → başkası kilitli
      this.logger.warn(`Slot zaten kilitli: ${key}`);
      throw new ConflictException(
        'Bu saat dilimi geçici olarak kilitli. Lütfen birkaç dakika sonra tekrar deneyin.',
      );
    }

    this.logger.debug(`Slot kilitlendi (${HOLD_TTL_SECONDS}s TTL): ${key} → ${value}`);
  }

  // ── releaseSlot ──────────────────────────────────────────────────────────

  /**
   * Redis'teki geçici kilidi kaldırır.
   *
   * Çağrılma zamanı:
   *   • Randevu Prisma'ya başarıyla kaydedildiğinde (AppointmentService.create)
   *
   * DEL başarısız olsa bile (key zaten expire olmuş) hata fırlatmaz;
   * zira TTL dolunca kilit zaten kalkmış demektir.
   *
   * @param tenantId  - JWT'den gelen doğrulanmış tenant
   * @param staffId   - Serbest bırakılacak personel
   * @param startTime - Serbest bırakılacak başlangıç saati
   */
  async releaseSlot(
    tenantId:  string,
    staffId:   string,
    startTime: string | Date,
  ): Promise<void> {
    const key    = this.buildKey(tenantId, staffId, startTime);
    const deleted = await this.redis.del(key);
    this.logger.debug(`Slot serbest bırakıldı (deleted=${deleted}): ${key}`);
  }
}
