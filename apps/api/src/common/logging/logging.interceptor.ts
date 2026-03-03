/**
 * LOGGING INTERCEPTOR — Per-Request Structured Log
 * ──────────────────────────────────────────────────────────────────────────────
 * Her HTTP isteği için tamamlanma log'u yazar:
 *   { correlationId, tenantId, userId, path, method, statusCode, durationMs }
 *
 * Pino logger (PinoLogger from nestjs-pino) kullanır.
 * MetricsService'e de kayıt düşer (p50/p95 için).
 * ──────────────────────────────────────────────────────────────────────────────
 */

import {
  Injectable,
  NestInterceptor,
  ExecutionContext,
  CallHandler,
} from '@nestjs/common';
import { Observable } from 'rxjs';
import { tap }        from 'rxjs/operators';
import { InjectPinoLogger, PinoLogger } from 'nestjs-pino';
import { Request, Response }            from 'express';
import { getCorrelationId }             from './correlation.store';
import { MetricsService }               from './metrics.service';

@Injectable()
export class LoggingInterceptor implements NestInterceptor {
  constructor(
    @InjectPinoLogger(LoggingInterceptor.name)
    private readonly logger: PinoLogger,
    private readonly metrics: MetricsService,
  ) {}

  intercept(context: ExecutionContext, next: CallHandler): Observable<unknown> {
    const http     = context.switchToHttp();
    const req      = http.getRequest<Request & { tenantId?: string; userId?: string }>();
    const res      = http.getResponse<Response>();
    const start    = Date.now();

    return next.handle().pipe(
      tap({
        next: () => {
          this.log(req, res, start);
        },
        error: () => {
          // Hata durumunda da log yaz; statusCode exception filter'dan önce gelir
          this.log(req, res, start);
        },
      }),
    );
  }

  private log(
    req: Request & { tenantId?: string; userId?: string },
    res: Response,
    start: number,
  ): void {
    const durationMs   = Date.now() - start;
    const statusCode   = res.statusCode;
    const correlationId = getCorrelationId();

    this.metrics.record(durationMs, statusCode);

    const logPayload = {
      correlationId,
      tenantId:   req.tenantId,
      userId:     req.userId,
      method:     req.method,
      path:       req.path,
      statusCode,
      durationMs,
    };

    if (statusCode >= 500) {
      this.logger.error(logPayload, 'request completed');
    } else if (statusCode >= 400) {
      this.logger.warn(logPayload, 'request completed');
    } else {
      this.logger.info(logPayload, 'request completed');
    }
  }
}
