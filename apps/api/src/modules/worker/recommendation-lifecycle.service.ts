/**
 * RECOMMENDATION LIFECYCLE SERVICE
 * ─────────────────────────────────────────────────────────────────────────────
 * Server-side outcome observation + window expiry + supersede automation.
 *
 * Three cron responsibilities:
 *   1. Outcome observation — link new bookings to ACTIVE/ACTED recommendations
 *   2. Window expiry — ACTIVE/ACTED past windowDays → EXPIRED
 *   3. Supersede — when multiple ACTIVE recs exist per customer, keep latest
 *
 * Lifecycle state machine:
 *   ACTIVE  → ACTED      (operator clicks CTA — via controller)
 *   ACTIVE  → RESOLVED   (booking observed within window)
 *   ACTIVE  → EXPIRED    (window closes, no outcome)
 *   ACTIVE  → SUPERSEDED (newer recommendation generated for same customer)
 *   ACTED   → RESOLVED   (booking observed within window)
 *   ACTED   → EXPIRED    (window closes, no outcome)
 *
 * Observed-only semantics — no causal claims.
 * ─────────────────────────────────────────────────────────────────────────────
 */

import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { Cron, CronExpression }             from '@nestjs/schedule';
import { PrismaService }                    from '../../common/prisma.service';

/** Valid terminal statuses — no further transitions allowed */
const TERMINAL_STATUSES = ['RESOLVED', 'EXPIRED', 'SUPERSEDED'] as const;

/** Statuses eligible for outcome observation */
const OBSERVABLE_STATUSES = ['ACTIVE', 'ACTED'] as const;

@Injectable()
export class RecommendationLifecycleService implements OnModuleInit {
  private readonly logger = new Logger(RecommendationLifecycleService.name);

  constructor(private readonly prisma: PrismaService) {}

  onModuleInit() {
    this.logger.log('[RecommendationLifecycle] Service initialized');
  }

  // ── 1. OUTCOME OBSERVATION ───────────────────────────────────────────────
  /**
   * Every 5 minutes: find bookings created since last check for customers
   * with ACTIVE/ACTED recommendations → link booking + RESOLVED.
   *
   * Linkage rule (deterministic):
   *   - For each customer with a new booking, find the MOST RECENT
   *     ACTIVE or ACTED recommendation (by generatedAt DESC).
   *   - Only one recommendation gets the outcome (latest wins).
   *   - Booking must be created within recommendation's observation window.
   *
   * Booking eligibility:
   *   - Status: PENDING, CONFIRMED, CHECKED_IN, IN_SERVICE, COMPLETED
   *   - NOT: CANCELLED, NO_SHOW (these are negative signals, not outcomes)
   *   - createdAt within recommendation's window (generatedAt + windowDays)
   */
  @Cron(CronExpression.EVERY_5_MINUTES)
  async observeBookingOutcomes(): Promise<void> {
    try {
      // Find all ACTIVE/ACTED recommendations with open windows
      const openRecs = await this.prisma.recommendationObservation.findMany({
        where: {
          status: { in: [...OBSERVABLE_STATUSES] },
        },
        select: {
          id: true,
          tenantId: true,
          customerId: true,
          generatedAt: true,
          windowDays: true,
          status: true,
        },
        orderBy: { generatedAt: 'desc' },
      });

      if (openRecs.length === 0) return;

      // Group by tenant+customer → only latest per customer gets outcome
      const latestPerCustomer = new Map<string, typeof openRecs[0]>();
      for (const rec of openRecs) {
        const key = `${rec.tenantId}:${rec.customerId}`;
        if (!latestPerCustomer.has(key)) {
          latestPerCustomer.set(key, rec); // already sorted desc
        }
      }

      let resolvedCount = 0;

      for (const [, rec] of latestPerCustomer) {
        const windowEnd = new Date(
          rec.generatedAt.getTime() + rec.windowDays * 24 * 60 * 60 * 1000,
        );

        // Skip if window already expired (expiry cron handles that)
        if (windowEnd < new Date()) continue;

        // Find the earliest qualifying booking after recommendation was generated
        const booking = await this.prisma.appointment.findFirst({
          where: {
            tenantId: rec.tenantId,
            customerId: rec.customerId,
            isDeleted: false,
            isTestBooking: false,
            status: {
              in: [
                'PENDING',
                'CONFIRMED',
                'CHECKED_IN',
                'IN_SERVICE',
                'COMPLETED',
              ],
            },
            createdAt: {
              gte: rec.generatedAt,
              lte: windowEnd,
            },
          },
          orderBy: { createdAt: 'asc' },
          select: { id: true, status: true },
        });

        if (!booking) continue;

        // Determine outcome type based on booking status
        const outcomeType =
          booking.status === 'COMPLETED'
            ? 'booking_completed'
            : 'booking_created';

        // Resolve the recommendation
        await this.prisma.recommendationObservation.update({
          where: { id: rec.id },
          data: {
            status: 'RESOLVED',
            outcomeType,
            outcomeObservedAt: new Date(),
            linkedBookingId: booking.id,
          },
        });

        resolvedCount++;
      }

      if (resolvedCount > 0) {
        this.logger.log(
          `[RecommendationLifecycle] Outcome observed: ${resolvedCount} recommendations → RESOLVED`,
        );
      }
    } catch (err) {
      this.logger.error(
        `[RecommendationLifecycle] Outcome observation failed`,
        err instanceof Error ? err.stack : String(err),
      );
    }
  }

