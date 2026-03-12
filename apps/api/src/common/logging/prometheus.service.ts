/**
 * PROMETHEUS SERVICE — prom-client tabanlı metrik koleksiyonu
 * ──────────────────────────────────────────────────────────────────────────────
 * GET /metrics endpoint'ine Prometheus text formatında veri sağlar.
 *
 * Tanımlı metrikler:
 *   http_requests_total            — Counter (method, path, status_code)
 *   http_request_duration_seconds  — Histogram (method, path)
 *   redis_lock_failures_total      — Counter (kilit alınamadığında)
 *   rate_limit_rejections_total    — Counter (endpoint) — ThrottlerException
 *   archive_worker_batches_total   — Counter (başarılı arşiv batch)
 *   queue_jobs_active              — Gauge (queue) — scrape anında güncellenir
 *
 * @Global() LoggingModule içinde tanımlanır → tüm modüller inject edebilir.
 * ──────────────────────────────────────────────────────────────────────────────
 */

import { Injectable } from '@nestjs/common';
import {
  Counter,
  Histogram,
  Gauge,
  Registry,
} from 'prom-client';

@Injectable()
export class PrometheusService {
  /** Izole registry — global default registry'yi kirletmez */
  readonly registry = new Registry();

  // ── HTTP request counter ──────────────────────────────────────────────────
  private readonly httpRequestsTotal = new Counter({
    name:       'http_requests_total',
    help:       'Toplam HTTP istek sayısı',
    labelNames: ['method', 'path', 'status_code'] as const,
    registers:  [this.registry],
  });

  // ── HTTP request duration histogram ──────────────────────────────────────
  private readonly httpRequestDuration = new Histogram({
    name:       'http_request_duration_seconds',
    help:       'HTTP istek süresi (saniye)',
    labelNames: ['method', 'path'] as const,
    buckets:    [0.005, 0.01, 0.025, 0.05, 0.1, 0.25, 0.5, 1, 2.5, 5],
    registers:  [this.registry],
  });

  // ── Redis distributed lock failure counter ────────────────────────────────
  private readonly redisLockFailures = new Counter({
    name:      'redis_lock_failures_total',
    help:      'Redis distributed lock alınamadığı sayısı',
    registers: [this.registry],
  });

  // ── Rate limit rejection counter ──────────────────────────────────────────
  private readonly rateLimitRejections = new Counter({
    name:       'rate_limit_rejections_total',
    help:       'Rate limit aşımı (HTTP 429) sayısı',
    labelNames: ['endpoint'] as const,
    registers:  [this.registry],
  });

  // ── Archive worker batch counter ──────────────────────────────────────────
  private readonly archiveBatches = new Counter({
    name:      'archive_worker_batches_total',
    help:      'Archive worker tarafından işlenen batch sayısı',
    registers: [this.registry],
  });

  // ── Queue active jobs gauge ───────────────────────────────────────────────
  readonly queueJobsActive = new Gauge({
    name:       'queue_jobs_active',
    help:       'Kuyruktaki aktif job sayısı',
    labelNames: ['queue'] as const,
    registers:  [this.registry],
  });

  // ── Public API ────────────────────────────────────────────────────────────

  /**
   * Her HTTP isteği tamamlandığında LoggingInterceptor çağırır.
   */
  observeRequest(
    method:     string,
    path:       string,
    statusCode: number,
    durationMs: number,
  ): void {
    this.httpRequestsTotal
      .labels({ method, path, status_code: String(statusCode) })
      .inc();
    this.httpRequestDuration
      .labels({ method, path })
      .observe(durationMs / 1_000);
  }

  /**
   * RedisLockService: lock alınamadığında (acquireLock null döndürdüğünde) çağrılır.
   */
  incLockFailure(): void {
    this.redisLockFailures.inc();
  }

  /**
   * ThrottlerExceptionFilter: HTTP 429 üretildiğinde çağrılır.
   */
  incRateLimitRejection(endpoint: string): void {
    this.rateLimitRejections.labels({ endpoint }).inc();
  }

  /**
   * ArchiveService: başarılı batch tamamlandığında çağrılır.
   */
  incArchiveBatch(): void {
    this.archiveBatches.inc();
  }

  /**
   * PrometheusController: scrape anında çağrılır → güncel metin formatı döner.
   */
  async getMetrics(): Promise<string> {
    return this.registry.metrics();
  }

  /** Content-type header değeri */
  get contentType(): string {
    return this.registry.contentType;
  }
}
