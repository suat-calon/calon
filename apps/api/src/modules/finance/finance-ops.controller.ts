/**
 * FINANCE OPS CONTROLLER — CHECKOUT-LEDGER-04
 * ─────────────────────────────────────────────────────────────────────────────
 * Reconciliation operations governance.
 * Manages mismatch review lifecycle: detection → queue → decision → resolution.
 *
 * NO auto-repair. Operational discipline only.
 *
 * Lifecycle:
 *   NEW → UNDER_REVIEW → RESOLVED / ESCALATED / CLOSED_FALSE_POSITIVE / CLOSED_NO_ACTION
 *   NEW → WAITING_EXTERNAL → RESOLVED / ESCALATED
 *
 * Decision classes:
 *   RESOLVE_MANUALLY — manual repair needed, documented
 *   ESCALATE — needs higher authority review
 *   WATCH — monitor, re-review later
 *   NO_ACTION — reviewed, no action needed
 *   FALSE_POSITIVE — not a real mismatch
 *   BLOCKED — cannot resolve, external dependency
 *
 * Cadence:
 *   WEEKLY — finance mismatch review
 *   AD_HOC — urgent HIGH priority cases
 * ─────────────────────────────────────────────────────────────────────────────
 */

import {
  Controller,
  Post,
  Get,
  Body,
  Param,
  HttpCode,
  HttpStatus,
  BadRequestException,
  Query,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { CurrentTenant } from '../../common/decorators/current-tenant.decorator';
import { PrismaService } from '../../common/prisma.service';
import { ReconciliationService } from './reconciliation.service';

// ── Constants ──────────────────────────────────────────────────────────────

const VALID_STATUSES = [
  'NEW', 'UNDER_REVIEW', 'WAITING_EXTERNAL',
  'RESOLVED', 'ESCALATED', 'CLOSED_FALSE_POSITIVE', 'CLOSED_NO_ACTION',
] as const;

const VALID_DECISIONS = [
  'RESOLVE_MANUALLY', 'ESCALATE', 'WATCH',
  'NO_ACTION', 'FALSE_POSITIVE', 'BLOCKED',
] as const;

const VALID_PRIORITIES = ['HIGH', 'MEDIUM', 'LOW'] as const;

// Terminal statuses — no further transitions
const TERMINAL_STATUSES = new Set(['RESOLVED', 'CLOSED_FALSE_POSITIVE', 'CLOSED_NO_ACTION']);

// ── DTOs ────────────────────────────────────────────────────────────────────

class CreateMismatchReviewDto {
  mismatchClass!: string;
  priority!: string;
  referenceType!: string;
  referenceId!: string;
  evidence!: string;
}

class DecisionDto {
  decision!: string;
  decisionReason!: string;
  decidedBy!: string;
  nextReviewDate?: string;
  notes?: string;
}

class AssignOwnerDto {
  owner!: string;
}

class ManualRepairDto {
  repairNote!: string;
  repairPerformedBy!: string;
  notes?: string;
}

class EscalateDto {
  escalationReason!: string;
  escalatedTo!: string;
  decidedBy!: string;
}

class VerifyRepairDto {
  verifiedBy!: string;
  notes?: string;
}

// ── Controller ──────────────────────────────────────────────────────────────

@Controller('finance-ops')
export class FinanceOpsController {
  constructor(
    private readonly prisma: PrismaService,
    private readonly reconciliation: ReconciliationService,
  ) {}

  // ═══════════════════════════════════════════════════════════════════════════
  // QUEUE MANAGEMENT
  // ═══════════════════════════════════════════════════════════════════════════

  /**
   * POST /finance-ops/detect
   * Run reconciliation and create review records for new mismatches.
   * Idempotent: skips mismatches that already have an open review.
   */
  @Post('detect')
  @HttpCode(HttpStatus.OK)
  async detectMismatches(@CurrentTenant() tenantId: string) {
    const recon = await this.reconciliation.reconcile(tenantId);
    let created = 0;

    for (const mismatch of recon.mismatches) {
      // Build a deterministic key to prevent duplicate reviews
      const refId = mismatch.references.paymentId
        ?? mismatch.references.billingAttemptId
        ?? mismatch.references.webhookEventId
        ?? 'unknown';
      const refType = mismatch.references.paymentId ? 'payment'
        : mismatch.references.billingAttemptId ? 'billing_attempt'
        : mismatch.references.webhookEventId ? 'webhook_event'
        : 'unknown';

      // Check if an open (non-terminal) review already exists
      const existing = await this.prisma.financeMismatchReview.findFirst({
        where: {
          tenantId,
          mismatchClass: mismatch.class,
          referenceId: refId,
          status: { notIn: [...TERMINAL_STATUSES] },
        },
      });

      if (existing) continue; // Already tracked

      await this.prisma.financeMismatchReview.create({
        data: {
          tenantId,
          mismatchClass: mismatch.class,
          priority: mismatch.priority,
          referenceType: refType,
          referenceId: refId,
          evidence: mismatch.evidence,
        },
      });
      created++;
    }

    return {
      totalMismatches: recon.mismatches.length,
      newReviewsCreated: created,
      skippedAlreadyTracked: recon.mismatches.length - created,
    };
  }

  /**
   * GET /finance-ops/queue
   * Finance mismatch review queue — prioritized, filterable.
   */
  @Get('queue')
  @HttpCode(HttpStatus.OK)
  async getQueue(
    @CurrentTenant() tenantId: string,
    @Query('status') status?: string,
    @Query('priority') priority?: string,
    @Query('take') take?: string,
  ) {
    const where: Prisma.FinanceMismatchReviewWhereInput = { tenantId };
    if (status && VALID_STATUSES.includes(status as (typeof VALID_STATUSES)[number])) {
      where.status = status;
    }
    if (priority && VALID_PRIORITIES.includes(priority as (typeof VALID_PRIORITIES)[number])) {
      where.priority = priority;
    }

    const [items, counts] = await Promise.all([
      this.prisma.financeMismatchReview.findMany({
        where,
        orderBy: [
          { priority: 'asc' }, // HIGH first (alphabetical: H < L < M, need custom sort)
          { detectedAt: 'desc' },
        ],
        take: Math.min(Number(take) || 30, 50),
      }),
      // Summary counts
      Promise.all([
        this.prisma.financeMismatchReview.count({ where: { tenantId, status: 'NEW' } }),
        this.prisma.financeMismatchReview.count({ where: { tenantId, status: 'UNDER_REVIEW' } }),
        this.prisma.financeMismatchReview.count({ where: { tenantId, status: 'WAITING_EXTERNAL' } }),
        this.prisma.financeMismatchReview.count({ where: { tenantId, status: 'ESCALATED' } }),
        this.prisma.financeMismatchReview.count({ where: { tenantId, priority: 'HIGH', status: { notIn: [...TERMINAL_STATUSES] } } }),
      ]),
    ]);

    // Sort: HIGH > MEDIUM > LOW (custom since alphabetical doesn't work)
    const priorityOrder = { HIGH: 1, MEDIUM: 2, LOW: 3 } as Record<string, number>;
    items.sort((a, b) =>
      (priorityOrder[a.priority] ?? 9) - (priorityOrder[b.priority] ?? 9) ||
      b.detectedAt.getTime() - a.detectedAt.getTime(),
    );

    return {
      items,
      summary: {
        new: counts[0],
        underReview: counts[1],
        waitingExternal: counts[2],
        escalated: counts[3],
        highPriorityOpen: counts[4],
      },
      cadenceGuide: {
        WEEKLY: 'Review all NEW + UNDER_REVIEW mismatches. Decide: RESOLVE / WATCH / NO_ACTION / ESCALATE.',
        AD_HOC: 'HIGH priority mismatches should be reviewed within 24 hours.',
      },
    };
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // LIFECYCLE ACTIONS
  // ═══════════════════════════════════════════════════════════════════════════

  /** POST /finance-ops/:id/assign — Assign owner */
  @Post(':id/assign')
  @HttpCode(HttpStatus.OK)
  async assignOwner(
    @CurrentTenant() tenantId: string,
    @Param('id') id: string,
    @Body() dto: AssignOwnerDto,
  ) {
    const review = await this.findOrFail(tenantId, id);
    this.guardNotTerminal(review.status);

    return this.prisma.financeMismatchReview.update({
      where: { id },
      data: {
        owner: dto.owner,
        status: review.status === 'NEW' ? 'UNDER_REVIEW' : review.status,
      },
    });
  }

  /** POST /finance-ops/:id/decide — Record decision */
  @Post(':id/decide')
  @HttpCode(HttpStatus.OK)
  async recordDecision(
    @CurrentTenant() tenantId: string,
    @Param('id') id: string,
    @Body() dto: DecisionDto,
  ) {
    const review = await this.findOrFail(tenantId, id);
    this.guardNotTerminal(review.status);

    if (!VALID_DECISIONS.includes(dto.decision as (typeof VALID_DECISIONS)[number])) {
      throw new BadRequestException(`Invalid decision. Must be: ${VALID_DECISIONS.join(', ')}`);
    }

    // Map decision → status
    const statusMap: Record<string, string> = {
      RESOLVE_MANUALLY: 'UNDER_REVIEW', // stays under review until repair verified
      ESCALATE: 'ESCALATED',
      WATCH: 'UNDER_REVIEW', // stays open, next review date set
      NO_ACTION: 'CLOSED_NO_ACTION',
      FALSE_POSITIVE: 'CLOSED_FALSE_POSITIVE',
      BLOCKED: 'WAITING_EXTERNAL',
    };

    return this.prisma.financeMismatchReview.update({
      where: { id },
      data: {
        decision: dto.decision,
        decisionReason: dto.decisionReason,
        decidedBy: dto.decidedBy,
        decidedAt: new Date(),
        status: statusMap[dto.decision] ?? review.status,
        nextReviewDate: dto.nextReviewDate ? new Date(dto.nextReviewDate) : undefined,
        manualRepairNeeded: dto.decision === 'RESOLVE_MANUALLY',
        notes: appendNote(review.notes, `DECISION: ${dto.decision}`, dto.notes),
      },
    });
  }

  /** POST /finance-ops/:id/escalate — Escalate to higher authority */
  @Post(':id/escalate')
  @HttpCode(HttpStatus.OK)
  async escalate(
    @CurrentTenant() tenantId: string,
    @Param('id') id: string,
    @Body() dto: EscalateDto,
  ) {
    const review = await this.findOrFail(tenantId, id);
    this.guardNotTerminal(review.status);

    return this.prisma.financeMismatchReview.update({
      where: { id },
      data: {
        status: 'ESCALATED',
        decision: 'ESCALATE',
        decidedBy: dto.decidedBy,
        decidedAt: new Date(),
        escalationReason: dto.escalationReason,
        escalatedTo: dto.escalatedTo,
        notes: appendNote(review.notes, 'ESCALATED', dto.escalationReason),
      },
    });
  }

  /** POST /finance-ops/:id/repair — Record manual repair */
  @Post(':id/repair')
  @HttpCode(HttpStatus.OK)
  async recordRepair(
    @CurrentTenant() tenantId: string,
    @Param('id') id: string,
    @Body() dto: ManualRepairDto,
  ) {
    const review = await this.findOrFail(tenantId, id);
    if (review.status === 'CLOSED_FALSE_POSITIVE' || review.status === 'CLOSED_NO_ACTION') {
      throw new BadRequestException('Cannot repair a closed review.');
    }

    return this.prisma.financeMismatchReview.update({
      where: { id },
      data: {
        manualRepairNeeded: true,
        repairNote: dto.repairNote,
        repairPerformedBy: dto.repairPerformedBy,
        repairPerformedAt: new Date(),
        notes: appendNote(review.notes, 'REPAIR', dto.notes),
      },
    });
  }

  /** POST /finance-ops/:id/verify-repair — Verify repair was effective */
  @Post(':id/verify-repair')
  @HttpCode(HttpStatus.OK)
  async verifyRepair(
    @CurrentTenant() tenantId: string,
    @Param('id') id: string,
    @Body() dto: VerifyRepairDto,
  ) {
    const review = await this.findOrFail(tenantId, id);
    if (!review.repairPerformedAt) {
      throw new BadRequestException('No repair has been performed yet.');
    }

    return this.prisma.financeMismatchReview.update({
      where: { id },
      data: {
        status: 'RESOLVED',
        repairVerifiedAt: new Date(),
        notes: appendNote(review.notes, 'VERIFIED', dto.notes),
      },
    });
  }

  /** POST /finance-ops/:id/resolve — Directly resolve (no repair needed) */
  @Post(':id/resolve')
  @HttpCode(HttpStatus.OK)
  async resolve(
    @CurrentTenant() tenantId: string,
    @Param('id') id: string,
    @Body() dto: { resolvedBy: string; notes?: string },
  ) {
    const review = await this.findOrFail(tenantId, id);
    this.guardNotTerminal(review.status);

    return this.prisma.financeMismatchReview.update({
      where: { id },
      data: {
        status: 'RESOLVED',
        decidedBy: dto.resolvedBy,
        decidedAt: new Date(),
        notes: appendNote(review.notes, 'RESOLVED', dto.notes),
      },
    });
  }

  /** GET /finance-ops/:id — Single review detail */
  @Get(':id')
  @HttpCode(HttpStatus.OK)
  async getReview(@CurrentTenant() tenantId: string, @Param('id') id: string) {
    return this.findOrFail(tenantId, id);
  }

  // ── Helpers ─────────────────────────────────────────────────────────────

  private async findOrFail(tenantId: string, id: string) {
    const review = await this.prisma.financeMismatchReview.findFirst({
      where: { id, tenantId },
    });
    if (!review) throw new BadRequestException(`Review ${id} not found.`);
    return review;
  }

  private guardNotTerminal(status: string) {
    if (TERMINAL_STATUSES.has(status)) {
      throw new BadRequestException(`Cannot modify review in terminal status '${status}'.`);
    }
  }
}

function appendNote(existing: string | null, tag: string, note?: string | null): string {
  const entry = note ? `[${tag}] ${note}` : `[${tag}]`;
  return existing ? `${existing}\n${entry}`.trim() : entry;
}
