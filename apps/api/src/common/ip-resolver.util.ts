/**
 * IP RESOLVER UTILITY — MVP-GATE-1 (Pre-flight hotfix)
 * ──────────────────────────────────────────────────────────────────────────────
 * NestJS @Ip() dekoratörü yalnızca socket.remoteAddress'i döndürür.
 * Cloudflare veya ters proxy arkasında gerçek istemci IP'si farklı header'larda
 * taşınır. Bu yardımcı, doğru sırayla kontrol ederek güvenilir IP'yi döndürür.
 *
 * Öncelik sırası:
 *   1. cf-connecting-ip  — Cloudflare'ın enjekte ettiği gerçek istemci IP'si
 *   2. x-forwarded-for   — Standart ters-proxy header'ı (ilk değer alınır)
 *   3. request.ip        — NestJS / Fastify / Express'in çözümlediği IP
 *
 * Güvenlik notu:
 *   x-forwarded-for başlığı istemci tarafından taklit edilebilir. Uygulamanın
 *   yalnızca güvenilir proxy'ler (Cloudflare, nginx) arkasında çalıştığı
 *   varsayılmaktadır. Doğrudan dışa açık dağıtımlarda request.ip tercih edilir.
 * ──────────────────────────────────────────────────────────────────────────────
 */

import { Request } from 'express';

/**
 * Gelen HTTP isteğinden gerçek istemci IP adresini çözümler.
 *
 * @param req - Express/NestJS Request nesnesi
 * @returns IP adresi string'i; hiçbiri bulunamazsa 'unknown'
 */
export function resolveClientIp(req: Request): string {
  // 1. Cloudflare: tek bir IPv4 veya IPv6 adresi içerir — doğrudan kullanılır
  const cfIp = req.headers['cf-connecting-ip'];
  if (cfIp && typeof cfIp === 'string' && cfIp.trim()) {
    return cfIp.trim();
  }

  // 2. x-forwarded-for: "client, proxy1, proxy2" formatında; ilk değer istemci
  const xff = req.headers['x-forwarded-for'];
  if (xff) {
    const raw = Array.isArray(xff) ? xff[0] : xff;
    const first = raw.split(',')[0]?.trim();
    if (first) return first;
  }

  // 3. Express/NestJS çözümlenmiş IP (socket adresi, trust proxy ayarına göre)
  return req.ip ?? 'unknown';
}
