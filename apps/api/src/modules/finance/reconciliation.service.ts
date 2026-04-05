/**
 * RECONCILIATION SERVICE — CHECKOUT-LEDGER-03
 * ─────────────────────────────────────────────────────────────────────────────
 * Finance truth read model.
 * Detects mismatches between provider, internal payment, and ledger states.
 *
 * NO auto-repair. Detection + classification + priority only.
 * Strict truth fields vs operational signal clearly separated.
 *
 * Mismatch classes:
 *   HIGH:   PAYMENT_PAID_LEDGER_MISSING, PAYMENT_REFUNDED_LEDGER_MISSING,
 *           BILLING_SUCCEEDED_NO_PERIOD
 *   MEDIUM: STALE_PENDING_PAYMENT, STALE_PENDING_BILLING, LEDGER_SUM_MISMATCH
 *   LOW:    ORPHAN_WEBHOOK
 *
 * Tenant-scoped. No cross-tenant data leakage.
 * ─────────────────────────────────────────────────────────────────────────────
 */

import { Injectable, Logger } from '@nestjs/common';
import { PrismaService }      from '../../common/prisma.service';

// ── Types ───────────────────────────────────────────────────────────────────

type MismatchClass =
  | 'PAYMENT_PAID_LEDGER_MISSING'
  | 'PAYMENT_REFUNDED_LEDGER_MISSING'
  | 'STALE_PENDING_PAYMENT'
  | 'STALE_PENDING_BILLING'
  | 'LEDGER_SUM_MISMATCH'
  | 'ORPHAN_WEBHOOK'
  | 'BILLING_SUCCEEDED_NO_PERIOD';

type Priority = 'HIGH' | 'MEDIUM' | 'LOW';

interface Mismatch {
  class: MismatchClass;
  priority: Priority;
  /** Strict truth field — what the data says */
  evidence: string;
  /** Reference IDs for investigation */
  references: {
    paymentId?: string;
    appointmentId?: string;
    billingAttemptId?: string;
    webhookEventId?: string;
    providerId?: string;
  };
  /** Operational signal, not strict truth */
  suggestedAction: string;
}

export interface ReconciliationSummary {
  totalPayments: number;
  totalLedgerEntries: number;
  totalBillingAttempts: number;
  mismatches: Mismatch[];
  mismatchCountByClass: Record<string, number>;
  mismatchCountByPriority: Record<Priority, number>;
}

// ── Constants ──────────────────────────────────────────────────────────────

const STALE_PAYMENT_MINUTES = 30;
const LEDGER_SUM_TOLERANCE = 0.02; // 2 kuruş

// ── Service ─────────────────────────────────────────────────────────────────

@Injectable()
export class ReconciliationService {
  private readonly logger = new Logger(ReconciliationService.name);

  constructor(private readonly prisma: PrismaService) {}

