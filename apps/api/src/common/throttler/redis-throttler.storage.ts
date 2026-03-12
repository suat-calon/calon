/**
 * Redis-backed ThrottlerStorage — Faz MVP-EXIT-GATE
 * ──────────────────────────────────────────────────────────────────────────────
 * @nestjs/throttler v6 ThrottlerStorage arayüzünü uygular.
 *
 * Strateji:
 *   INCR  — atomik sayaç artırımı (Redis tek komut garantisi)
 *   PTTL  — milisaniye cinsinden kalan TTL (pipeline → tek RTT)
 *   PEXPIRE — ilk isabet sonrası expiry ayarla (pttl < 0 → henüz set edilmemiş)
 *
 * Neden pttl < 0 kontrolü?
 *   INCR key yoksa oluşturur ama expiry ayarlamaz.
 *   PTTL → -2 (key yok, INCR sonrası olamaz) ya da -1 (expiry yok).
 *   Her iki durum da pttl < 0 → PEXPIRE tetiklenir.
 *
 * Redis key formatı: throttle:<throttlerName>:<key>
 *   Örnek: throttle:default:abc123::ffff:127.0.0.1_PublicController_acquireHold
 * ──────────────────────────────────────────────────────────────────────────────
 */

import type Redis           from 'ioredis';
import { ThrottlerStorage } from '@nestjs/throttler';
// ThrottlerStorageRecord is not re-exported from @nestjs/throttler public index;
// import directly from the internal declaration file.
import type { ThrottlerStorageRecord } from '@nestjs/throttler/dist/throttler-storage-record.interface';

export class RedisThrottlerStorage implements ThrottlerStorage {
  constructor(private readonly redis: Redis) {}

  async increment(
    key:           string,
    ttl:           number,   // milisaniye (v6 ms cinsinden)
    limit:         number,
    blockDuration: number,   // blok süresi ms (0 → devre dışı)
    throttlerName: string,
  ): Promise<ThrottlerStorageRecord> {
    const rKey = `throttle:${throttlerName}:${key}`;

    // ── Atomik pipeline: INCR + PTTL ─────────────────────────────────────────
    const pipeline = this.redis.pipeline();
    pipeline.incr(rKey);
    pipeline.pttl(rKey);
    const results = (await pipeline.exec()) as
      [[Error | null, number], [Error | null, number]];

    const totalHits = results[0][1];
    const pttl      = results[1][1];

    // ── İlk isabet → expiry yoksa ayarla ─────────────────────────────────────
    // pttl === -1: key var, expiry yok (INCR yeni oluşturdu)
    // pttl === -2: key yok (INCR sonrası olmamalı, savunma amaçlı)
    if (pttl < 0) {
      await this.redis.pexpire(rKey, ttl);
    }

    return {
      totalHits,
      timeToExpire:      pttl > 0 ? pttl : ttl,
      isBlocked:         totalHits > limit,
      timeToBlockExpire: totalHits > limit ? blockDuration : 0,
    };
  }
}
