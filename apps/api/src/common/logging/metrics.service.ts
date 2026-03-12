/**
 * METRICS SERVICE — In-Memory Request + Worker Metrics
 * ──────────────────────────────────────────────────────────────────────────────
 * Hafızada response time istatistikleri ve worker sayaçları tutar.
 * Sliding window: son 10 000 ölçüm (yüksek kardinalite'yi önler).
 *
 * HTTP Metrikleri:
 *   - total:     toplam istek sayısı
 *   - errors:    5xx yanıt sayısı
 *   - p50:       medyan gecikme (ms)
 *   - p95:       95. percentil gecikme (ms)
 *   - errorRate: % olarak hata oranı
 *
 * Worker Metrikleri (MVP-GATE-1):
 *   - eventDispatched / eventDispatchFailed
 *   - smsSent / smsFailed
 *   - emailSent / emailFailed
 *   - pushSent / pushFailed
 *   - dlqTotal
 *   - archiveRowsMoved / archiveFailures / archiveDurationMs (son çalışma)
 *
 * Ek sayaçlar (MVP-EXIT-FINAL+):
 *   - rateLimitRejections: 429 yanıt sayısı
 *   - redisLockFailures:   Redis lock alınamadığı sayısı
 *   - archiveBatches:      arşiv worker batch sayısı
 *
 * GET /api/v1/admin/metrics endpoint'i bu servisi kullanır.
 * ──────────────────────────────────────────────────────────────────────────────
 */

import { Injectable } from '@nestjs/common';

const WINDOW_SIZE = 10_000;

export interface MetricsSnapshot {
  total:                number;
  errors:               number;
  errorRate:            string;
  p50:                  number;
  p95:                  number;
  uptimeMs:             number;
  rateLimitRejections:  number;
  redisLockFailures:    number;
}

export interface WorkerMetricsSnapshot {
  eventDispatched:       number;
  eventDispatchFailed:   number;
  smsSent:               number;
  smsFailed:             number;
  emailSent:             number;
  emailFailed:           number;
  pushSent:              number;
  pushFailed:            number;
  dlqTotal:              number;
  archiveRowsMoved:      number;
  archiveFailures:       number;
  archiveLastDurationMs: number | null;
  archiveBatches:        number;
}

@Injectable()
export class MetricsService {
  // ── HTTP metrics ────────────────────────────────────────────────────────────
  private readonly durations: number[] = [];
  private total  = 0;
  private errors = 0;
  private readonly startedAt = Date.now();

  // ── Yeni sayaçlar (MVP-EXIT-FINAL+) ─────────────────────────────────────────
  private rateLimitRejections = 0;
  private redisLockFailures   = 0;

  // ── Worker counters ─────────────────────────────────────────────────────────
  private eventDispatched     = 0;
  private eventDispatchFailed = 0;
  private smsSent             = 0;
  private smsFailed           = 0;
  private emailSent           = 0;
  private emailFailed         = 0;
  private pushSent            = 0;
  private pushFailed          = 0;
  private dlqTotal            = 0;
  private archiveRowsMoved    = 0;
  private archiveFailures     = 0;
  private archiveLastDurationMs: number | null = null;
  private archiveBatches      = 0;

  // ── HTTP ─────────────────────────────────────────────────────────────────────

  /** Her istek tamamlandığında LoggingInterceptor çağırır */
  record(durationMs: number, statusCode: number): void {
    this.total++;
    if (statusCode >= 500) this.errors++;

    // Sliding window — eski ölçümleri sil
    if (this.durations.length >= WINDOW_SIZE) {
      this.durations.shift();
    }
    this.durations.push(durationMs);
  }

  /** Rate limit aşımı (ThrottlerExceptionFilter çağırır) */
  incRateLimitRejection(): void { this.rateLimitRejections++; }

  /** Redis lock alınamadığında (RedisLockService çağırır) */
  incRedisLockFailure(): void { this.redisLockFailures++; }

  /** Anlık HTTP snapshot döner */
  snapshot(): MetricsSnapshot {
    const sorted = [...this.durations].sort((a, b) => a - b);
    const len    = sorted.length;

    const p50 = len > 0 ? (sorted[Math.floor(len * 0.5)]  ?? 0) : 0;
    const p95 = len > 0 ? (sorted[Math.floor(len * 0.95)] ?? 0) : 0;

    return {
      total:               this.total,
      errors:              this.errors,
      errorRate:           this.total > 0
        ? ((this.errors / this.total) * 100).toFixed(2) + '%'
        : '0.00%',
      p50,
      p95,
      uptimeMs:            Date.now() - this.startedAt,
      rateLimitRejections: this.rateLimitRejections,
      redisLockFailures:   this.redisLockFailures,
    };
  }

  // ── Worker counters ─────────────────────────────────────────────────────────

  incEventDispatched():     void { this.eventDispatched++; }
  incEventDispatchFailed(): void { this.eventDispatchFailed++; }

  incSmsSent():    void { this.smsSent++; }
  incSmsFailed():  void { this.smsFailed++; }

  incEmailSent():   void { this.emailSent++; }
  incEmailFailed(): void { this.emailFailed++; }

  incPushSent():   void { this.pushSent++; }
  incPushFailed(): void { this.pushFailed++; }

  incDlq(): void { this.dlqTotal++; }

  incArchiveRows(n: number):      void { this.archiveRowsMoved += n; }
  incArchiveFailures():           void { this.archiveFailures++; }
  setArchiveDuration(ms: number): void { this.archiveLastDurationMs = ms; }
  incArchiveBatch():              void { this.archiveBatches++; }

  /** Anlık worker snapshot döner */
  workerSnapshot(): WorkerMetricsSnapshot {
    return {
      eventDispatched:       this.eventDispatched,
      eventDispatchFailed:   this.eventDispatchFailed,
      smsSent:               this.smsSent,
      smsFailed:             this.smsFailed,
      emailSent:             this.emailSent,
      emailFailed:           this.emailFailed,
      pushSent:              this.pushSent,
      pushFailed:            this.pushFailed,
      dlqTotal:              this.dlqTotal,
      archiveRowsMoved:      this.archiveRowsMoved,
      archiveFailures:       this.archiveFailures,
      archiveLastDurationMs: this.archiveLastDurationMs,
      archiveBatches:        this.archiveBatches,
    };
  }

  /** SIGTERM / shutdown hook için özet log satırı */
  summaryLine(): string {
    const s = this.snapshot();
    return (
      `[Metrics] shutdown summary — ` +
      `total=${s.total} errors=${s.errors} errorRate=${s.errorRate} ` +
      `p50=${s.p50}ms p95=${s.p95}ms uptime=${s.uptimeMs}ms`
    );
  }
}
