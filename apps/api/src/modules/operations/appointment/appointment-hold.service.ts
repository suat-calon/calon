/**
 * APPOINTMENT HOLD SERVICE — Faz 23
 * ─────────────────────────────────────────────────────────────────────────────
 * DB-backed slot kilidi: Redis NX (hızlı yol) + PostgreSQL GIST EXCLUDE (güçlü güvence).
 *
 * Hold FSM:
 *   ACTIVE → CONSUMED  (randevuya dönüştürüldü — consumeHold)
 *   ACTIVE → RELEASED  (kullanıcı vazgeçti    — releaseHold)
 *   ACTIVE → EXPIRED   (cron sona erdirdi      — expireStaleHolds)
 *
 * TTL: 10 dakika (kullanıcı ödeme/onay ekranındaki bekleme süresi)
 *
 * Redis key formatı:
 *   calon:hold:{tenantId}:{staffId}:{startEpochMs}
 *   Epoch ms kullanılır — farklı süreli servisler aynı startTime paylaşsa bile
 *   endTime unique'dir; GIST asıl overlap guard'dır.
 *
 * Güvenlik katmanları:
 *   1. Redis NX  — soft race guard (çakışmayı hızlıca yakalar, ~1ms)
 *   2. Uygulama overlap kontrolü — kullanıcı dostu 409 (DB'den önce)
 *   3. DB GIST EXCLUDE — kesin güvence (eş zamanlı inserter'ları engeller)
 * ─────────────────────────────────────────────────────────────────────────────
 */

