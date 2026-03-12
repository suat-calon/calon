/**
 * PROMETHEUS CONTROLLER — GET /metrics
 * ──────────────────────────────────────────────────────────────────────────────
 * Prometheus pull-model metrikleri döner.
 *
 * Path: /metrics  (main.ts'de global prefix'ten hariç tutulmuştur)
 * Content-Type: text/plain; version=0.0.4; charset=utf-8
 *
 * Scrape anında:
 *   1. QueueMetricsService.getAll() — tüm queue'ların anlık sayıları
 *   2. PrometheusService.queueJobsActive gauge'u güncellenir
 *   3. prom-client registry metin formatında render edilir
 *
 * ThrottlerGuard ve TenantGuard bypass edilir:
 *   @SkipThrottle() + @Public() — internal scraper (Prometheus) için
 * ──────────────────────────────────────────────────────────────────────────────
 */

import {
  Controller,
  Get,
  Res,
} from '@nestjs/common';
import { SkipThrottle } from '@nestjs/throttler';
import { Response }     from 'express';

import { PrometheusService }   from '../../common/logging/prometheus.service';
import { QueueMetricsService } from '../../common/queue/queue-metrics.service';
import { Public }              from '../iam/guards/tenant.guard';

@SkipThrottle()
@Public()
@Controller('metrics')
export class PrometheusController {
  constructor(
    private readonly prometheus:    PrometheusService,
    private readonly queueMetrics:  QueueMetricsService,
  ) {}

  /**
   * GET /metrics — Prometheus text-format scrape endpoint
   * Gauge değerleri scrape anında güncellenir (pull model).
   */
  @Get()
  async scrape(@Res() res: Response): Promise<void> {
    // Queue gauge'larını güncelle
    const allQueues = await this.queueMetrics.getAll();
    for (const [queueName, stats] of Object.entries(allQueues)) {
      this.prometheus.queueJobsActive
        .labels({ queue: queueName })
        .set(stats.active);
    }

    const body = await this.prometheus.getMetrics();
    res
      .set('Content-Type', this.prometheus.contentType)
      .send(body);
  }
}
