/**
 * AVAILABILITY ABUSE GUARD — §8 MVP-EXIT-FINAL+
 * ──────────────────────────────────────────────────────────────────────────────
 * Aynı IP + aynı personel için 60 saniye içinde 5'ten fazla farklı tarih
 * sorgulamasını engeller.
 *
 * Saldırı vektörü: Botlar, "hangi tarihte dolu?" tespiti için tüm ay boyunca
 * slot sorgular — DB'yi yoğun okur ve müsait tarihleri keşfeder.
 *
 * Savunma mekanizması (Lua atomik):
 *   1. SADD avail_probe:{ip}:{staffId} {date}  — tarih kümeye eklenir
 *   2. EXPIRE {key} 60                          — TTL penceresi 60s
 *   3. SCARD  {key}                            — distinct tarih sayısı döner
 *   4. SCARD > 5 → 429 Too Many Requests
 *
 * Neden Lua? SADD + EXPIRE + SCARD atomik olmazsa race condition oluşur.
 * ──────────────────────────────────────────────────────────────────────────────
 */

import {
  Injectable,
  CanActivate,
  ExecutionContext,
  Inject,
} from '@nestjs/common';
import { Request, Response } from 'express';
import Redis                 from 'ioredis';
import { REDIS_CLIENT }      from '../../../common/redis.module';

/** Lua: SADD + EXPIRE + SCARD — tek round-trip */
const ABUSE_LUA = `
redis.call("SADD",   KEYS[1], ARGV[1])
redis.call("EXPIRE", KEYS[1], ARGV[2])
return redis.call("SCARD", KEYS[1])
` as const;

/** 60s pencerede izin verilen maksimum farklı tarih sayısı */
const DISTINCT_DATE_LIMIT = 5;
/** Pencere süresi (saniye) */
const WINDOW_SECONDS      = 60;

@Injectable()
export class AvailabilityAbuseGuard implements CanActivate {
  constructor(
    @Inject(REDIS_CLIENT) private readonly redis: Redis,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const req     = context.switchToHttp().getRequest<Request>();
    const staffId = req.query['staffId'] as string | undefined;
    const date    = req.query['date']    as string | undefined;

    // Parametre yoksa guard geçer — ValidationPipe DTO hatası verecek
    if (!staffId || !date) return true;

    // Trust proxy 1 ile gerçek IP alınır (CloudFlare / nginx arkası)
    const rawIp = req.ip ?? (req.socket.remoteAddress ?? 'unknown');
    const ip    = rawIp.replace(/^::ffff:/, '');  // IPv4-mapped IPv6 temizle

    const key   = `avail_probe:${ip}:${staffId}`;
    const count = await this.redis
      .eval(ABUSE_LUA, 1, key, date, String(WINDOW_SECONDS))
      .catch(() => 0) as number;

    if (count > DISTINCT_DATE_LIMIT) {
      const res = context.switchToHttp().getResponse<Response>();
      res.status(429).json({
        statusCode: 429,
        message:    'Too Many Requests: availability probe limit exceeded',
        retryAfter: WINDOW_SECONDS,
      });
      return false;
    }

    return true;
  }
}
