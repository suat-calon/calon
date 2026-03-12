/**
 * REDIS LOCK SERVICE — MVP-EXIT-FINAL
 * ──────────────────────────────────────────────────────────────────────────────
 * Distributed Redis lock: acquire (SET NX PX) + safe release (Lua CAS).
 *
 * Problem çözülen:
 *   Worker A lock alır → çöker → TTL sona erer → Worker B aynı key'i alır →
 *   Worker A yeniden başlar → DEL çağırır → Worker B'nin kilidi silinir.
 *
 * Çözüm — Lua atomik CAS:
 *   if redis.call("get", KEYS[1]) == ARGV[1]
 *     then return redis.call("del", KEYS[1])
 *   else return 0
 *   end
 *
 *   DEL yalnızca token eşleşirse çalışır → yanlış sahip kilidi silemez.
 *
 * Kullanım:
 *   const token = await lock.acquireLock(key, ttlMs);
 *   if (!token) throw new ConflictException('...');
 *   try { ... } finally { await lock.releaseLock(key, token); }
 * ──────────────────────────────────────────────────────────────────────────────
 */

import { Inject, Injectable, Logger } from '@nestjs/common';
import { randomUUID }                 from 'crypto';
import Redis                          from 'ioredis';
import { REDIS_CLIENT }               from './redis-tokens';

/**
 * Lua script: atomik compare-and-delete.
 * Token eşleşmezse 0 döner (key silinmez).
 * 1 script EVALSHA ile SHA hash üzerinden çalışır — bandwidth tasarrufu.
 */
const RELEASE_SCRIPT = `
if redis.call("get", KEYS[1]) == ARGV[1] then
  return redis.call("del", KEYS[1])
else
  return 0
end
` as const;

@Injectable()
export class RedisLockService {
  private readonly logger = new Logger(RedisLockService.name);

  constructor(
    @Inject(REDIS_CLIENT) private readonly redis: Redis,
  ) {}

  /**
   * Redis lock'u atomik SET NX PX ile alır.
   *
   * @param key    Redis anahtar (caller namespace oluşturur)
   * @param ttlMs  Milisaniye cinsinden TTL (otomatik expire)
   * @returns      UUID token (releaseLock için gerekli) ya da null (slot dolu)
   */
  async acquireLock(key: string, ttlMs: number): Promise<string | null> {
    const token  = randomUUID();
    const result = await this.redis
      .set(key, token, 'PX', ttlMs, 'NX')
      .catch((err: unknown) => {
        this.logger.warn(`acquireLock Redis hata (${key}): ${String(err)}`);
        return null;
      });

    if (result === null) {
      return null;
    }

    this.logger.debug(`Lock alındı (${ttlMs}ms): ${key}`);
    return token;
  }

  /**
   * Lock'u Lua CAS ile güvenli şekilde serbest bırakır.
   * Token eşleşmezse (başka worker'a ait) key dokunulmaz, false döner.
   *
   * @param key    Redis anahtar
   * @param token  acquireLock'tan dönen UUID
   * @returns      true = silindi, false = sahip değiliz (başka worker'ın kilidi)
   */
  async releaseLock(key: string, token: string): Promise<boolean> {
    const result = await this.redis
      .eval(RELEASE_SCRIPT, 1, key, token)
      .catch((err: unknown) => {
        this.logger.warn(`releaseLock Redis hata (${key}): ${String(err)}`);
        return 0;
      });

    const released = result === 1;
    this.logger.debug(`Lock serbest (released=${released}): ${key}`);
    return released;
  }
}
