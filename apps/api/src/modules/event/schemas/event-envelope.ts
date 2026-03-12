/**
 * EVENT ENVELOPE — Canonical event contract
 * ──────────────────────────────────────────────────────────────────────────────
 * Tüm domain event'leri bu standart zarfa uyacaktır.
 * Zorunlu üst alanlar eksiksiz olacak; payload event tipine göre typed.
 *
 * KURAL:
 *   - Worker'lar render için tekrar DB join yapmayacak → payload snapshot taşır
 *   - payload gereksiz veri taşımayacak → minimal snapshot prensibi
 * ──────────────────────────────────────────────────────────────────────────────
 */

export interface EventAggregate {
  type: string; // "booking" | "payment" | "subscription"
  id:   string; // aggregateId (UUID)
}

export interface EventEnvelope<TPayload = Record<string, unknown>> {
  eventId:        string;           // UUID — event outbox primary key
  eventName:      string;           // "booking.created" | "payment.succeeded" | ...
  eventVersion:   number;           // Şema versiyonu — default 1
  occurredAt:     string;           // ISO UTC string
  scheduledFor:   string;           // ISO UTC string — dispatcher işleme zamanı
  tenantId:       string;           // Tenant UUID
  aggregate:      EventAggregate;
  partitionKey:   string;           // "booking:{id}" — partition-level ordering için
  correlationId?: string;           // Bağlantılı event zinciri
  causationId?:   string;           // Bu event'i tetikleyen event ID
  payload:        TPayload;
  metadata:       Record<string, unknown>;
}

// ── Booking Payloads ──────────────────────────────────────────────────────────

/** booking.created ve booking.reminder.due için minimum snapshot */
export interface BookingEventPayload {
  bookingId:       string;
  customerId:      string;
  customerName:    string;
  customerPhone?:  string;
  customerEmail?:  string;
  staffId:         string;
  staffName:       string;
  serviceId:       string;
  serviceName:     string;
  startAtUtc:      string; // ISO UTC
  endAtUtc:        string; // ISO UTC
  tenantTimezone:  string; // "Europe/Istanbul"
  locationName:    string;
  bookingCode?:    string;
  cancelUrl?:      string;
  status?:         string; // Snapshot — booking durumu
}

/** booking.cancelled için ek alanlar */
export interface BookingCancelledPayload extends BookingEventPayload {
  cancellationReason?: string;
  cancelledAt:         string; // ISO UTC
}

// ── Payment Payloads ──────────────────────────────────────────────────────────

export interface PaymentEventPayload {
  paymentId:     string;
  bookingId:     string;
  customerId:    string;
  customerName:  string;
  customerPhone?: string;
  customerEmail?: string;
  amountCents:   number;
  currency:      string;
  provider:      string;
  serviceName:   string;
  startAtUtc:    string;
  tenantTimezone: string;
}

/** booking.rescheduled için ek alanlar */
export interface BookingRescheduledPayload extends BookingEventPayload {
  oldStartAtUtc: string; // ISO UTC — rankevu önceki başlangıç zamanı
  oldEndAtUtc:   string; // ISO UTC — randevu önceki bitiş zamanı
}

// ── Subscription Payloads ─────────────────────────────────────────────────────

export interface SubscriptionRenewalPayload {
  attemptId:       string;
  tenantId:        string;
  plan:            string;
  cycle:           string;
  amountCents:     number;
  currency:        string;
  ownerEmail?:     string;
  ownerPhone?:     string;
  ownerName?:      string;
  nextPeriodStart?: string;
  nextPeriodEnd?:   string;
  renewalUrl?:     string;
  failReason?:     string;
}

/** subscription.past_due ve subscription.suspended için durum geçiş event'leri */
export interface SubscriptionStatusPayload {
  tenantId:    string;
  plan:        string;
  cycle:       string;
  ownerEmail?: string;
  ownerName?:  string;
}

// ── Typed envelope aliases ────────────────────────────────────────────────────

export type BookingCreatedEvent      = EventEnvelope<BookingEventPayload>;
export type BookingCancelledEvent    = EventEnvelope<BookingCancelledPayload>;
export type BookingRescheduledEvent  = EventEnvelope<BookingRescheduledPayload>;
export type BookingReminderEvent     = EventEnvelope<BookingEventPayload>;
export type BookingCompletedEvent    = EventEnvelope<BookingEventPayload>;
export type BookingNoShowEvent       = EventEnvelope<BookingEventPayload>;
export type PaymentSucceededEvent    = EventEnvelope<PaymentEventPayload>;
export type PaymentFailedEvent       = EventEnvelope<PaymentEventPayload>;
export type SubscriptionRenewalSucceededEvent = EventEnvelope<SubscriptionRenewalPayload>;
export type SubscriptionRenewalFailedEvent    = EventEnvelope<SubscriptionRenewalPayload>;
export type SubscriptionPastDueEvent          = EventEnvelope<SubscriptionStatusPayload>;
export type SubscriptionSuspendedEvent        = EventEnvelope<SubscriptionStatusPayload>;

// ── Dispatcher job payload (sadece ID'ler) ────────────────────────────────────

/** Queue job payload — KURAL: full message body taşınmaz, sadece ID */
export interface DispatcherJobPayload {
  eventId:  string;
  tenantId: string;
}

/** Delivery worker job payload */
export interface DeliveryJobPayload {
  deliveryId: string;
  tenantId:   string;
}
