/**
 * ARCHIVE SERVICE — MVP-GATE-1 (Faz 25)
 * ──────────────────────────────────────────────────────────────────────────────
 * Terminal duruma geçmiş event_outbox ve event_deliveries satırlarını
 * arşive taşır ve hot tablolardan siler.
 *
 * Arşivleme kriterleri:
 *   EventOutbox:   status IN (DELIVERED, DEAD_LETTERED, CANCELLED)
 *                  AND completedAt <= now() - RETENTION_DAYS
 *
 *   EventDelivery: status IN (DELIVERED, PERMANENT_FAILURE)
 *                  AND updatedAt  <= now() - RETENTION_DAYS
 *
 * Güvenlik:
 *   - Aktif (PENDING/PROCESSING/FAILED/DISPATCHED) satırlar ASLA taşınmaz.
 *   - BATCH_SIZE sınırı: büyük toplu silmede tablo kilidi oluşmasını önler.
 *   - INSERT + DELETE aynı transaction'da: veri kaybı imkânsız.
 *
 * Retention:
 *   ARCHIVE_RETENTION_DAYS env değişkeni ile yapılandırılır (varsayılan: 30).
 * ──────────────────────────────────────────────────────────────────────────────
 */

import { Injectable, Logger, Optional } from '@nestjs/common';
import { Cron, CronExpression }         from '@nestjs/schedule';

import { PrismaService }     from '../../common/prisma.service';
import { MetricsService }    from '../../common/logging/metrics.service';
import { PrometheusService } from '../../common/logging/prometheus.service';

// ── Yapılandırma sabitleri ────────────────────────────────────────────────────
const RETENTION_DAYS = Number(process.env['ARCHIVE_RETENTION_DAYS'] ?? 30);
const BATCH_SIZE     = 500;  // tek seferde maksimum satır — tablo kilidi koruması

// ── Terminal durum kümeleri ───────────────────────────────────────────────────
const OUTBOX_TERMINAL_STATUSES   = ['DELIVERED', 'DEAD_LETTERED', 'CANCELLED'] as const;
const DELIVERY_TERMINAL_STATUSES = ['DELIVERED', 'PERMANENT_FAILURE'] as const;

@Injectable()
export class ArchiveService {
  private readonly logger = new Logger(ArchiveService.name);

  constructor(
    private readonly prisma:      PrismaService,
    private readonly metrics:     MetricsService,
    @Optional() private readonly prometheus?: PrometheusService,
  ) {}

  // ── Cron: Her gün 03:00 UTC ─────────────────────────────────────────────────
  @Cron(CronExpression.EVERY_DAY_AT_3AM)
  async runArchive(): Promise<void> {
    const startMs  = Date.now();
    const cutoff   = new Date(Date.now() - RETENTION_DAYS * 24 * 60 * 60 * 1000);

    this.logger.log(
      `[Archive] Başlatılıyor — cutoff=${cutoff.toISOString()} ` +
      `retentionDays=${RETENTION_DAYS} batchSize=${BATCH_SIZE}`,
    );

    let totalMoved = 0;

    try {
      const [outboxMoved, deliveryMoved] = await Promise.all([
        this.archiveOutbox(cutoff),
        this.archiveDeliveries(cutoff),
      ]);

      totalMoved = outboxMoved + deliveryMoved;

      const durationMs = Date.now() - startMs;
      this.metrics.incArchiveRows(totalMoved);
      this.metrics.setArchiveDuration(durationMs);
      this.metrics.incArchiveBatch();
      this.prometheus?.incArchiveBatch();

      this.logger.log(
        `[Archive] Tamamlandı — outbox=${outboxMoved} delivery=${deliveryMoved} ` +
        `total=${totalMoved} duration=${durationMs}ms`,
      );
    } catch (err) {
      this.metrics.incArchiveFailures();
      this.logger.error(
        `[Archive] Hata — ${err instanceof Error ? err.message : String(err)}`,
        err instanceof Error ? err.stack : undefined,
      );
      throw err;
    }
  }

  // ── EventOutbox arşivleme ────────────────────────────────────────────────────

