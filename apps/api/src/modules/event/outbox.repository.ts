/**
 * OUTBOX REPOSITORY
 * ──────────────────────────────────────────────────────────────────────────────
 * event_outbox tablosu üzerinde CRUD + state transition metodları.
 *
 * KURAL: Bu repository sadece event_outbox tablosuna dokunur.
 * Domain write'tan KOPUK event üretimi YASAK — caller aynı tx'e insert eder.
 * ──────────────────────────────────────────────────────────────────────────────
 */

import { Injectable, Logger } from '@nestjs/common';
import { Prisma, OutboxEventStatus } from '@prisma/client';
import { PrismaService } from '../../common/prisma.service';
import { EventEnvelope } from './schemas/event-envelope';

export interface CreateOutboxEventInput {
  tenantId:       string;
  aggregateType:  string;
  aggregateId:    string;
  eventName:      string;
  eventVersion?:  number;
  occurredAt:     Date;
  scheduledFor?:  Date; // default = now() — reminder için future date
  partitionKey:   string;
  correlationId?: string;
  causationId?:   string;
  idempotencyKey: string;
  payload:        Record<string, unknown>;
  metadata?:      Record<string, unknown>;
}

@Injectable()
export class OutboxRepository {
  private readonly logger = new Logger(OutboxRepository.name);

  constructor(private readonly prisma: PrismaService) {}

  /**
   * Yeni outbox event oluştur.
   *
   * KURAL: Caller'ın DB transaction'ı içinde çalışmalıdır.
   * Aynı (tenantId, idempotencyKey) ikinci kez gelirse P2002 fırlar
   * → caller sessizce yutabilir (idempotent producer semantiği).
   *
   * @param input  Event parametreleri
   * @param tx     Caller'ın Prisma transaction client'ı (zorunlu)
   */
  async createInTx(
    input: CreateOutboxEventInput,
    tx:    Prisma.TransactionClient,
  ) {
    const now = new Date();
    return tx.eventOutbox.create({
      data: {
        tenantId:      input.tenantId,
        aggregateType: input.aggregateType,
        aggregateId:   input.aggregateId,
        eventName:     input.eventName,
        eventVersion:  input.eventVersion ?? 1,
        occurredAt:    input.occurredAt,
        scheduledFor:  input.scheduledFor ?? now,
        partitionKey:  input.partitionKey,
        correlationId: input.correlationId,
        causationId:   input.causationId,
        idempotencyKey: input.idempotencyKey,
        payload:       input.payload as Prisma.InputJsonValue,
        metadata:      (input.metadata ?? {}) as Prisma.InputJsonValue,
        status:        'PENDING',
      },
    });
  }

  /**
   * Dispatcher polling: işlenmeye hazır event'leri çek.
   * PENDING veya retry zamanı gelmiş event'ler.
   * partition_key bazlı lock için caller SELECT FOR UPDATE kullanacak.
   */
  async findEligibleEvents(limit = 50) {
    const now = new Date();
    return this.prisma.eventOutbox.findMany({
      where: {
        status: 'PENDING',
        scheduledFor: { lte: now },
        OR: [
          { nextRetryAt: null },
          { nextRetryAt: { lte: now } },
        ],
      },
      orderBy: [
        { scheduledFor: 'asc' },
        { createdAt:    'asc' },
      ],
      take: limit,
    });
  }

  /**
   * Status transition: PENDING → PROCESSING
   * Row'u "kilitler" — aynı event iki dispatcher tarafından işlenemez.
   */
  async markProcessing(eventId: string, tx: Prisma.TransactionClient) {
    return tx.eventOutbox.update({
      where: { id: eventId },
      data: {
        status:               'PROCESSING',
        processingStartedAt:  new Date(),
      },
    });
  }

  /**
   * Dispatcher delivery record'ları oluşturduktan sonra DISPATCHED durumuna geç.
   */
  async markDispatched(eventId: string, tx: Prisma.TransactionClient) {
    return tx.eventOutbox.update({
      where: { id: eventId },
      data: {
        status:       'DISPATCHED',
        dispatchedAt: new Date(),
      },
    });
  }

  /** Delivery tamamlandı → DELIVERED */
  async markDelivered(eventId: string) {
    return this.prisma.eventOutbox.update({
      where: { id: eventId },
      data: {
        status:      'DELIVERED',
        completedAt: new Date(),
      },
    });
  }

  /** Kısmi başarı — bazı delivery'ler hâlâ devam ediyor */
  async markPartiallyDelivered(eventId: string) {
    return this.prisma.eventOutbox.update({
      where: { id: eventId },
      data:  { status: 'PARTIALLY_DELIVERED' },
    });
  }

  /** Geçici hata — retry planla */
  async markForRetry(eventId: string, retryAt: Date, error: string) {
    return this.prisma.eventOutbox.update({
      where: { id: eventId },
      data: {
        status:      'PENDING',
        nextRetryAt: retryAt,
        lastError:   error,
        retryCount:  { increment: 1 },
      },
    });
  }

  /** Max retry aşıldı → DEAD_LETTERED */
  async markDeadLettered(eventId: string, error: string) {
    return this.prisma.eventOutbox.update({
      where: { id: eventId },
      data: {
        status:    'DEAD_LETTERED',
        lastError: error,
      },
    });
  }

  /** İptal — örn. booking.cancelled sonrası o bookinge ait reminder.
   *  tx sağlanırsa aynı transaction içinde çalışır (booking cancel atomicity). */
  async cancelByAggregateId(
    tenantId:    string,
    aggregateId: string,
    eventName:   string,
    tx?:         Prisma.TransactionClient,
  ) {
    const client = tx ?? this.prisma;
    return client.eventOutbox.updateMany({
      where: {
        tenantId,
        aggregateId,
        eventName,
        status: 'PENDING',
      },
      data: { status: 'CANCELLED' },
    });
  }

  /** Recovery: stuck PROCESSING event'leri bul (staleness threshold) */
  async findStuckProcessing(thresholdMinutes = 10) {
    const cutoff = new Date(Date.now() - thresholdMinutes * 60 * 1000);
    return this.prisma.eventOutbox.findMany({
      where: {
        status:               'PROCESSING',
        processingStartedAt:  { lte: cutoff },
      },
    });
  }

  /** Recovery: scheduled_for geçmiş ama hâlâ PENDING */
  async findOverduePending() {
    return this.prisma.eventOutbox.findMany({
      where: {
        status:      'PENDING',
        scheduledFor: { lte: new Date() },
      },
      take: 100,
    });
  }

  /** Tek event yükle */
  async findById(eventId: string) {
    return this.prisma.eventOutbox.findUnique({
      where: { id: eventId },
    });
  }

  /**
   * Partition lock kontrolü: aynı partitionKey için aktif PROCESSING var mı?
   * Aynı aggregate için race condition önleme.
   */
  async isPartitionLocked(partitionKey: string): Promise<boolean> {
    const count = await this.prisma.eventOutbox.count({
      where: {
        partitionKey,
        status: 'PROCESSING',
      },
    });
    return count > 0;
  }
}
