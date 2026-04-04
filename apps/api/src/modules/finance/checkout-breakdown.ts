/**
 * CHECKOUT BREAKDOWN — Typed Contract + Semantic Validation
 * ─────────────────────────────────────────────────────────────────────────────
 * TransactionLedger.details JSONB alanının typed contract'ı.
 *
 * Authoritative truth: ledger.amount (flat tahsilat tutarı).
 * details = structured explanation — amount ile çelişemez.
 *
 * Semantic invariant:
 *   sum(items.amount) === grossTotal
 *   grossTotal - depositPaid === collectedNow
 *   collectedNow === dto.amount (ledger.amount)
 * ─────────────────────────────────────────────────────────────────────────────
 */

import { BadRequestException } from '@nestjs/common';
import { CheckoutLineItemDto } from './dto/checkout.dto';

// ── Typed contract for ledger.details ────────────────────────────────────────

export type CheckoutLineItemType = 'service' | 'extra';

export interface CheckoutBreakdownItem {
  type:   CheckoutLineItemType;
  label:  string;
  amount: number;
}

export interface CheckoutBreakdownDetails {
  items:         CheckoutBreakdownItem[];
  grossTotal:    number;
  depositPaid:   number;
  collectedNow:  number;
}

// ── Tolerance for floating point / decimal rounding ──────────────────────────

const AMOUNT_TOLERANCE = 0.02; // 2 kuruş tolerans (Decimal/float farkı için)

function amountsMatch(a: number, b: number): boolean {
  return Math.abs(a - b) <= AMOUNT_TOLERANCE;
}

// ── Build + Validate ─────────────────────────────────────────────────────────

/**
 * Checkout line item'larından structured details oluşturur ve semantic doğrulama yapar.
 *
 * @param lineItems   DTO'dan gelen checkout kalemleri
 * @param dtoAmount   DTO'dan gelen flat tahsilat tutarı (authoritative)
 * @param depositPaid Appointment'tan okunan mevcut depozito tutarı
 * @returns           Typed breakdown details (ledger.details'e yazılacak)
 * @throws            BadRequestException — semantic mismatch varsa
 */
export function buildAndValidateBreakdown(
  lineItems:   CheckoutLineItemDto[],
  dtoAmount:   number,
  depositPaid: number,
): CheckoutBreakdownDetails {
  // ── 1. Items sum = grossTotal ──────────────────────────────────────────
  const grossTotal = lineItems.reduce((sum, li) => sum + li.amount, 0);

  // ── 2. collectedNow = grossTotal - depositPaid ─────────────────────────
  const collectedNow = Math.max(grossTotal - depositPaid, 0);

  // ── 3. Semantic validation: collectedNow ≈ dto.amount ─────────────────
  if (!amountsMatch(collectedNow, dtoAmount)) {
    throw new BadRequestException(
      `Breakdown tutarsızlığı: kalemler toplamı (${grossTotal}) − depozito (${depositPaid}) = ${collectedNow}, ` +
      `ama tahsil edilen tutar ${dtoAmount}. Fark ${Math.abs(collectedNow - dtoAmount).toFixed(2)}₺ toleransı aşıyor.`,
    );
  }

  // ── 4. Negatif kontrol ─────────────────────────────────────────────────
  if (grossTotal < 0) {
    throw new BadRequestException('Kalemler toplamı negatif olamaz.');
  }
  if (depositPaid < 0) {
    throw new BadRequestException('Depozito tutarı negatif olamaz.');
  }

  // ── 5. Build typed details ─────────────────────────────────────────────
  return {
    items: lineItems.map((li) => ({
      type:   li.type as CheckoutLineItemType,
      label:  li.label,
      amount: li.amount,
    })),
    grossTotal,
    depositPaid,
    collectedNow,
  };
}