import {
  ConflictException,
  Inject,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { Prisma }                          from '@prisma/client';
import { randomUUID }                      from 'crypto';
import Redis                               from 'ioredis';
import { PrismaService }                   from '../../../common/prisma.service';
import { REDIS_CLIENT }                    from '../../../common/redis.module';
import { redisKey }                        from '../../../common/redis.util';
import { toLocalDateKey }                  from '../../../common/scheduling.utils';
import { AppointmentAvailabilityService }  from './appointment-availability.service';

/** Hold TTL: 10 dakika */
const HOLD_TTL_SECONDS = 10 * 60;

@Injectable()
export class AppointmentHoldService {
  private readonly logger = new Logger(AppointmentHoldService.name);

  constructor(
    private readonly prisma:       PrismaService,
    @Inject(REDIS_CLIENT) private readonly redis: Redis,
    private readonly availability: AppointmentAvailabilityService,
  ) {}

  // ── acquireHold ───────────────────────────────────────────────────────────

  /**
   * Yeni bir DB-backed hold oluşturur.
   *
   * Adımlar:
   *   1. Redis NX — soft race guard
   *   2. Application-layer appointment overlap kontrolü (kullanıcı dostu 409)
   *   3. DB insert — GIST EXCLUDE hard guard
   *   4. Availability cache invalidate (yerel gün cache'i temizle)
   *
   * @param timezone  Tenant timezone (örn: 'Europe/Istanbul') — doğru gün cache key'i için
   * @throws ConflictException  Slot zaten dolu veya hold var (409)
   */
  async acquireHold(
    tenantId:  string,
    staffId:   string,
    serviceId: string,
    startTime: Date,
    endTime:   Date,
    timezone:  string,
  ): Promise<{ holdId: string; expiresAt: Date }> {
    const expiresAt   = new Date(Date.now() + HOLD_TTL_SECONDS * 1000);
    const holdToken   = randomUUID();
    const holdRedisKey = this.buildHoldKey(tenantId, staffId, startTime);
    const redisTtlSec  = Math.ceil((expiresAt.getTime() - Date.now()) / 1000);

    // ── 1. Redis NX — soft race guard ─────────────────────────────────────
    // NX: sadece key yoksa set et. null dönerse slot zaten kilitli.
    const nx = await this.redis
      .set(holdRedisKey, holdToken, 'EX', redisTtlSec, 'NX')
      .catch(() => null); // Redis çökerse null döner → yine de DB deneriz

    if (nx === null) {
      throw new ConflictException('Bu slot geçici olarak kilitli. Lütfen başka bir saat seçin.');
    }

    try {
      // ── 2. Application-layer overlap kontrolü ────────────────────────────
      // Range overlap: mevcut randevu yeni hold'la çakışıyor mu?
      const appointmentOverlap = await this.prisma.appointment.findFirst({
        where: {
          tenantId,
          staffId,
          isDeleted: false,
          status: { notIn: ['CANCELLED', 'NO_SHOW', 'COMPLETED'] },
          startTime: { lt: endTime   }, // mevcut başlangıcı yeni bitiş öncesinde
          endTime:   { gt: startTime }, // mevcut bitişi yeni başlangıç sonrasında
        },
        select: { id: true },
      });

      if (appointmentOverlap) {
        throw new ConflictException('Bu slot için mevcut bir randevu bulunuyor.');
      }

      // Aktif hold çakışması da kontrol et (GIST örtüşürse DB hatası atar ama erken yakalayalım)
      const holdOverlap = await this.prisma.appointmentHold.findFirst({
        where: {
          tenantId,
          staffId,
          status:    'ACTIVE',
          expiresAt: { gt: new Date() },
          startTime: { lt: endTime   },
          endTime:   { gt: startTime },
        },
        select: { id: true },
      });

      if (holdOverlap) {
        throw new ConflictException('Bu slot için aktif bir hold bulunuyor.');
      }

      // ── 3. DB insert — GIST EXCLUDE hard guard ───────────────────────────
      const hold = await this.prisma.appointmentHold.create({
        data: {
          tenantId,
          staffId,
          serviceId,
          startTime,
          endTime,
          expiresAt,
          status:    'ACTIVE',
          holdToken,
        },
      });

      // ── 4. Availability cache invalidate ─────────────────────────────────
      // Yerel gün key'i — UTC slice kullanmaz, DST-safe
      const dateKey = toLocalDateKey(startTime, timezone);
      await this.availability.invalidate(tenantId, staffId, dateKey).catch(() => {});

      this.logger.debug(
        `Hold alındı: ${hold.id} (${staffId} @ ${startTime.toISOString()})`,
      );

      return { holdId: hold.id, expiresAt };
    } catch (err) {
      // GIST violation veya ConflictException → Redis temizle
      await this.redis.del(holdRedisKey).catch(() => {});

      if (err instanceof ConflictException) throw err;

      // GIST P2010/P2002 hatası
      this.logger.warn(`Hold DB insert başarısız (GIST veya FK): ${(err as Error).message}`);
      throw new ConflictException('Slot çakışması: başka bir hold veya randevu mevcut.');
    }
  }

  // ── releaseHold ───────────────────────────────────────────────────────────

  /**
   * Kullanıcının aktif hold'unu RELEASED olarak işaretler.
   * Idempotent: ACTIVE olmayan hold'lara dokunmaz (no-op).
   *
   * @param timezone  Tenant timezone — doğru cache key invalidation için
   */
  async releaseHold(
    holdId:   string,
    tenantId: string,
    timezone: string,
  ): Promise<void> {
    const hold = await this.prisma.appointmentHold.findUnique({
      where:  { id: holdId },
      select: { tenantId: true, staffId: true, startTime: true, status: true },
    });

    if (!hold || hold.tenantId !== tenantId) {
      throw new NotFoundException('Hold bulunamadı.');
    }

    if (hold.status !== 'ACTIVE') {
      // Zaten terminal durumda — no-op
      this.logger.debug(`releaseHold no-op (status=${hold.status}): ${holdId}`);
      return;
    }

    await this.prisma.appointmentHold.update({
      where: { id: holdId },
      data:  { status: 'RELEASED' },
    });

    // Redis key temizle
    await this.redis
      .del(this.buildHoldKey(tenantId, hold.staffId, hold.startTime))
      .catch(() => {});

    // Availability cache temizle — slot serbest kaldı
    const dateKey = toLocalDateKey(hold.startTime, timezone);
    await this.availability.invalidate(tenantId, hold.staffId, dateKey).catch(() => {});

    this.logger.debug(`Hold serbest bırakıldı: ${holdId}`);
  }

  // ── consumeHold ───────────────────────────────────────────────────────────

  /**
   * Hold'u CONSUMED olarak işaretler — randevu oluşturma işleminin içinde çağrılır.
   * Caller, DB transaction tamamlandıktan SONRA dönen redisKey'i siler.
   *
   * Neden redisKey caller'da silinir?
   *   Redis operasyonları DB transaction içine alınmaz.
   *   Transaction rollback olursa Redis zaten temizlenmemiş olur (hold geçerli kalır).
   *   Transaction commit sonrası Redis silme en güvenli sıra.
   *
   * @param tx  Prisma transaction client (caller sağlar)
   * @returns   { redisKey } — caller commit sonrası siler
   * @throws ConflictException  Hold ACTIVE değilse veya süresi dolmuşsa (409)
   * @throws NotFoundException  Hold bulunamazsa (404)
   */
  async consumeHold(
    holdId:   string,
    tenantId: string,
    tx:       Prisma.TransactionClient,
  ): Promise<{ redisKey: string }> {
    const hold = await tx.appointmentHold.findUnique({
      where:  { id: holdId },
      select: {
        tenantId:  true,
        staffId:   true,
        startTime: true,
        status:    true,
        expiresAt: true,
      },
    });

    if (!hold || hold.tenantId !== tenantId) {
      throw new NotFoundException('Hold bulunamadı.');
    }

    if (hold.status !== 'ACTIVE') {
      throw new ConflictException(`Hold ${hold.status} durumunda — tüketilemez.`);
    }

    if (hold.expiresAt < new Date()) {
      throw new ConflictException('Hold süresi dolmuş. Lütfen yeni bir hold oluşturun.');
    }

    await tx.appointmentHold.update({
      where: { id: holdId },
      data:  { status: 'CONSUMED' },
    });

    return {
      redisKey: this.buildHoldKey(tenantId, hold.staffId, hold.startTime),
    };
  }

  // ── expireStaleHolds ──────────────────────────────────────────────────────

  /**
   * Cron tarafından çağrılır (her 5 dakikada bir).
   * ACTIVE + expiresAt < now → EXPIRED + Redis temizle + cache invalidate.
   *
   * Tenant timezone'larını toplu çekerek toLocalDateKey kullanır;
   * gece yarısı sınırlarını doğru hesaplar.
   */
  async expireStaleHolds(): Promise<void> {
    const stale = await this.prisma.appointmentHold.findMany({
      where: {
        status:    'ACTIVE',
        expiresAt: { lt: new Date() },
      },
      select: {
        id:        true,
        tenantId:  true,
        staffId:   true,
        startTime: true,
      },
    });

    if (stale.length === 0) return;

    // DB'de EXPIRED işaretle
    await this.prisma.appointmentHold.updateMany({
      where: { id: { in: stale.map((h) => h.id) } },
      data:  { status: 'EXPIRED' },
    });

    // Redis hold key'lerini temizle (best-effort)
    await Promise.allSettled(
      stale.map((h) =>
        this.redis.del(this.buildHoldKey(h.tenantId, h.staffId, h.startTime)),
      ),
    );

    // Availability cache'i invalidate et
    // Tek sorguda tüm tenant timezone'larını çek
    const tenantIds = [...new Set(stale.map((h) => h.tenantId))];
    const tenants = await this.prisma.tenant.findMany({
      where:  { id: { in: tenantIds } },
      select: { id: true, timezone: true },
    });
    const tzMap = new Map(tenants.map((t) => [t.id, t.timezone]));

    // De-duplikasyon: aynı (tenantId, staffId, date) kombinasyonunu bir kez temizle
    const uniqueKeys = [
      ...new Set(
        stale.map((h) => {
          const tz   = tzMap.get(h.tenantId) ?? 'UTC';
          const date = toLocalDateKey(h.startTime, tz);
          return `${h.tenantId}:${h.staffId}:${date}`;
        }),
      ),
    ];

    await Promise.allSettled(
      uniqueKeys.map((key) => {
        const [tenantId, staffId, date] = key.split(':') as [string, string, string];
        return this.availability.invalidate(tenantId, staffId, date);
      }),
    );

    this.logger.debug(
      `expireStaleHolds: ${stale.length} hold EXPIRED yapıldı, ` +
      `${uniqueKeys.length} cache key temizlendi`,
    );
  }

  // ── Yardımcılar ───────────────────────────────────────────────────────────

  /**
   * Redis hold key (epoch ms — ISO string değil).
   * Farklı süreli servisler aynı startTime paylaşsa bile GIST overlap guard'dır.
   * calon:hold:{tenantId}:{staffId}:{startEpochMs}
   */
  buildHoldKey(tenantId: string, staffId: string, startTime: Date): string {
    return redisKey('hold', tenantId, staffId, String(startTime.getTime()));
  }

  /**
   * DB transaction commit sonrası Redis hold key'ini sil (best-effort).
   *
   * consumeHold() → { redisKey } döner → caller transaction commit sonrası bu metodu çağırır.
   * Neden transaction içinde değil?
   *   Redis operasyonları DB transaction'a katılmaz; transaction rollback olursa
   *   Redis'e yazılan del geri alınamaz. Commit sonrası çağrı en güvenli sıra.
   */
  async deleteHoldRedisKey(redisKey: string): Promise<void> {
    await this.redis.del(redisKey).catch(() => {});
  }
}
