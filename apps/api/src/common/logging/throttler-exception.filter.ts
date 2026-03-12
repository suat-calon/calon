/**
 * THROTTLER EXCEPTION FILTER
 * ──────────────────────────────────────────────────────────────────────────────
 * ThrottlerException yakalanır:
 *   1. PrometheusService.incRateLimitRejection(path) çağrılır
 *   2. 429 Too Many Requests + standart rate-limit header'ları yazılır
 *
 * X-RateLimit-Limit ve X-RateLimit-Remaining header'ları
 * ThrottlerGuard zaten response'a yazar; bu filter sadece metrics günceller.
 * ──────────────────────────────────────────────────────────────────────────────
 */

import {
  ExceptionFilter,
  Catch,
  ArgumentsHost,
  HttpStatus,
} from '@nestjs/common';
import { ThrottlerException } from '@nestjs/throttler';
import { Request, Response }  from 'express';
import { PrometheusService }  from './prometheus.service';

@Catch(ThrottlerException)
export class ThrottlerExceptionFilter implements ExceptionFilter {
  constructor(private readonly prometheus: PrometheusService) {}

  catch(_exception: ThrottlerException, host: ArgumentsHost): void {
    const ctx  = host.switchToHttp();
    const req  = ctx.getRequest<Request>();
    const res  = ctx.getResponse<Response>();

    // Prometheus sayacını artır
    const endpoint = `${req.method} ${req.path}`;
    this.prometheus.incRateLimitRejection(endpoint);

    res.status(HttpStatus.TOO_MANY_REQUESTS).json({
      statusCode: HttpStatus.TOO_MANY_REQUESTS,
      message:    'Too Many Requests',
      path:       req.path,
    });
  }
}