  private async archiveOutbox(cutoff: Date): Promise<number> {
    // SELECT + INSERT + DELETE tek transaction içinde — eşzamanlı çalışma güvenli.
    // FOR UPDATE SKIP LOCKED: başka bir arşiv işi aynı satırları atlayarak devam eder.
    return this.prisma.$transaction(async (tx) => {
      // 1. Arşivlenecek ID'leri kilitle (BATCH_SIZE sınırı + SKIP LOCKED)
      const locked = await tx.$queryRaw<{ id: string }[]>`
        SELECT id FROM "event_outbox"
        WHERE  status      IN (${OUTBOX_TERMINAL_STATUSES[0]}, ${OUTBOX_TERMINAL_STATUSES[1]}, ${OUTBOX_TERMINAL_STATUSES[2]})
        AND    "completedAt" <= ${cutoff}
        ORDER  BY "completedAt"
        LIMIT  ${BATCH_SIZE}
        FOR UPDATE SKIP LOCKED
      `;

      if (locked.length === 0) return 0;

      const ids = locked.map((r) => r.id);

      // 2. Tam satırları yükle (Prisma modelleme ile)
      const rows = await tx.eventOutbox.findMany({ where: { id: { in: ids } } });

      // 3. Archive tablosuna ekle
      await tx.eventOutboxArchive.createMany({
        data: rows.map((r) => ({
          id:                  r.id,
          tenantId:            r.tenantId,
          aggregateType:       r.aggregateType,
          aggregateId:         r.aggregateId,
          eventName:           r.eventName,
          eventVersion:        r.eventVersion,
          occurredAt:          r.occurredAt,
          scheduledFor:        r.scheduledFor,
          status:              r.status,
          partitionKey:        r.partitionKey,
          correlationId:       r.correlationId ?? null,
          causationId:         r.causationId   ?? null,
          idempotencyKey:      r.idempotencyKey,
          payload:             r.payload as object,
          metadata:            r.metadata as object,
          dispatchedAt:        r.dispatchedAt  ?? null,
          processingStartedAt: r.processingStartedAt ?? null,
          completedAt:         r.completedAt   ?? null,
          retryCount:          r.retryCount,
          nextRetryAt:         r.nextRetryAt   ?? null,
          lastError:           r.lastError     ?? null,
          createdAt:           r.createdAt,
          updatedAt:           r.updatedAt,
        })),
        skipDuplicates: true,  // Tekrar çalışmada çift kayıt önleme
      });

      // 4. Hot tablodan sil
      await tx.eventOutbox.deleteMany({ where: { id: { in: ids } } });

      this.logger.log(`[Archive] EventOutbox: ${rows.length} satır arşivlendi`);
      return rows.length;
    });
  }

  // ── EventDelivery arşivleme ──────────────────────────────────────────────────

  private async archiveDeliveries(cutoff: Date): Promise<number> {
    return this.prisma.$transaction(async (tx) => {
      // 1. ID'leri kilitle
      const locked = await tx.$queryRaw<{ id: string }[]>`
        SELECT id FROM "event_delivery"
        WHERE  status     IN (${DELIVERY_TERMINAL_STATUSES[0]}, ${DELIVERY_TERMINAL_STATUSES[1]})
        AND    "updatedAt" <= ${cutoff}
        ORDER  BY "updatedAt"
        LIMIT  ${BATCH_SIZE}
        FOR UPDATE SKIP LOCKED
      `;

      if (locked.length === 0) return 0;

      const ids = locked.map((r) => r.id);

      // 2. Tam satırları yükle
      const rows = await tx.eventDelivery.findMany({ where: { id: { in: ids } } });

      // 3. Archive tablosuna ekle
      await tx.eventDeliveryArchive.createMany({
        data: rows.map((r) => ({
          id:                r.id,
          tenantId:          r.tenantId,
          eventId:           r.eventId,
          channel:           r.channel,
          recipient:         r.recipient,
          templateKey:       r.templateKey,
          templateVersion:   r.templateVersion,
          locale:            r.locale,
          provider:          r.provider         ?? null,
          providerMessageId: r.providerMessageId ?? null,
          status:            r.status,
          idempotencyKey:    r.idempotencyKey,
          payload:           r.payload as object,
          costEstimateMinor: r.costEstimateMinor ?? null,
          actualCostMinor:   r.actualCostMinor   ?? null,
          attempts:          r.attempts,
          lastAttemptAt:     r.lastAttemptAt     ?? null,
          nextAttemptAt:     r.nextAttemptAt     ?? null,
          lastErrorCode:     r.lastErrorCode     ?? null,
          lastErrorMessage:  r.lastErrorMessage  ?? null,
          sentAt:            r.sentAt            ?? null,
          deliveredAt:       r.deliveredAt       ?? null,
          createdAt:         r.createdAt,
          updatedAt:         r.updatedAt,
        })),
        skipDuplicates: true,
      });

      // 4. Hot tablodan sil
      await tx.eventDelivery.deleteMany({ where: { id: { in: ids } } });

      this.logger.log(`[Archive] EventDelivery: ${rows.length} satır arşivlendi`);
      return rows.length;
    });
  }

  /**
   * Manuel / test amaçlı çalıştırma (cron'u beklemeden).
   * WorkerModule dışından da çağrılabilir.
   */
  async runNow(): Promise<{ outbox: number; delivery: number }> {
    const cutoff = new Date(Date.now() - RETENTION_DAYS * 24 * 60 * 60 * 1000);
    const [outbox, delivery] = await Promise.all([
      this.archiveOutbox(cutoff),
      this.archiveDeliveries(cutoff),
    ]);
    return { outbox, delivery };
  }
}
