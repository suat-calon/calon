/**
 * BILLING UTILS — Abonelik dönem hesaplama yardımcıları
 * ──────────────────────────────────────────────────────────────────────────────
 * addCycle: BillingPeriod.periodEnd ve renewal tarihlerini hesaplar.
 * Calendar-aware: MONTHLY = aynı gün bir sonraki ay (ayın son günü korunur).
 *                 YEARLY  = tam bir yıl sonra.
 * ──────────────────────────────────────────────────────────────────────────────
 */

import { BillingCycle } from '@prisma/client';

/**
 * Verilen tarihe bir abonelik dönemini ekler.
 *   MONTHLY → bir sonraki takvim ayı (Date.setMonth kullanır — ay sonu güvenlidir)
 *   YEARLY  → bir sonraki yıl (Date.setFullYear)
 *
 * @example
 *   addCycle(new Date('2026-01-31'), 'MONTHLY') → 2026-02-28 (şubat son günü)
 *   addCycle(new Date('2026-01-15'), 'YEARLY')  → 2027-01-15
 */
export function addCycle(date: Date, cycle: BillingCycle): Date {
  const d = new Date(date);
  if (cycle === 'YEARLY') {
    d.setFullYear(d.getFullYear() + 1);
  } else {
    d.setMonth(d.getMonth() + 1);
  }
  return d;
}