  // ── 2. WINDOW EXPIRY ────────────────────────────────────────────────────
  /**
   * Every 30 minutes: find ACTIVE/ACTED recommendations past their
   * observation window → EXPIRED.
   *
   * windowEnd = generatedAt + windowDays
   * If NOW > windowEnd and status is still ACTIVE/ACTED → EXPIRED
   * outcomeType = 'no_change'
   */
  @Cron(CronExpression.EVERY_30_MINUTES)
  async expireStaleRecommendations(): Promise<void> {
    try {
      const now = new Date();

      // Raw query: we need generatedAt + windowDays < NOW which Prisma
      // can't express natively. Use updateMany with a subquery approach.
      // First find candidates, then batch update.
      const candidates = await this.prisma.recommendationObservation.findMany({
        where: {
          status: { in: [...OBSERVABLE_STATUSES] },
        },
        select: {
          id: true,
          generatedAt: true,
          windowDays: true,
        },
      });

      const expiredIds: string[] = [];
      for (const rec of candidates) {
        const windowEnd = new Date(
          rec.generatedAt.getTime() + rec.windowDays * 24 * 60 * 60 * 1000,
        );
        if (now > windowEnd) {
          expiredIds.push(rec.id);
        }
      }

      if (expiredIds.length === 0) return;

      // Batch update in chunks of 100
      for (let i = 0; i < expiredIds.length; i += 100) {
        const chunk = expiredIds.slice(i, i + 100);
        await this.prisma.recommendationObservation.updateMany({
          where: { id: { in: chunk } },
          data: {
            status: 'EXPIRED',
            outcomeType: 'no_change',
            outcomeObservedAt: now,
          },
        });
      }

      this.logger.log(
        `[RecommendationLifecycle] Window expired: ${expiredIds.length} recommendations → EXPIRED`,
      );
    } catch (err) {
      this.logger.error(
        `[RecommendationLifecycle] Window expiry failed`,
        err instanceof Error ? err.stack : String(err),
      );
    }
  }

  // ── 3. SUPERSEDE DUPLICATES ──────────────────────────────────────────────
  /**
   * Every 30 minutes: if multiple ACTIVE recommendations exist for the
   * same tenant+customer, keep only the latest → older ones SUPERSEDED.
   *
   * This handles the edge case where the upsert (by fingerprint) creates
   * a new record because the fingerprint changed (different urgencyClass
   * or date) while an older ACTIVE record still exists.
   */
  @Cron(CronExpression.EVERY_30_MINUTES)
  async supersedeDuplicates(): Promise<void> {
    try {
      // Find customers with multiple ACTIVE recommendations
      const groups = await this.prisma.recommendationObservation.groupBy({
        by: ['tenantId', 'customerId'],
        where: { status: 'ACTIVE' },
        _count: { id: true },
        having: {
          id: { _count: { gt: 1 } },
        },
      });

      if (groups.length === 0) return;

      let supersededCount = 0;

      for (const group of groups) {
        // Get all ACTIVE recs for this customer, newest first
        const recs = await this.prisma.recommendationObservation.findMany({
          where: {
            tenantId: group.tenantId,
            customerId: group.customerId,
            status: 'ACTIVE',
          },
          orderBy: { generatedAt: 'desc' },
          select: { id: true },
        });

        // Keep the first (newest), supersede the rest
        const toSupersede = recs.slice(1).map((r) => r.id);
        if (toSupersede.length === 0) continue;

        await this.prisma.recommendationObservation.updateMany({
          where: { id: { in: toSupersede } },
          data: { status: 'SUPERSEDED' },
        });

        supersededCount += toSupersede.length;
      }

      if (supersededCount > 0) {
        this.logger.log(
          `[RecommendationLifecycle] Superseded: ${supersededCount} older recommendations → SUPERSEDED`,
        );
      }
    } catch (err) {
      this.logger.error(
        `[RecommendationLifecycle] Supersede check failed`,
        err instanceof Error ? err.stack : String(err),
      );
    }
  }
}