  /**
   * Runs full reconciliation check for a tenant.
   * Read-only — no mutations.
   */
  async reconcile(tenantId: string): Promise<ReconciliationSummary> {
    const mismatches: Mismatch[] = [];

    // Fetch all data in parallel
    const [payments, ledgerEntries, billingAttempts, billingPeriods, webhookEvents] =
      await Promise.all([
        this.prisma.payment.findMany({
          where: { tenantId },
          select: {
            id: true,
            appointmentId: true,
            providerId: true,
            status: true,
            amount: true,
            createdAt: true,
          },
        }),
        this.prisma.transactionLedger.findMany({
          where: { tenantId, isDeleted: false },
          select: {
            id: true,
            appointmentId: true,
            type: true,
            amount: true,
          },
        }),
        this.prisma.billingAttempt.findMany({
          where: { tenantId },
          select: {
            id: true,
            status: true,
            providerPaymentId: true,
            expiresAt: true,
          },
        }),
        this.prisma.billingPeriod.findMany({
          where: { tenantId },
          select: { id: true, attemptId: true, status: true },
        }),
        this.prisma.webhookEvent.findMany({
          where: { tenantId },
          select: {
            id: true,
            providerEventId: true,
            source: true,
            eventType: true,
          },
        }),
      ]);

    // Index ledger by appointmentId for fast lookup
    const ledgerByAppointment = new Map<string, typeof ledgerEntries>();
    for (const entry of ledgerEntries) {
      if (!entry.appointmentId) continue;
      if (!ledgerByAppointment.has(entry.appointmentId)) {
        ledgerByAppointment.set(entry.appointmentId, []);
      }
      ledgerByAppointment.get(entry.appointmentId)!.push(entry);
    }

    // Index billing periods by attemptId
    const periodsByAttempt = new Map<string, (typeof billingPeriods)[0]>();
    for (const period of billingPeriods) {
      if (period.attemptId) periodsByAttempt.set(period.attemptId, period);
    }

    // Index payments by providerId for orphan webhook check
    const paymentsByProviderId = new Map<string, (typeof payments)[0]>();
    for (const p of payments) {
      if (p.providerId) paymentsByProviderId.set(p.providerId, p);
    }

    const now = Date.now();

    // ── CHECK 1: Payment PAID but ledger missing ────────────────────────
    for (const payment of payments) {
      if (String(payment.status) === 'PAID') {
        const entries = ledgerByAppointment.get(payment.appointmentId) ?? [];
        const hasPaymentEntry = entries.some((e) =>
          ['PAYMENT_CASH', 'PAYMENT_CARD', 'PAYMENT_ONLINE'].includes(String(e.type)),
        );
        if (!hasPaymentEntry) {
          mismatches.push({
            class: 'PAYMENT_PAID_LEDGER_MISSING',
            priority: 'HIGH',
            evidence: `Payment ${payment.id} status=PAID but no PAYMENT_* ledger entry for appointment ${payment.appointmentId}`,
            references: { paymentId: payment.id, appointmentId: payment.appointmentId, providerId: payment.providerId ?? undefined },
            suggestedAction: 'Investigate: payment captured at provider but ledger entry was not written. May need manual ledger correction.',
          });
        }
      }
    }

    // ── CHECK 2: Payment REFUNDED but REFUND ledger missing ─────────────
    for (const payment of payments) {
      if (String(payment.status) === 'REFUNDED') {
        const entries = ledgerByAppointment.get(payment.appointmentId) ?? [];
        const hasRefundEntry = entries.some((e) => String(e.type) === 'REFUND');
        if (!hasRefundEntry) {
          mismatches.push({
            class: 'PAYMENT_REFUNDED_LEDGER_MISSING',
            priority: 'HIGH',
            evidence: `Payment ${payment.id} status=REFUNDED but no REFUND ledger entry for appointment ${payment.appointmentId}`,
            references: { paymentId: payment.id, appointmentId: payment.appointmentId },
            suggestedAction: 'Investigate: refund confirmed at provider but ledger reversal not posted.',
          });
        }
      }
    }

    // ── CHECK 3: Stale PENDING payments ─────────────────────────────────
    for (const payment of payments) {
      if (
        String(payment.status) === 'PENDING' &&
        now - payment.createdAt.getTime() > STALE_PAYMENT_MINUTES * 60 * 1000
      ) {
        mismatches.push({
          class: 'STALE_PENDING_PAYMENT',
          priority: 'MEDIUM',
          evidence: `Payment ${payment.id} stuck in PENDING since ${payment.createdAt.toISOString()} (>${STALE_PAYMENT_MINUTES}min)`,
          references: { paymentId: payment.id, appointmentId: payment.appointmentId },
          suggestedAction: 'Recovery cron should have caught this. If persistent, check webhook delivery and recovery service health.',
        });
      }
    }

    // ── CHECK 4: Stale PENDING billing attempts ─────────────────────────
    for (const attempt of billingAttempts) {
      if (
        String(attempt.status) === 'PENDING' &&
        attempt.expiresAt.getTime() < now
      ) {
        mismatches.push({
          class: 'STALE_PENDING_BILLING',
          priority: 'MEDIUM',
          evidence: `BillingAttempt ${attempt.id} PENDING past expiry ${attempt.expiresAt.toISOString()}`,
          references: { billingAttemptId: attempt.id },
          suggestedAction: 'Billing recovery cron should have expired this. Check worker health.',
        });
      }
    }

    // ── CHECK 5: Ledger sum mismatch ────────────────────────────────────
    // Only for payments that completed (PAID status means online; for cash/card
    // we check appointments with ledger entries and totalPrice set)
    for (const payment of payments) {
      if (String(payment.status) !== 'PAID' && String(payment.status) !== 'REFUNDED') continue;
      const entries = ledgerByAppointment.get(payment.appointmentId) ?? [];
      if (entries.length === 0) continue; // Already caught by CHECK 1

      const ledgerSum = entries.reduce((s, e) => s + Number(e.amount), 0);
      const paymentAmount = Number(payment.amount);

      // For non-refunded: ledger sum should roughly equal payment amount
      // For refunded: ledger sum could be 0 or negative
      if (String(payment.status) === 'PAID') {
        // Ledger should have at least the deposit + payment. Check if payment amount
        // is reasonably reflected. Note: deposits + payment - refunds = net.
        // Simple check: if net ledger is negative but payment is PAID → mismatch
        if (ledgerSum < -LEDGER_SUM_TOLERANCE) {
          mismatches.push({
            class: 'LEDGER_SUM_MISMATCH',
            priority: 'MEDIUM',
            evidence: `Appointment ${payment.appointmentId}: ledger net sum ${ledgerSum.toFixed(2)}₺ is negative but Payment is PAID`,
            references: { paymentId: payment.id, appointmentId: payment.appointmentId },
            suggestedAction: 'Ledger entries may have incorrect amounts or unexpected refunds.',
          });
        }
      }
    }

    // ── CHECK 6: Orphan webhook events ──────────────────────────────────
    for (const event of webhookEvents) {
      if (event.source === 'iyzico_payment') {
        if (!paymentsByProviderId.has(event.providerEventId)) {
          mismatches.push({
            class: 'ORPHAN_WEBHOOK',
            priority: 'LOW',
            evidence: `WebhookEvent ${event.id} (providerEventId=${event.providerEventId}) has no matching Payment.providerId`,
            references: { webhookEventId: event.id, providerId: event.providerEventId },
            suggestedAction: 'May be a stale/cancelled checkout. Low priority unless recurring.',
          });
        }
      }
    }

    // ── CHECK 7: Billing SUCCEEDED but no period ────────────────────────
    for (const attempt of billingAttempts) {
      if (String(attempt.status) === 'SUCCEEDED') {
        if (!periodsByAttempt.has(attempt.id)) {
          mismatches.push({
            class: 'BILLING_SUCCEEDED_NO_PERIOD',
            priority: 'HIGH',
            evidence: `BillingAttempt ${attempt.id} SUCCEEDED but no BillingPeriod with attemptId=${attempt.id}`,
            references: { billingAttemptId: attempt.id },
            suggestedAction: 'Billing period was not created after successful payment. Manual period creation may be needed.',
          });
        }
      }
    }

    // ── Build summary ───────────────────────────────────────────────────
    const countByClass: Record<string, number> = {};
    const countByPriority: Record<Priority, number> = { HIGH: 0, MEDIUM: 0, LOW: 0 };

    for (const m of mismatches) {
      countByClass[m.class] = (countByClass[m.class] ?? 0) + 1;
      countByPriority[m.priority]++;
    }

    return {
      totalPayments: payments.length,
      totalLedgerEntries: ledgerEntries.length,
      totalBillingAttempts: billingAttempts.length,
      mismatches: mismatches.sort(
        (a, b) => priorityOrder(a.priority) - priorityOrder(b.priority),
      ),
      mismatchCountByClass: countByClass,
      mismatchCountByPriority: countByPriority,
    };
  }
}

function priorityOrder(p: Priority): number {
  return p === 'HIGH' ? 1 : p === 'MEDIUM' ? 2 : 3;
}
