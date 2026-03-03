/**
 * METRICS SERVICE — In-Memory Request Metrics
 * ──────────────────────────────────────────────────────────────────────────────
 * Hafızada response time istatistikleri tutar.
 * Sliding window: son 10 000 ölçüm (yüksek kардinalite'yi önler).
 *
 * Metrikler:
 *   - total:    toplam istek sayısı
 *   - errors:   5xx yanıt sayısı
 *   - p50:      medyan gecikme (ms)
 *   - p95:      95. percentil gecikme (ms)
 *   - errorRate: % olarak hata oranı
 *
 * GET /api/v1/admin/metrics endpoint'i bu servisi kullanır.
 * ──────────────────────────────────────────────────────────────────────────────
 */

import { Injectable } from '@nestjs/common';

const WINDOW_SIZE = 10_000;

export interface MetricsSnapshot {
  total:     number;
  errors:    number;
  errorRate: string;
  p50:       number;
  p95:       number;
  uptimeMs:  number;
}

@Injectable()
export class MetricsService {
  private readonly durations: number[] = [];
  private total  = 0;
  private errors = 0;
  private readonly startedAt = Date.now();

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

  /** Anlık snapshot döner */
  snapshot(): MetricsSnapshot {
    const sorted  = [...this.durations].sort((a, b) => a - b);
    const len     = sorted.length;

    const p50 = len > 0 ? (sorted[Math.floor(len * 0.5)] ?? 0) : 0;
    const p95 = len > 0 ? (sorted[Math.floor(len * 0.95)] ?? 0) : 0;

    return {
      total:     this.total,
      errors:    this.errors,
      errorRate: this.total > 0
        ? ((this.errors / this.total) * 100).toFixed(2) + '%'
        : '0.00%',
      p50,
      p95,
      uptimeMs: Date.now() - this.startedAt,
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
