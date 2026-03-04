/**
 * QUEUE_NAMES — Merkezi kuyruk adları sabiti
 * ──────────────────────────────────────────────────────────────────────────────
 * Bu dosya bağımsızdır: redis.module ← backpressure.service döngüsünü kırar.
 * Her iki modül de buradan import eder.
 * ──────────────────────────────────────────────────────────────────────────────
 */

export const QUEUE_NAMES = {
  NOTIFICATIONS:    'notifications',
  STOCK_DEDUCT:     'stock-deduct',
  LOYALTY_EARN:     'loyalty-earn',     // Faz 11: Asenkron puan kazanımı
  HUMAN_HANDOFF:    'human-handoff',    // v2 AI devir
  CAMPAIGN:         'campaign',         // v2 Kampanya
  REFERRAL_PROCESS: 'referral-process', // Faz 18: Viral Growth referral işleme
} as const;
