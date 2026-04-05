/**
 * OPS REVIEW CONTROLLER — CUSTOMER-INTELLIGENCE-OPS-01
 * ─────────────────────────────────────────────────────────────────────────────
 * Operating model for the Customer Intelligence Engine.
 *
 * Provides:
 *   1. Decision record creation (APPLY / WAIT / REJECT / ROLLBACK / ESCALATE / NO_CHANGE)
 *   2. Ops dashboard readout (pending reviews, watch items, decision history)
 *   3. Patch review status management (PENDING_REVIEW / UNDER_WATCH / REVIEWED)
 *   4. Cadence-aware review queue
 *
 * Review cadence:
 *   WEEKLY          — operational health read
 *   BIWEEKLY        — refinement review (candidate decisions)
 *   MONTHLY         — governance review (drift, rollback, constitutional integrity)
 *
 * Decision classes:
 *   APPLY                    — evidence sufficient, constitution pass, promote to apply
 *   WAIT_FOR_MORE_EVIDENCE   — signal present but sample/ambiguity too high
 *   REJECT                   — not actionable, low value, or constitutional risk
 *   ROLLBACK                 — applied patch shows negative aftermath
 *   ESCALATE                 — needs system guardian / constitutional edge case
 *   NO_CHANGE                — reviewed, no action needed (valid and auditable)
 *   STABLE / DEGRADING       — health read verdicts (not patch decisions)
 *
 * Role authority (documented, not enforced by RBAC yet):
 *   Product/Ops Owner:    review all, approve SAFE_TO_TRY, veto
 *   System Guardian:      review all, approve all, apply all, rollback all, constitutional veto
 *   Execution Owner:      review assigned, apply approved, rollback applied
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

// ── Constants ──────────────────────────────────────────────────────────────

const VALID_REVIEW_TYPES = [
  'HEALTH_READ',
  'REFINEMENT_REVIEW',
  'GOVERNANCE_REVIEW',
  'CANDIDATE_DECISION',
  'PATCH_AFTERMATH',
] as const;

const VALID_CADENCES = ['WEEKLY', 'BIWEEKLY', 'MONTHLY', 'AD_HOC'] as const;

const VALID_DECISIONS = [
  'APPLY',
  'WAIT_FOR_MORE_EVIDENCE',
  'REJECT',
  'ROLLBACK',
  'ESCALATE',
  'NO_CHANGE',
  'STABLE',
  'DEGRADING',
] as const;

const VALID_CONFIDENCE = ['HIGH', 'MEDIUM', 'LOW', 'INSUFFICIENT'] as const;

const VALID_REVIEW_STATUSES = ['PENDING_REVIEW', 'UNDER_WATCH', 'REVIEWED'] as const;

// ── DTOs ────────────────────────────────────────────────────────────────────

class CreateReviewRecordDto {
  reviewType!: string;
  cadence!: string;
  reviewedBy!: string;
  decision!: string;
  decisionReason!: string;
  confidenceOfRead!: string;
  linkedPatchId?: string;
  linkedCandidateType?: string;
  evidenceSummary!: string;
  constitutionalNote?: string;
  nextReviewDate?: string; // ISO date
  watchItems?: string;
}

class UpdatePatchReviewDto {
  reviewStatus!: string;
  watchUntil?: string; // ISO date
  nextReviewDate?: string; // ISO date
}

// ── Controller ──────────────────────────────────────────────────────────────

@Controller('ops-reviews')
export class OpsReviewController {
  constructor(private readonly prisma: PrismaService) {}

  // ═══════════════════════════════════════════════════════════════════════════
  // DECISION RECORDS
  // ═══════════════════════════════════════════════════════════════════════════

  /**
   * POST /ops-reviews
   * Create an operational review decision record.
   * This is the formal audit trail for every review decision.
   */
  @Post()
  @HttpCode(HttpStatus.CREATED)
  async createReviewRecord(
    @CurrentTenant() tenantId: string,
    @Body() dto: CreateReviewRecordDto,
  ) {
    if (!VALID_REVIEW_TYPES.includes(dto.reviewType as (typeof VALID_REVIEW_TYPES)[number])) {
      throw new BadRequestException(`Invalid reviewType. Must be: ${VALID_REVIEW_TYPES.join(', ')}`);
    }
    if (!VALID_CADENCES.includes(dto.cadence as (typeof VALID_CADENCES)[number])) {
      throw new BadRequestException(`Invalid cadence. Must be: ${VALID_CADENCES.join(', ')}`);
    }
    if (!VALID_DECISIONS.includes(dto.decision as (typeof VALID_DECISIONS)[number])) {
      throw new BadRequestException(`Invalid decision. Must be: ${VALID_DECISIONS.join(', ')}`);
    }
    if (!VALID_CONFIDENCE.includes(dto.confidenceOfRead as (typeof VALID_CONFIDENCE)[number])) {
      throw new BadRequestException(`Invalid confidenceOfRead. Must be: ${VALID_CONFIDENCE.join(', ')}`);
    }

    return this.prisma.opsReviewRecord.create({
      data: {
        tenantId,
        reviewType: dto.reviewType,
        cadence: dto.cadence,
        reviewedBy: dto.reviewedBy,
        decision: dto.decision,
        decisionReason: dto.decisionReason,
        confidenceOfRead: dto.confidenceOfRead,
        linkedPatchId: dto.linkedPatchId ?? null,
        linkedCandidateType: dto.linkedCandidateType ?? null,
        evidenceSummary: dto.evidenceSummary,
        constitutionalNote: dto.constitutionalNote ?? null,
        nextReviewDate: dto.nextReviewDate ? new Date(dto.nextReviewDate) : null,
        watchItems: dto.watchItems ?? null,
      },
    });
  }

  /**
   * GET /ops-reviews
   * List review records for tenant with optional filters.
   */
  @Get()
  @HttpCode(HttpStatus.OK)
  async listReviewRecords(
    @CurrentTenant() tenantId: string,
    @Query('reviewType') reviewType?: string,
    @Query('decision') decision?: string,
    @Query('take') take?: string,
  ) {
    const where: Prisma.OpsReviewRecordWhereInput = { tenantId };
    if (reviewType && VALID_REVIEW_TYPES.includes(reviewType as (typeof VALID_REVIEW_TYPES)[number])) {
      where.reviewType = reviewType;
    }
    if (decision && VALID_DECISIONS.includes(decision as (typeof VALID_DECISIONS)[number])) {
      where.decision = decision;
    }

    return this.prisma.opsReviewRecord.findMany({
      where,
      orderBy: { reviewedAt: 'desc' },
      take: Math.min(Number(take) || 20, 50),
    });
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // PATCH REVIEW STATUS
  // ═══════════════════════════════════════════════════════════════════════════

  /**
   * POST /ops-reviews/patches/:id/review-status
   * Update the operational review status of a patch.
   */
  @Post('patches/:id/review-status')
  @HttpCode(HttpStatus.OK)
  async updatePatchReviewStatus(
    @CurrentTenant() tenantId: string,
    @Param('id') patchId: string,
    @Body() dto: UpdatePatchReviewDto,
  ) {
    if (!VALID_REVIEW_STATUSES.includes(dto.reviewStatus as (typeof VALID_REVIEW_STATUSES)[number])) {
      throw new BadRequestException(`Invalid reviewStatus. Must be: ${VALID_REVIEW_STATUSES.join(', ')}`);
    }

    const patch = await this.prisma.policyPatch.findFirst({
      where: { id: patchId, tenantId },
    });
    if (!patch) throw new BadRequestException(`Patch ${patchId} not found.`);

    return this.prisma.policyPatch.update({
      where: { id: patchId },
      data: {
        reviewStatus: dto.reviewStatus,
        watchUntil: dto.watchUntil ? new Date(dto.watchUntil) : undefined,
        nextReviewDate: dto.nextReviewDate ? new Date(dto.nextReviewDate) : undefined,
      },
    });
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // OPS DASHBOARD
  // ═══════════════════════════════════════════════════════════════════════════

  /**
   * GET /ops-reviews/dashboard
   * Internal ops dashboard — pending reviews, watch items, recent decisions.
   */
  @Get('dashboard')
  @HttpCode(HttpStatus.OK)
  async getOpsDashboard(@CurrentTenant() tenantId: string) {
    const now = new Date();

    const [
      pendingReviewPatches,
      underWatchPatches,
      appliedPatches,
      recentDecisions,
      draftPatches,
    ] = await Promise.all([
      // Patches needing review
      this.prisma.policyPatch.findMany({
        where: { tenantId, reviewStatus: 'PENDING_REVIEW' },
        orderBy: { createdAt: 'desc' },
        take: 10,
        select: {
          id: true, patchType: true, status: true, safetyClass: true,
          affectedArea: true, evidenceSummary: true, createdAt: true,
          reviewStatus: true, nextReviewDate: true,
        },
      }),
      // Patches under watch (post-apply observation)
      this.prisma.policyPatch.findMany({
        where: { tenantId, reviewStatus: 'UNDER_WATCH' },
        orderBy: { appliedAt: 'desc' },
        take: 10,
        select: {
          id: true, patchType: true, status: true, affectedArea: true,
          appliedAt: true, watchUntil: true, nextReviewDate: true,
          reviewStatus: true,
        },
      }),
      // Recently applied patches
      this.prisma.policyPatch.count({
        where: { tenantId, status: 'APPLIED' },
      }),
      // Recent decision records
      this.prisma.opsReviewRecord.findMany({
        where: { tenantId },
        orderBy: { reviewedAt: 'desc' },
        take: 10,
        select: {
          id: true, reviewType: true, cadence: true, decision: true,
          decisionReason: true, confidenceOfRead: true, reviewedBy: true,
          reviewedAt: true, linkedPatchId: true, nextReviewDate: true,
        },
      }),
      // Draft patches (candidate → patch, not yet reviewed)
      this.prisma.policyPatch.count({
        where: { tenantId, status: 'DRAFT' },
      }),
    ]);

    // Watch items expiring soon (within 7 days)
    const expiringWatchItems = underWatchPatches.filter(
      (p) => p.watchUntil && new Date(p.watchUntil).getTime() <= now.getTime() + 7 * 24 * 60 * 60 * 1000,
    );

    return {
      summary: {
        pendingReviewCount: pendingReviewPatches.length,
        underWatchCount: underWatchPatches.length,
        appliedPatchCount: appliedPatches,
        draftPatchCount: draftPatches,
        expiringWatchCount: expiringWatchItems.length,
      },
      pendingReviewPatches,
      underWatchPatches,
      expiringWatchItems,
      recentDecisions,
      cadenceGuide: {
        WEEKLY: 'Operational health read — observed rates, friction, noise',
        BIWEEKLY: 'Refinement review — candidate evaluation, APPLY/WAIT/REJECT decisions',
        MONTHLY: 'Governance review — patch history, rollback, drift, constitutional integrity',
      },
      roleGuide: {
        'Product/Ops Owner': 'Review all, approve SAFE_TO_TRY, veto',
        'System Guardian': 'Review all, approve all, apply all, rollback all, constitutional veto',
        'Execution Owner': 'Review assigned, apply approved only, rollback applied only',
      },
      _meta: {
        generatedAt: now.toISOString(),
        note: 'Internal ops dashboard. All decisions require formal review records.',
      },
    };
  }
}
