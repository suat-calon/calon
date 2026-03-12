/**
 * DELIVERY REPOSITORY
 * ──────────────────────────────────────────────────────────────────────────────
 * event_deliveries tablosu üzerinde CRUD + state transition metodları.
 *
 * İdempotency (Delivery Katmanı):
 *   UNIQUE(tenantId, idempotencyKey) → aynı event+kanal+alıcı kombinasyonu
 *   ikinci kez delivery oluşturulamaz.
 *   Key format: "{eventName}:{eventId}:{channel}:{recipient}:v{version}"
 * ──────────────────────────────────────────────────────────────────────────────
 */

import { Injectable, Logger } from '@nestjs/common';
import { Prisma, NotificationChannel, DeliveryStatus } from '@prisma/client';
import { PrismaService } from '../../common/prisma.service';

export interface CreateDeliveryInput {
  tenantId:          string;
  eventId:           string;
  channel:           NotificationChannel;
  recipient:         string;
  templateKey:       string;
  templateVersion:   number;
  locale:            string;
  idempotencyKey:    string;
  payload:           Record<string, unknown>;
  costEstimateMinor?: number;
}

/**
 * claimForProcessing() dönüş tipi.
 * SQL UPDATE ... RETURNING ile dönen, zaten PROCESSING'e geçirilmiş delivery satırı.
 * attempts: SQL tarafından artırılmış güncel değer.
 */
export interface ClaimedDelivery {
  id:                string;
  tenantId:          string;
  eventId:           string;
  channel:           string;
  recipient:         string;
  payload:           unknown;
  idempotencyKey:    string;
  costEstimateMinor: number | null;
  /** Atomik UPDATE sonrası artırılmış güncel deneme sayısı. */
  attempts:          number;
}

@Injectable()
export class DeliveryRepository {
  private readonly logger = new Logger(DeliveryRepository.name);

  constructor(private readonly prisma: PrismaService) {}

  /**
   * Delivery record oluştur.
   * Caller'ın transaction'ı içinde çalışır.
   * P2002 → duplicate delivery → caller idempotent olarak yutabilir.
   */
  async createInTx(
    input: CreateDeliveryInput,
    tx:    Prisma.TransactionClient,
  ) {
    return tx.eventDelivery.create({
      data: {
        tenantId:          input.tenantId,
        eventId:           input.eventId,
        channel:           input.channel,
        recipient:         input.recipient,
        templateKey:       input.templateKey,
        templateVersion:   input.templateVersion,
        locale:            input.locale,
        idempotencyKey:    input.idempotencyKey,
        payload:           input.payload as Prisma.InputJsonValue,
        costEstimateMinor: input.costEstimateMinor,
        status:            'PENDING',
      },
    });
  }

  /**
   * Idempotent delivery oluştur.
   * P2002 (UNIQUE constraint) → null döner; caller sessizce geçebilir.
   * @@unique([eventId, channel]) veya @@unique([tenantId, idempotencyKey])
   * kısıtlarından herhangi biri tetiklenirse aynı davranış.
   */
  async createIdempotentInTx(
    input: CreateDeliveryInput,
    tx:    Prisma.TransactionClient,
  ): Promise<{ id: string } | null> {
    try {
      return await this.createInTx(input, tx);
    } catch (err: unknown) {
      const code = (err as { code?: string }).code;
      if (code === 'P2002') {
        this.logger.debug(
          `[DeliveryRepository] Duplicate delivery atlandı: ` +
          `eventId=${input.eventId} channel=${input.channel}`,
        );
        return null;
      }
      throw err;
    }
  }

  /**
   * Atomik delivery claim — race condition'a karşı tek savunma noktası.
   *
   * Tek bir SQL UPDATE ile:
   *   - WHERE status IN ('PENDING', 'FAILED') → PROCESSING'e geçiş izni
   *   - attempts = attempts + 1                → sayaç artışı
   *   - RETURNING *                            → güncel satır
   *
   * RETURNING boşsa başka bir worker zaten bu delivery'yi claim etmiştir.
   * Bu durumda null döner; çağıran KESINLIKLE provider.send() çağırmamalıdır.
   *
   * Geçerli geçişler: PENDING → PROCESSING | FAILED → PROCESSING
   * Geçersiz (null döner): PROCESSING, SENT, DELIVERED, CANCELLED, PERMANENT_FAILURE
   */
  async claimForProcessing(deliveryId: string): Promise<ClaimedDelivery | null> {
    const rows = await this.prisma.$queryRaw<ClaimedDelivery[]>`
      UPDATE event_deliveries
      SET
        status          = 'PROCESSING',
        "lastAttemptAt" = NOW(),
        attempts        = attempts + 1,
        "updatedAt"     = NOW()
      WHERE id     = ${deliveryId}
        AND status IN ('PENDING', 'FAILED')
      RETURNING
        id,
        "tenantId",
        "eventId",
        channel,
        recipient,
        payload,
        "idempotencyKey",
        "costEstimateMinor",
        attempts
    `;

    if (rows.length === 0) {
      this.logger.debug(
        `[DeliveryRepository] Claim başarısız (başka worker veya terminal durum): ` +
        `deliveryId=${deliveryId}`,
      );
      return null;
    }

    return rows[0] ?? null;
  }

