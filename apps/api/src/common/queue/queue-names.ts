/**
 * QUEUE_NAMES — Merkezi kuyruk adları sabiti
 * ──────────────────────────────────────────────────────────────────────────────
 * Bu dosya bağımsızdır: redis.module ← backpressure.service döngüsünü kırar.
 * Her iki modül de buradan import eder.
 *
 * Faz 24: Event & Notification Backbone queue'ları eklendi.
 * ──────────────────────────────────────────────────────────────────────────────
 */

export const QUEUE_NAMES = {
  // ── Mevcut queue'lar ────────────────────────────────────────────────────────
  NOTIFICATIONS:    'calon:queue:notifications',
  STOCK_DEDUCT:     'calon:queue:stock-deduct',
  LOYALTY_EARN:     'calon:queue:loyalty-earn',     // Faz 11: Asenkron puan kazanımı
  HUMAN_HANDOFF:    'calon:queue:human-handoff',    // v2 AI devir
  CAMPAIGN:         'calon:queue:campaign',         // v2 Kampanya
  REFERRAL_PROCESS: 'calon:queue:referral-process', // Faz 18: Viral Growth referral işleme

  // ── Faz 24: Event & Notification Backbone ──────────────────────────────────
  // Outbox dispatcher: event_outbox → delivery record oluştur + kanal queue'larına bas
  EVENT_DISPATCH:         'calon:queue:event-dispatch',
  // Kanal-bazlı delivery worker'ları (TEK queue YASAK — izolasyon zorunlu)
  NOTIFICATION_SMS:       'calon:queue:notification-sms',
  NOTIFICATION_EMAIL:     'calon:queue:notification-email',
  NOTIFICATION_PUSH:      'calon:queue:notification-push',
  // Dead Letter Queue — kalıcı hata veya manuel müdahale
  NOTIFICATION_DLQ:       'calon:queue:notification-dlq',
  // Recovery / Reconciler — stuck job + queue/DB drift tespiti
  NOTIFICATION_RECOVERY:  'calon:queue:notification-recovery',
} as const;

export type QueueName = (typeof QUEUE_NAMES)[keyof typeof QUEUE_NAMES];
