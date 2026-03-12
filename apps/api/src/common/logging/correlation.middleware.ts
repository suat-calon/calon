/**
 * CORRELATION MIDDLEWARE
 * ──────────────────────────────────────────────────────────────────────────────
 * Her HTTP isteğine bir requestId/correlationId atar.
 *
 * Header öncelik sırası (ilk bulunan kullanılır):
 *   1. x-request-id     — standart RFC / AWS / GCP header'ı
 *   2. x-correlation-id — eski Calon gateway uyumu
 *   3. crypto.randomUUID() — server üretir
 *
 * Yanıt header'larında hem x-request-id hem x-correlation-id geri döner
 * (ikisi aynı değeri taşır — istemci uyumluluğu).
 *
 * correlationId, AsyncLocalStorage aracılığıyla tüm log satırlarına enjekte edilir.
 * ──────────────────────────────────────────────────────────────────────────────
 */

import { Injectable, NestMiddleware } from '@nestjs/common';
import { Request, Response, NextFunction } from 'express';
import { randomUUID } from 'crypto';
import { CorrelationStore } from './correlation.store';

@Injectable()
export class CorrelationMiddleware implements NestMiddleware {
  use(req: Request, res: Response, next: NextFunction): void {
    // x-request-id öncelikli; yoksa x-correlation-id; yoksa yeni UUID
    const correlationId =
      (req.headers['x-request-id']     as string | undefined)?.trim() ||
      (req.headers['x-correlation-id'] as string | undefined)?.trim() ||
      randomUUID();

    // Her iki header da yanıtta döner — gateway/log aggregator uyumu
    res.setHeader('x-request-id',     correlationId);
    res.setHeader('x-correlation-id', correlationId);

    // AsyncLocalStorage store'a yaz — tüm downstream çağrılar okuyabilir
    CorrelationStore.run({ correlationId }, next);
  }
}
