/**
 * EVENT PRODUCER SERVICE
 * ──────────────────────────────────────────────────────────────────────────────
 * Domain event'leri transactional outbox'a yazan yardımcı servis.
 *
 * KULLANIM KURALI:
 *   Caller'ın Prisma transaction'ı içinde çağrılacaktır.
 *   Outbox'a yazma domain write'tan AYRI bir transaction'da OLAMAZ.
 *
 * İdempotency (Producer Katmanı):
 *   UNIQUE(tenantId, idempotencyKey) → aynı event ikinci kez yazılamaz.
 *   P2002 → sessizce yutulur (idempotent retry güvenli).
 *
 * BOOKING REMINDER KURALLAR:
 *   Booking oluştuğunda preference uygunsa future-scheduled event üretilir.
 *   "Cron tarayıp o anda gönder" yaklaşımı YASAKTIR.
 * ──────────────────────────────────────────────────────────────────────────────
 */

import { Injectable, Logger } from '@nestjs/common';
import { Prisma }              from '@prisma/client';
import { v4 as uuidv4 }        from 'uuid';

import { OutboxRepository }      from './outbox.repository';
import {
  BookingEventPayload,
  BookingCancelledPayload,
  PaymentEventPayload,
  SubscriptionRenewalPayload,
} from './schemas/event-envelope';

/** Mevcut desteklenen event isimleri */
export const EVENT_NAMES = {
  BOOKING_CREATED:               'booking.created',
  BOOKING_CANCELLED:             'booking.cancelled',
  BOOKING_REMINDER_DUE:          'booking.reminder.due',
  PAYMENT_SUCCEEDED:             'payment.succeeded',
  SUBSCRIPTION_RENEWAL_SUCCEEDED: 'subscription.renewal.succeeded',
  SUBSCRIPTION_RENEWAL_FAILED:   'subscription.renewal.failed',
} as const;

export type EventName = (typeof EVENT_NAMES)[keyof typeof EVENT_NAMES];

@Injectable()
export class EventProducerService {
  private readonly logger = new Logger(EventProducerService.name);

  constructor(private readonly outbox: OutboxRepository) {}

  // ── booking.created ─────────────────────────────────────────────────────────

  async bookingCreated(
    payload:  BookingEventPayload,
    tenantId: string,
    tx:       Prisma.TransactionClient,
  ) {
    return this.outbox.createInTx(
      {
        tenantId,
        aggregateType:  'booking',
        aggregateId:    payload.bookingId,
        eventName:      EVENT_NAMES.BOOKING_CREATED,
        occurredAt:     new Date(),
        scheduledFor:   new Date(), // hemen dispatch
        partitionKey:   `booking:${payload.bookingId}`,
        idempotencyKey: `booking.created:${payload.bookingId}`,
        payload:        payload as unknown as Record<string, unknown>,
        metadata:       { tenantTimezone: payload.tenantTimezone },
      },
      tx,
    );
  }

  // ── booking.cancelled ───────────────────────────────────────────────────────

  async bookingCancelled(
    payload:  BookingCancelledPayload,
    tenantId: string,
    tx:       Prisma.TransactionClient,
  ) {
    return this.outbox.createInTx(
      {
        tenantId,
        aggregateType:  'booking',
        aggregateId:    payload.bookingId,
        eventName:      EVENT_NAMES.BOOKING_CANCELLED,
        occurredAt:     new Date(),
        scheduledFor:   new Date(),
        partitionKey:   `booking:${payload.bookingId}`,
        idempotencyKey: `booking.cancelled:${payload.bookingId}`,
        payload:        payload as unknown as Record<string, unknown>,
        metadata:       {},
      },
      tx,
    );
  }

  // ── booking.reminder.due ────────────────────────────────────────────────────