  /** Delivery'yi ID ile yükle */
  async findById(deliveryId: string) {
    return this.prisma.eventDelivery.findUnique({
      where: { id: deliveryId },
    });
  }

  /** Event'e ait tüm delivery'leri yükle */
  async findByEventId(eventId: string) {
    return this.prisma.eventDelivery.findMany({
      where: { eventId },
    });
  }

  /** Worker: QUEUED → PROCESSING */
  async markProcessing(deliveryId: string) {
    return this.prisma.eventDelivery.update({
      where: { id: deliveryId },
      data: {
        status:       'PROCESSING',
        lastAttemptAt: new Date(),
        attempts:     { increment: 1 },
      },
    });
  }

  /** Provider'a gönderildi → SENT */
  async markSent(
    deliveryId:        string,
    providerMessageId: string,
    provider:          string,
    actualCostMinor?:  number,
  ) {
    return this.prisma.eventDelivery.update({
      where: { id: deliveryId },
      data: {
        status:            'SENT',
        providerMessageId,
        provider,
        sentAt:            new Date(),
        ...(actualCostMinor !== undefined && { actualCostMinor }),
      },
    });
  }

  /** Provider delivery confirmation aldı → DELIVERED */
  async markDelivered(deliveryId: string) {
    return this.prisma.eventDelivery.update({
      where: { id: deliveryId },
      data: {
        status:      'DELIVERED',
        deliveredAt: new Date(),
      },
    });
  }

  /** Geçici hata → FAILED + retry zamanla */
  async markFailedWithRetry(
    deliveryId:       string,
    errorCode:        string,
    errorMessage:     string,
    nextAttemptAt:    Date,
  ) {
    return this.prisma.eventDelivery.update({
      where: { id: deliveryId },
      data: {
        status:           'FAILED',
        lastErrorCode:    errorCode,
        lastErrorMessage: errorMessage,
        nextAttemptAt,
      },
    });
  }

  /** Kalıcı hata → PERMANENT_FAILURE (retry yok) */
  async markPermanentFailure(
    deliveryId:   string,
    errorCode:    string,
    errorMessage: string,
  ) {
    return this.prisma.eventDelivery.update({
      where: { id: deliveryId },
      data: {
        status:           'PERMANENT_FAILURE',
        lastErrorCode:    errorCode,
        lastErrorMessage: errorMessage,
      },
    });
  }

  /** İptal → CANCELLED */
  async markCancelled(deliveryId: string) {
    return this.prisma.eventDelivery.update({
      where: { id: deliveryId },
      data: { status: 'CANCELLED' },
    });
  }

  /** Tüm delivery'leri iptal et (örn. booking.cancelled sonrası) */
  async cancelAllByEventId(eventId: string) {
    return this.prisma.eventDelivery.updateMany({
      where: {
        eventId,
        status: { in: ['PENDING', 'QUEUED'] },
      },
      data: { status: 'CANCELLED' },
    });
  }

  /** Recovery: stuck PROCESSING delivery'leri bul */
  async findStuckProcessing(thresholdMinutes = 5) {
    const cutoff = new Date(Date.now() - thresholdMinutes * 60 * 1000);
    return this.prisma.eventDelivery.findMany({
      where: {
        status:        'PROCESSING',
        lastAttemptAt: { lte: cutoff },
      },
    });
  }

  /** Event'in tüm delivery'leri tamamlandı mı? */
  async areAllDelivered(eventId: string): Promise<boolean> {
    return (await this.countActiveDeliveries(eventId)) === 0;
  }

  /** Event'in herhangi bir delivery'si terminal değil mi? */
  async hasActiveDeliveries(eventId: string): Promise<boolean> {
    return (await this.countActiveDeliveries(eventId)) > 0;
  }

  /** Aktif (non-terminal) delivery sayısı — tek ortak sorgu. */
  private async countActiveDeliveries(eventId: string): Promise<number> {
    return this.prisma.eventDelivery.count({
      where: {
        eventId,
        status: { in: ['PENDING', 'QUEUED', 'PROCESSING', 'FAILED'] },
      },
    });
  }

  /**
   * Usage ledger güncelle — UPSERT (period bazlı)
   */
  async incrementUsage(
    tenantId:            string,
    channel:             NotificationChannel,
    periodStart:         Date,
    periodEnd:           Date,
    sentDelta:           number,
    failedDelta:         number,
    estimatedCostDelta:  number,
    actualCostDelta:     number,
  ) {
    const key = {
      tenantId_channel_periodStart_periodEnd: {
        tenantId,
        channel,
        periodStart,
        periodEnd,
      },
    };

    await this.prisma.notificationUsage.upsert({
      where:  key,
      create: {
        tenantId,
        channel,
        periodStart,
        periodEnd,
        sentCount:          sentDelta,
        failedCount:        failedDelta,
        estimatedCostMinor: estimatedCostDelta,
        actualCostMinor:    actualCostDelta,
      },
      update: {
        sentCount:          { increment: sentDelta },
        failedCount:        { increment: failedDelta },
        estimatedCostMinor: { increment: estimatedCostDelta },
        actualCostMinor:    { increment: actualCostDelta },
      },
    });
  }
}
