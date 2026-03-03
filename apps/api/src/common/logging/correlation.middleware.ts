/**
 * CORRELATION MIDDLEWARE
 * ──────────────────────────────────────────────────────────────────────────────
 * Her HTTP isteğine bir correlationId atar.
 *   - header: x-correlation-id varsa kullan (gateway veya test'ten geliyorsa)
 *   - yoksa crypto.randomUUID() ile üret
 * correlationId, AsyncLocalStorage aracılığıyla tüm log satırlarına enjekte edilir.
 * Yanıt header'ına da x-correlation-id olarak eklenir.
 * ──────────────────────────────────────────────────────────────────────────────
 */

import { Injectable, NestMiddleware } from '@nestjs/common';
import { Request, Response, NextFunction } from 'express';
import { randomUUID } from 'crypto';
import { CorrelationStore } from './correlation.store';

@Injectable()
export class CorrelationMiddleware implements NestMiddleware {
  use(req: Request, res: Response, next: NextFunction): void {
    const correlationId =
      (req.headers['x-correlation-id'] as string | undefined) ?? randomUUID();

    // Yanıt header'ına ekle
    res.setHeader('x-correlation-id', correlationId);

    // AsyncLocalStorage store'a yaz — tüm downstream çağrılar okuyabilir
    CorrelationStore.run({ correlationId }, next);
  }
}