  /**
   * DOĞRU REMINDER MİMARİSİ:
   * Booking oluştuğunda future-scheduled event üretilir.
   * scheduledFor = startAtUtc - reminderOffsetMinutes
   * Dispatcher o zamana gelince işler — "cron tarayıp gönder" YASAK.
   */
  async bookingReminderScheduled(
    payload:               BookingEventPayload,
    tenantId:              string,
    startAtUtc:            Date,
    reminderOffsetMinutes: number,
    tx:                    Prisma.TransactionClient,
  ) {
    const scheduledFor = new Date(
      startAtUtc.getTime() - reminderOffsetMinutes * 60 * 1000,
    );

    // Geçmiş bir zaman için reminder üretme
    if (scheduledFor <= new Date()) {
      this.logger.warn(
        `[EventProducer] Reminder scheduled_for geçmişte, atlanıyor: ` +
        `bookingId=${payload.bookingId} scheduledFor=${scheduledFor.toISOString()}`,
      );
      return null;
    }

    return this.outbox.createInTx(
      {
        tenantId,
        aggregateType:  'booking',
        aggregateId:    payload.bookingId,
        eventName:      EVENT_NAMES.BOOKING_REMINDER_DUE,
        occurredAt:     new Date(),
        scheduledFor,
        partitionKey:   `booking:${payload.bookingId}`,
        idempotencyKey: `booking.reminder.due:${payload.bookingId}:offset${reminderOffsetMinutes}`,
        payload:        payload as unknown as Record<string, unknown>,
        metadata:       { reminderOffsetMinutes },
      },
      tx,
    );
  }

  // ── payment.succeeded ───────────────────────────────────────────────────────

  async paymentSucceeded(
    payload:  PaymentEventPayload,
    tenantId: string,
    tx:       Prisma.TransactionClient,
  ) {
    return this.outbox.createInTx(
      {
        tenantId,
        aggregateType:  'payment',
        aggregateId:    payload.paymentId,
        eventName:      EVENT_NAMES.PAYMENT_SUCCEEDED,
        occurredAt:     new Date(),
        scheduledFor:   new Date(),
        partitionKey:   `payment:${payload.paymentId}`,
        idempotencyKey: `payment.succeeded:${payload.paymentId}`,
        payload:        payload as unknown as Record<string, unknown>,
        metadata:       {},
      },
      tx,
    );
  }

  // ── subscription.renewal.succeeded ─────────────────────────────────────────

  async subscriptionRenewalSucceeded(
    payload:  SubscriptionRenewalPayload,
    tenantId: string,
    tx:       Prisma.TransactionClient,
  ) {
    return this.outbox.createInTx(
      {
        tenantId,
        aggregateType:  'subscription',
        aggregateId:    payload.attemptId,
        eventName:      EVENT_NAMES.SUBSCRIPTION_RENEWAL_SUCCEEDED,
        occurredAt:     new Date(),
        scheduledFor:   new Date(),
        partitionKey:   `subscription:${tenantId}`,
        idempotencyKey: `subscription.renewal.succeeded:${payload.attemptId}`,
        payload:        payload as unknown as Record<string, unknown>,
        metadata:       {},
      },
      tx,
    );
  }

  // ── subscription.renewal.failed ────────────────────────────────────────────

  async subscriptionRenewalFailed(
    payload:  SubscriptionRenewalPayload,
    tenantId: string,
    tx:       Prisma.TransactionClient,
  ) {
    return this.outbox.createInTx(
      {
        tenantId,
        aggregateType:  'subscription',
        aggregateId:    payload.attemptId,
        eventName:      EVENT_NAMES.SUBSCRIPTION_RENEWAL_FAILED,
        occurredAt:     new Date(),
        scheduledFor:   new Date(),
        partitionKey:   `subscription:${tenantId}`,
        idempotencyKey: `subscription.renewal.failed:${payload.attemptId}`,
        payload:        payload as unknown as Record<string, unknown>,
        metadata:       {},
      },
      tx,
    );
  }
}
