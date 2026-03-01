/**
 * APPOINTMENT STATE MACHINE — XState v5 Resmi Belirtim
 * ─────────────────────────────────────────────────────────────────────────────
 * Randevu durumu geçişlerinin tek gerçek kaynağı (single source of truth).
 * isValidTransition() fonksiyonu bu makineden türetilmiş VALID_NEXT haritasını
 * kullanarak O(1) arama yapar.
 *
 * Durum akışı:
 *   PENDING    → CONFIRMED | CANCELLED
 *   CONFIRMED  → CHECKED_IN | CANCELLED | NO_SHOW
 *   CHECKED_IN → IN_SERVICE
 *   IN_SERVICE → COMPLETED
 *   Terminal   : COMPLETED · CANCELLED · NO_SHOW
 * ─────────────────────────────────────────────────────────────────────────────
 */

import { createMachine } from 'xstate';
import { AppointmentStatus } from '@prisma/client';

// ── XState formal spec ─────────────────────────────────────────────────────
// Makine belgesel amaçlıdır; VALID_NEXT ile senkron tutulmalıdır.
export const appointmentMachine = createMachine({
  id:      'appointment',
  initial: AppointmentStatus.PENDING,
  states: {
    [AppointmentStatus.PENDING]: {
      on: {
        CONFIRM: AppointmentStatus.CONFIRMED,
        CANCEL:  AppointmentStatus.CANCELLED,
      },
    },
    [AppointmentStatus.CONFIRMED]: {
      on: {
        CHECK_IN: AppointmentStatus.CHECKED_IN,
        CANCEL:   AppointmentStatus.CANCELLED,
        NO_SHOW:  AppointmentStatus.NO_SHOW,
      },
    },
    [AppointmentStatus.CHECKED_IN]: {
      on: {
        START: AppointmentStatus.IN_SERVICE,
      },
    },
    [AppointmentStatus.IN_SERVICE]: {
      on: {
        COMPLETE: AppointmentStatus.COMPLETED,
      },
    },
    [AppointmentStatus.COMPLETED]: { type: 'final' },
    [AppointmentStatus.CANCELLED]: { type: 'final' },
    [AppointmentStatus.NO_SHOW]:   { type: 'final' },
  },
});

// ── O(1) geçiş arama haritası ─────────────────────────────────────────────
// VALID_NEXT ↔ yukarıdaki makine ile her zaman senkron olmalıdır.
const VALID_NEXT = new Map<AppointmentStatus, ReadonlySet<AppointmentStatus>>([
  [
    AppointmentStatus.PENDING,
    new Set([AppointmentStatus.CONFIRMED, AppointmentStatus.CANCELLED]),
  ],
  [
    AppointmentStatus.CONFIRMED,
    new Set([
      AppointmentStatus.CHECKED_IN,
      AppointmentStatus.CANCELLED,
      AppointmentStatus.NO_SHOW,
    ]),
  ],
  [
    AppointmentStatus.CHECKED_IN,
    new Set([AppointmentStatus.IN_SERVICE]),
  ],
  [
    AppointmentStatus.IN_SERVICE,
    new Set([AppointmentStatus.COMPLETED]),
  ],
  [AppointmentStatus.COMPLETED, new Set()],
  [AppointmentStatus.CANCELLED, new Set()],
  [AppointmentStatus.NO_SHOW,   new Set()],
]);

/**
 * İzin verilen durum geçişini doğrular.
 *
 * @param from  Mevcut randevu durumu
 * @param to    İstenen yeni durum
 * @returns     true → geçiş geçerli | false → geçersiz / yasak
 */
export function isValidTransition(
  from: AppointmentStatus,
  to:   AppointmentStatus,
): boolean {
  return VALID_NEXT.get(from)?.has(to) ?? false;
}
