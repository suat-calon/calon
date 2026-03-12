/**
 * LOGGING INTERCEPTOR — Per-Request Structured Log + Prometheus Metrics
 * ──────────────────────────────────────────────────────────────────────────────
 * Her HTTP isteği için tamamlanma log'u yazar:
 *   { correlationId, tenantId, userId, path, method, statusCode, durationMs }
 *
 * Pino logger (PinoLogger from nestjs-pino) kullanır.
 * MetricsService: p50/p95 sliding window.
 * PrometheusService: histogram + counter (scrape'de kullanılır).
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
import { PrometheusService }            from './prometheus.service';

@Injectable()
export class LoggingInterceptor implements NestInterceptor {
  constructor(
    @InjectPinoLogger(LoggingInterceptor.name)
    private readonly logger:     PinoLogger,
    private readonly metrics:    MetricsService,
    private readonly prometheus: PrometheusService,
  ) {}

  intercept(context: ExecutionContext, next: CallHandler): Observable<unknown> {
    const http  = context.switchToHttp();
    const req   = http.getRequest<Request & { tenantId?: string; userId?: string }>();
    const res   = http.getResponse<Response>();
    const start = Date.now();

    return next.handle().pipe(
      tap({
        next:  () => { this.log(req, res, start); },
        error: () => { this.log(req, res, start); },
      }),
    );
  }

  private log(
    req: Request & { tenantId?: string; userId?: string },
    res: Response,
    start: number,
  ): void {
    const durationMs    = Date.now() - start;
    const statusCode    = res.statusCode;
    const correlationId = getCorrelationId();

    // In-memory sliding window (p50/p95)
    this.metrics.record(durationMs, statusCode);

    // Prometheus histogram + counter
    this.prometheus.observeRequest(req.method, req.path, statusCode, durationMs);

    const payload = {
      correlationId,
      tenantId:   req.tenantId,
      userId:     req.userId,
      method:     req.method,
      path:       req.path,
      statusCode,
      durationMs,
    };

    if (statusCode >= 500)      this.logger.error(payload, 'request completed');
    else if (statusCode >= 400) this.logger.warn(payload, 'request completed');
    else                        this.logger.info(payload, 'request completed');
  }
}
