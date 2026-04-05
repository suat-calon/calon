/**
 * PAYMENT RECOVERY SERVICE — CHECKOUT-LEDGER-02
 * ─────────────────────────────────────────────────────────────────────────────
 * Recovers stuck payment states:
 *
 *   1. Stale PENDING payments — mark FAILED after 30 minutes
 *   2. Stale PENDING billing attempts — mark EXPIRED after 30 minutes
 *
 * These situations arise when:
 *   - Iyzico webhook fails to deliver (network, timeout)
 *   - Customer abandons payment page
 *   - Webhook processed but local state update failed
 *
 * Recovery is idempotent — safe to run multiple times.
 * No financial truth is created during recovery. Only stuck states are cleaned.
 * ─────────────────────────────────────────────────────────────────────────────
 */

import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { Cron, CronExpression }             from '@nestjs/schedule';
import { PrismaService }                    from '../../common/prisma.service';

/** Stale payment threshold: 30 minutes */
const STALE_PAYMENT_MINUTES = 30;

@Injectable()
export class PaymentRecoveryService implements OnModuleInit {
  private readonly logger = new Logger(PaymentRecoveryService.name);

  constructor(private readonly prisma: PrismaService) {}

  onModuleInit() {
    this.logger.log('[PaymentRecovery] Service initialized');
  }

  /**
   * Every 5 minutes: find PENDING payments older than 30 minutes → mark FAILED.
   *
   * Rationale:
   *   - Iyzico checkout forms expire after ~30 minutes
   *   - If webhook never arrived, payment is stuck in PENDING
   *   - Customer's appointment stays in PENDING_PAYMENT (unusable)
   *   - Recovery marks payment FAILED and appointment CANCELLED
   *
   * Safety:
   *   - Only touches PENDING payments (not PAID/FAILED/REFUNDED)
   *   - Atomic per-payment update (no batch that could fail partially)
   *   - Logs every recovery action for audit
   *   - If webhook arrives after recovery, WebhookEvent @unique gate
   *     prevents double-processing
   */
  @Cron(CronExpression.EVERY_5_MINUTES)
  async recoverStalePayments(): Promise<void> {
    try {
      const cutoff = new Date(Date.now() - STALE_PAYMENT_MINUTES * 60 * 1000);

      const stalePayments = await this.prisma.payment.findMany({
        where: {
          status: 'PENDING',
          createdAt: { lt: cutoff },
        },
        select: {
          id: true,
          tenantId: true,
          appointmentId: true,
          createdAt: true,
        },
        take: 50, // Batch limit to prevent overload
      });

      if (stalePayments.length === 0) return;

      this.logger.log(
        `[PaymentRecovery] Found ${stalePayments.length} stale PENDING payments (>${STALE_PAYMENT_MINUTES}min)`,
      );

      for (const payment of stalePayments) {
        try {
          await this.prisma.$transaction([
            // Mark payment as FAILED
            this.prisma.payment.update({
              where: { id: payment.id },
              data: { status: 'FAILED' },
            }),
            // Mark appointment as CANCELLED (if still PENDING_PAYMENT)
            this.prisma.appointment.updateMany({
              where: {
                id: payment.appointmentId,
                tenantId: payment.tenantId,
                status: 'PENDING_PAYMENT',
              },
              data: {
                status: 'CANCELLED',
                cancelledAt: new Date(),
                cancellationReason: 'Payment timeout — no webhook received within 30 minutes',
              },
            }),
          ]);

          this.logger.log(
            `[PaymentRecovery] Recovered: payment=${payment.id} → FAILED, appointment=${payment.appointmentId} → CANCELLED`,
          );
        } catch (err) {
          // Per-payment error isolation — don't fail the whole batch
          this.logger.error(
            `[PaymentRecovery] Failed to recover payment=${payment.id}`,
            err instanceof Error ? err.message : String(err),
          );
        }
      }
    } catch (err) {
      this.logger.error(
        '[PaymentRecovery] Recovery scan failed',
        err instanceof Error ? err.stack : String(err),
      );
    }
  }

  /**
   * Every 5 minutes: find PENDING billing attempts older than 30 minutes → mark EXPIRED.
   */
  @Cron(CronExpression.EVERY_5_MINUTES)
  async expireStaleBillingAttempts(): Promise<void> {
    try {
      const now = new Date();

      const result = await this.prisma.billingAttempt.updateMany({
        where: {
          status: 'PENDING',
          expiresAt: { lt: now },
        },
        data: {
          status: 'FAILED', // No EXPIRED enum — use FAILED for TTL-expired attempts
        },
      });

      if (result.count > 0) {
        this.logger.log(
          `[PaymentRecovery] Expired ${result.count} stale PENDING billing attempts`,
        );
      }
    } catch (err) {
      this.logger.error(
        '[PaymentRecovery] Billing attempt expiry failed',
        err instanceof Error ? err.stack : String(err),
      );
    }
  }
}
