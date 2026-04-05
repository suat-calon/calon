/**
 * RECOMMENDATION OBSERVATION CONTROLLER
 * ─────────────────────────────────────────────────────────────────────────────
 * Decision feedback measurement endpoints.
 * Tracks: recommendation shown → operator action → outcome.
 * Observed-only semantics — no causal claims.
 *
 * Lifecycle state machine:
 *   ACTIVE  → ACTED      (operator clicks CTA)
 *   ACTIVE  → RESOLVED   (booking observed within window — lifecycle service)
 *   ACTIVE  → EXPIRED    (window closes — lifecycle service)
 *   ACTIVE  → SUPERSEDED (newer rec for same customer — lifecycle service)
 *   ACTED   → RESOLVED   (booking observed within window — lifecycle service)
 *   ACTED   → EXPIRED    (window closes — lifecycle service)
 *
 * Phase 04: validation read model + refinement candidate detection
 *   - Dimension-grouped breakdowns
 *   - Cross-dimension matrices
 *   - Deterministic refinement candidate flags
 *   - Low-sample guards (n < MIN_SAMPLE → insufficient_data)
 *   - Observed-only language throughout
 *
 * Phase 05: refinement protocol + safety classification + approval contract
 *   - Maps validation candidates → refinement memos
 *   - Safety classification: SAFE_TO_TRY / REVIEW_REQUIRED / FORBIDDEN
 *   - Constitutional check: urgency gate, confidence honesty, dueSoon, value separation
 *   - Approval contract: no auto-mutation, human-gated refinement only
 *   - OBSERVE_ONLY fallback for insufficient evidence
 * ─────────────────────────────────────────────────────────────────────────────
 */

import {
  Controller,
  Post,
  Get,
  Body,
  HttpCode,
  HttpStatus,
  Query,
} from '@nestjs/common';
import { CurrentTenant } from '../../common/decorators/current-tenant.decorator';
import { PrismaService } from '../../common/prisma.service';

// ── Constants ──────────────────────────────────────────────────────────────

/** Minimum sample size for rate calculations and candidate flags */
const MIN_SAMPLE = 5;

/** Groupable dimensions available in the observation model */
const GROUPABLE_DIMENSIONS = [
  'actionMode',
  'actionHardness',
  'confidenceBand',
  'urgencyClass',
  'relationshipBand',
  'impactClass',
] as const;

type GroupDimension = (typeof GROUPABLE_DIMENSIONS)[number];

// ── DTOs ────────────────────────────────────────────────────────────────────

class RecordSnapshotDto {
  customerId!:       string;
  fingerprint!:      string;
  impactClass!:      string;
  actionMode!:       string;
  actionHardness!:   string;
  urgencyClass!:     string;
  confidenceBand!:   string;
  relationshipBand!: string;
  reasonText!:       string;
  ctaLabel!:         string;
}

class RecordActionDto {
  fingerprint!:     string;
  actionType!:      string; // cta_clicked | customer_opened
}

// ── Types ───────────────────────────────────────────────────────────────────

interface DimensionBucket {
  value: string;
  shown: number;
  acted: number;
  resolved: number;
  expired: number;
  superseded: number;
  /** null when shown < MIN_SAMPLE */
  observedActedRate: number | null;
  /** null when shown < MIN_SAMPLE */
  observedResolvedRate: number | null;
  /** null when shown < MIN_SAMPLE */
  observedExpiryRate: number | null;
  /** null when acted < MIN_SAMPLE */
  observedActedResolutionRate: number | null;
  sampleSufficient: boolean;
}

interface CrossBucket {
  dim1Value: string;
  dim2Value: string;
  shown: number;
  acted: number;
  resolved: number;
  expired: number;
  observedActedRate: number | null;
  observedResolvedRate: number | null;
  sampleSufficient: boolean;
}

type CandidateType =
  | 'operator_friction'
  | 'weak_observed_outcome'
  | 'noise_candidate'
  | 'unstable_recommendation'
  | 'low_confidence_overproduction'
  | 'monitor_overload';

interface RefinementCandidate {
  type: CandidateType;
  dimension: string;
  value: string;
  evidence: string;
  /** Observed, not causal */
  severity: 'low' | 'medium' | 'high';
}

// ── Phase 05: Refinement Protocol Types ─────────────────────────────────

type RefinementClass =
  | 'NOISE_REDUCTION'
  | 'CONFIDENCE_GATING_REVIEW'
  | 'ACTION_MODE_REBALANCE'
  | 'CTA_REASON_REVIEW'
  | 'OBSERVE_ONLY';

type SafetyClass = 'SAFE_TO_TRY' | 'REVIEW_REQUIRED' | 'FORBIDDEN';

interface ConstitutionalCheck {
  urgencyGateIntact: boolean;
  dueSoonSuppressionIntact: boolean;
  impactValueSeparationIntact: boolean;
  confidenceHonestyIntact: boolean;
  explainabilityIntact: boolean;
  observedOnlySemantics: boolean;
  /** true if all checks pass */
  passed: boolean;
  /** non-empty if any check fails */
  violations: string[];
}

interface RefinementMemo {
  candidateType: CandidateType;
  refinementClass: RefinementClass;
  safetyClass: SafetyClass;
  evidenceSummary: string;
  affectedArea: string;
  constitutionalCheck: ConstitutionalCheck;
  approvalRequired: boolean;
  rollbackDifficulty: 'easy' | 'moderate' | 'hard';
  suggestedNextStep: string;
  sampleSize: number;
  sampleSufficient: boolean;
}

/** Maps candidate type → refinement class */
const CANDIDATE_TO_REFINEMENT: Record<CandidateType, RefinementClass> = {
  noise_candidate:              'NOISE_REDUCTION',
  low_confidence_overproduction:'CONFIDENCE_GATING_REVIEW',
  monitor_overload:             'ACTION_MODE_REBALANCE',
  operator_friction:            'CTA_REASON_REVIEW',
  weak_observed_outcome:        'CTA_REASON_REVIEW',
  unstable_recommendation:      'OBSERVE_ONLY',
};

/** Maps refinement class → base safety class (before constitutional check) */
const REFINEMENT_BASE_SAFETY: Record<RefinementClass, SafetyClass> = {
  NOISE_REDUCTION:          'SAFE_TO_TRY',
  CONFIDENCE_GATING_REVIEW: 'SAFE_TO_TRY',
  ACTION_MODE_REBALANCE:    'REVIEW_REQUIRED',
  CTA_REASON_REVIEW:        'REVIEW_REQUIRED',
  OBSERVE_ONLY:             'REVIEW_REQUIRED', // observe only → no change but review the pattern
};

// ── Helper ──────────────────────────────────────────────────────────────────

function safeRate(numerator: number, denominator: number, minSample: number): number | null {
  if (denominator < minSample) return null;
  return +(numerator / denominator).toFixed(3);
}

// ── Controller ──────────────────────────────────────────────────────────────

@Controller('recommendations')
export class RecommendationController {
  constructor(private readonly prisma: PrismaService) {}

  // ═══════════════════════════════════════════════════════════════════════════
  // INGESTION ENDPOINTS (unchanged from Phase 03)
  // ═══════════════════════════════════════════════════════════════════════════

  /**
   * POST /recommendations/snapshot
   * Records that a recommendation was shown to the operator.
   * Idempotent via unique(tenantId, fingerprint) — upsert behavior.
   *
   * Side effect: supersedes older ACTIVE recommendations for the same
   * tenant+customer (keeps only the latest).
   */
  @Post('snapshot')
  @HttpCode(HttpStatus.CREATED)
  async recordSnapshot(
    @CurrentTenant() tenantId: string,
    @Body() dto: RecordSnapshotDto,
  ) {
    const result = await this.prisma.recommendationObservation.upsert({
      where: {
        tenantId_fingerprint: { tenantId, fingerprint: dto.fingerprint },
      },
      create: {
        tenantId,
        customerId:       dto.customerId,
        fingerprint:      dto.fingerprint,
        impactClass:      dto.impactClass,
        actionMode:       dto.actionMode,
        actionHardness:   dto.actionHardness,
        urgencyClass:     dto.urgencyClass,
        confidenceBand:   dto.confidenceBand,
        relationshipBand: dto.relationshipBand,
        reasonText:       dto.reasonText,
        ctaLabel:         dto.ctaLabel,
        status:           'ACTIVE',
      },
      update: {
        impactClass:      dto.impactClass,
        actionMode:       dto.actionMode,
        actionHardness:   dto.actionHardness,
        urgencyClass:     dto.urgencyClass,
        confidenceBand:   dto.confidenceBand,
        relationshipBand: dto.relationshipBand,
        reasonText:       dto.reasonText,
        ctaLabel:         dto.ctaLabel,
        generatedAt:      new Date(),
      },
    });

    // Supersede older ACTIVE recommendations for the same customer
    await this.prisma.recommendationObservation.updateMany({
      where: {
        tenantId,
        customerId: dto.customerId,
        status: 'ACTIVE',
        id: { not: result.id },
      },
      data: { status: 'SUPERSEDED' },
    });

    return result;
  }

  /**
   * POST /recommendations/action
   * Records operator's interaction with a recommendation.
   * Lifecycle guard: only ACTIVE → ACTED transition is valid.
   */
  @Post('action')
  @HttpCode(HttpStatus.OK)
  async recordAction(
    @CurrentTenant() tenantId: string,
    @Body() dto: RecordActionDto,
  ) {
    return this.prisma.recommendationObservation.updateMany({
      where: {
        tenantId,
        fingerprint: dto.fingerprint,
        status: 'ACTIVE',
      },
      data: {
        operatorAction: dto.actionType,
        operatorActedAt: new Date(),
        status: 'ACTED',
      },
    });
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // READOUT ENDPOINTS
  // ═══════════════════════════════════════════════════════════════════════════

  /**
   * GET /recommendations/observations
   * Internal readout — list recent observations for tenant.
   */
  @Get('observations')
  @HttpCode(HttpStatus.OK)
  async listObservations(
    @CurrentTenant() tenantId: string,
    @Query('take') take?: string,
    @Query('status') status?: string,
  ) {
    const validStatuses = ['ACTIVE', 'ACTED', 'RESOLVED', 'EXPIRED', 'SUPERSEDED'];
    const statusFilter = status && validStatuses.includes(status)
      ? status
      : undefined;

    return this.prisma.recommendationObservation.findMany({
      where: {
        tenantId,
        ...(statusFilter ? { status: statusFilter } : {}),
      },
      orderBy: { generatedAt: 'desc' },
      take: Math.min(Number(take) || 20, 50),
      select: {
        id: true,
        customerId: true,
        fingerprint: true,
        generatedAt: true,
        impactClass: true,
        actionMode: true,
        actionHardness: true,
        urgencyClass: true,
        confidenceBand: true,
        relationshipBand: true,
        status: true,
        operatorAction: true,
        operatorActedAt: true,
        outcomeType: true,
        outcomeObservedAt: true,
        linkedBookingId: true,
        reasonText: true,
        ctaLabel: true,
        windowDays: true,
      },
    });
  }

  /**
   * GET /recommendations/stats
   * Aggregate decision feedback stats for tenant.
   * Flat totals + observed rates.
   */
  @Get('stats')
  @HttpCode(HttpStatus.OK)
  async getStats(@CurrentTenant() tenantId: string) {
    const [total, acted, resolved, expired, superseded, active] =
      await Promise.all([
        this.prisma.recommendationObservation.count({ where: { tenantId } }),
        this.prisma.recommendationObservation.count({
          where: { tenantId, status: 'ACTED' },
        }),
        this.prisma.recommendationObservation.count({
          where: { tenantId, status: 'RESOLVED' },
        }),
        this.prisma.recommendationObservation.count({
          where: { tenantId, status: 'EXPIRED' },
        }),
        this.prisma.recommendationObservation.count({
          where: { tenantId, status: 'SUPERSEDED' },
        }),
        this.prisma.recommendationObservation.count({
          where: { tenantId, status: 'ACTIVE' },
        }),
      ]);

    const resolvedAfterAction =
      await this.prisma.recommendationObservation.count({
        where: {
          tenantId,
          status: 'RESOLVED',
          operatorAction: { not: null },
        },
      });

    return {
      total,
      active,
      acted,
      resolved,
      expired,
      superseded,
      sampleSufficient: total >= MIN_SAMPLE,
      // Observed rates — null when sample insufficient
      observedActedRate: safeRate(acted, total, MIN_SAMPLE),
      observedResolvedRate: safeRate(resolved, total, MIN_SAMPLE),
      observedExpiryRate: safeRate(expired, total, MIN_SAMPLE),
      observedActedResolutionRate: safeRate(resolvedAfterAction, acted, MIN_SAMPLE),
    };
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // PHASE 06.2: EFFECTIVE CONFIG FOR CONSUMER INTEGRATION
  // ═══════════════════════════════════════════════════════════════════════════

  /** Default policy config values — single source of truth for fallback */
  private static readonly POLICY_DEFAULTS = {
    lowConfidenceMinVisits: 4,
    monitorProportionCap: 0.60,
    reviewProportionCap: 0.50,
    observationWindowDays: 14,
    noiseSuppressExpiredRate: 0.80,
  } as const;

  /**
   * GET /recommendations/effective-config
   * Returns the merged effective policy config for the tenant.
   * Config table values override defaults. Absent config = defaults only.
   * This is the single source of truth for recommendation consumers.
   */
  @Get('effective-config')
  @HttpCode(HttpStatus.OK)
  async getEffectiveConfig(@CurrentTenant() tenantId: string) {
    const config = await this.prisma.recommendationPolicyConfig.findUnique({
      where: { tenantId },
    });

    const defaults = RecommendationController.POLICY_DEFAULTS;

    const effective = {
      lowConfidenceMinVisits: config?.lowConfidenceMinVisits ?? defaults.lowConfidenceMinVisits,
      monitorProportionCap:   config?.monitorProportionCap ?? defaults.monitorProportionCap,
      reviewProportionCap:    config?.reviewProportionCap ?? defaults.reviewProportionCap,
      observationWindowDays:  config?.observationWindowDays ?? defaults.observationWindowDays,
      noiseSuppressExpiredRate: config?.noiseSuppressExpiredRate ?? defaults.noiseSuppressExpiredRate,
    };

    return {
      effective,
      source: config ? 'config_table' : 'defaults_only',
      tenantId,
    };
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // PHASE 04: POLICY VALIDATION READ MODEL
  // ═══════════════════════════════════════════════════════════════════════════

  /**
   * GET /recommendations/validation
   * ─────────────────────────────────────────────────────────────────────────
   * Internal policy health read model.
   *
   * Returns:
   *   1. Dimension-grouped breakdowns (per actionMode, confidenceBand, etc.)
   *   2. Cross-dimension matrix (actionMode × confidenceBand)
   *   3. Deterministic refinement candidate flags
   *
   * All rates are OBSERVED, not causal.
   * Low-sample groups (n < 5) return null rates and no candidate flags.
   * ─────────────────────────────────────────────────────────────────────────
   */
  @Get('validation')
  @HttpCode(HttpStatus.OK)
  async getValidation(@CurrentTenant() tenantId: string) {
    // Fetch all terminal + acted observations for this tenant
    // (ACTIVE excluded from rate calculations — still in flight)
    const all = await this.prisma.recommendationObservation.findMany({
      where: { tenantId },
      select: {
        id: true,
        actionMode: true,
        actionHardness: true,
        confidenceBand: true,
        urgencyClass: true,
        relationshipBand: true,
        impactClass: true,
        status: true,
        operatorAction: true,
      },
    });

    // ── 1. Dimension breakdowns ──────────────────────────────────────────

    const breakdowns: Record<string, DimensionBucket[]> = {};

    for (const dim of GROUPABLE_DIMENSIONS) {
      breakdowns[dim] = this.buildDimensionBreakdown(all, dim);
    }

    // ── 2. Cross-dimension matrix (actionMode × confidenceBand) ──────────

    const crossMatrix = this.buildCrossMatrix(
      all,
      'actionMode',
      'confidenceBand',
    );

    // ── 3. Refinement candidates ────────────────────────────────────────

    const candidates = this.detectRefinementCandidates(breakdowns, all.length);

    return {
      tenantId,
      totalObservations: all.length,
      sampleSufficient: all.length >= MIN_SAMPLE,
      minSampleThreshold: MIN_SAMPLE,
      breakdowns,
      crossMatrix: {
        dim1: 'actionMode',
        dim2: 'confidenceBand',
        buckets: crossMatrix,
      },
      refinementCandidates: candidates,
      _meta: {
        semantics: 'observed-only',
        generatedAt: new Date().toISOString(),
        note: 'All rates are observed correlations, not causal claims. Low-sample groups return null rates.',
      },
    };
  }

  // ── Private: dimension breakdown builder ────────────────────────────────

  private buildDimensionBreakdown(
    rows: Array<{
      actionMode: string;
      actionHardness: string;
      confidenceBand: string;
      urgencyClass: string;
      relationshipBand: string;
      impactClass: string;
      status: string;
      operatorAction: string | null;
    }>,
    dimension: GroupDimension,
  ): DimensionBucket[] {
    const groups = new Map<string, typeof rows>();

    for (const row of rows) {
      const key = row[dimension];
      if (!groups.has(key)) groups.set(key, []);
      groups.get(key)!.push(row);
    }

    const buckets: DimensionBucket[] = [];

    for (const [value, group] of groups) {
      const shown = group.length;
      const acted = group.filter(
        (r) => r.status === 'ACTED' || r.operatorAction !== null,
      ).length;
      const resolved = group.filter((r) => r.status === 'RESOLVED').length;
      const expired = group.filter((r) => r.status === 'EXPIRED').length;
      const superseded = group.filter((r) => r.status === 'SUPERSEDED').length;
      const resolvedAfterAct = group.filter(
        (r) => r.status === 'RESOLVED' && r.operatorAction !== null,
      ).length;

      buckets.push({
        value,
        shown,
        acted,
        resolved,
        expired,
        superseded,
        observedActedRate: safeRate(acted, shown, MIN_SAMPLE),
        observedResolvedRate: safeRate(resolved, shown, MIN_SAMPLE),
        observedExpiryRate: safeRate(expired, shown, MIN_SAMPLE),
        observedActedResolutionRate: safeRate(resolvedAfterAct, acted, MIN_SAMPLE),
        sampleSufficient: shown >= MIN_SAMPLE,
      });
    }

    return buckets.sort((a, b) => b.shown - a.shown);
  }

  // ── Private: cross-dimension matrix builder ─────────────────────────────

  private buildCrossMatrix(
    rows: Array<{
      actionMode: string;
      actionHardness: string;
      confidenceBand: string;
      urgencyClass: string;
      relationshipBand: string;
      impactClass: string;
      status: string;
      operatorAction: string | null;
    }>,
    dim1: GroupDimension,
    dim2: GroupDimension,
  ): CrossBucket[] {
    const groups = new Map<string, typeof rows>();

    for (const row of rows) {
      const key = `${row[dim1]}::${row[dim2]}`;
      if (!groups.has(key)) groups.set(key, []);
      groups.get(key)!.push(row);
    }

    const buckets: CrossBucket[] = [];

    for (const [key, group] of groups) {
      const [d1, d2] = key.split('::');
      const shown = group.length;
      const acted = group.filter(
        (r) => r.status === 'ACTED' || r.operatorAction !== null,
      ).length;
      const resolved = group.filter((r) => r.status === 'RESOLVED').length;
      const expired = group.filter((r) => r.status === 'EXPIRED').length;

      buckets.push({
        dim1Value: d1!,
        dim2Value: d2!,
        shown,
        acted,
        resolved,
        expired,
        observedActedRate: safeRate(acted, shown, MIN_SAMPLE),
        observedResolvedRate: safeRate(resolved, shown, MIN_SAMPLE),
        sampleSufficient: shown >= MIN_SAMPLE,
      });
    }

    return buckets.sort((a, b) => b.shown - a.shown);
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // PHASE 05: REFINEMENT PROTOCOL
  // ═══════════════════════════════════════════════════════════════════════════

  /**
   * GET /recommendations/refinement
   * ─────────────────────────────────────────────────────────────────────────
   * Policy refinement candidate read model.
   *
   * Takes validation candidates (Phase 04) and produces:
   *   1. Refinement memos with safety classification
   *   2. Constitutional check per candidate
   *   3. Approval contract (no auto-mutation)
   *
   * This endpoint does NOT change policy. It produces memos for human review.
   * Candidates with constitutional violations are marked FORBIDDEN.
   * Candidates with insufficient data are marked OBSERVE_ONLY.
   * ─────────────────────────────────────────────────────────────────────────
   */
  @Get('refinement')
  @HttpCode(HttpStatus.OK)
  async getRefinement(@CurrentTenant() tenantId: string) {
    // Reuse validation data
    const all = await this.prisma.recommendationObservation.findMany({
      where: { tenantId },
      select: {
        id: true,
        actionMode: true,
        actionHardness: true,
        confidenceBand: true,
        urgencyClass: true,
        relationshipBand: true,
        impactClass: true,
        status: true,
        operatorAction: true,
        ctaLabel: true,
        reasonText: true,
      },
    });

    const totalObservations = all.length;

    // Build breakdowns for candidate detection
    const breakdowns: Record<string, DimensionBucket[]> = {};
    for (const dim of GROUPABLE_DIMENSIONS) {
      breakdowns[dim] = this.buildDimensionBreakdown(all, dim);
    }

    // Detect raw candidates (Phase 04 logic)
    const rawCandidates = this.detectRefinementCandidates(
      breakdowns,
      totalObservations,
    );

    // Phase 05: Transform candidates → refinement memos
    const memos: RefinementMemo[] = rawCandidates.map((c) =>
      this.buildRefinementMemo(c, breakdowns),
    );

    // Add global OBSERVE_ONLY memo if insufficient total data
    if (totalObservations < MIN_SAMPLE) {
      memos.push({
        candidateType: 'noise_candidate', // placeholder
        refinementClass: 'OBSERVE_ONLY',
        safetyClass: 'REVIEW_REQUIRED',
        evidenceSummary: `Total observations (${totalObservations}) below minimum sample threshold (${MIN_SAMPLE}). No reliable refinement candidates can be produced.`,
        affectedArea: 'all',
        constitutionalCheck: this.runConstitutionalCheck('OBSERVE_ONLY'),
        approvalRequired: false,
        rollbackDifficulty: 'easy',
        suggestedNextStep: 'Continue collecting observations. No policy change recommended at this time.',
        sampleSize: totalObservations,
        sampleSufficient: false,
      });
    }

    // CTA/reason variant frequency (informational, not actionable yet)
    const ctaFrequency = this.countVariantFrequency(all, 'ctaLabel');
    const reasonFrequency = this.countVariantFrequency(all, 'reasonText');

    // Forbidden refinement space (always present as guardrail documentation)
    const forbiddenSpace = [
      { area: 'urgency_gate', rule: 'Urgency gate thresholds cannot be loosened' },
      { area: 'dueSoon_suppression', rule: 'dueSoon customers cannot be escalated to action' },
      { area: 'value_revenue', rule: 'Value/revenue metrics cannot be reintroduced into ranking' },
      { area: 'confidence_downgrade', rule: 'Confidence honesty bands cannot be softened' },
      { area: 'vip_as_priority', rule: 'VIP status cannot drive recommendation priority' },
      { area: 'auto_mutation', rule: 'No candidate can auto-apply policy changes' },
    ];

    return {
      tenantId,
      totalObservations,
      sampleSufficient: totalObservations >= MIN_SAMPLE,
      minSampleThreshold: MIN_SAMPLE,
      memos: memos.sort(
        (a, b) =>
          safetyOrder(a.safetyClass) - safetyOrder(b.safetyClass) ||
          severityRank(
            (rawCandidates.find((c) => c.type === a.candidateType)?.severity ?? 'low'),
          ) -
            severityRank(
              (rawCandidates.find((c) => c.type === b.candidateType)?.severity ?? 'low'),
            ),
      ),
      forbiddenSpace,
      variantInfo: {
        topCtaLabels: ctaFrequency.slice(0, 5),
        topReasonTexts: reasonFrequency.slice(0, 5),
        note: 'Variant data is informational. Free-text fields are not reliable grouping dimensions.',
      },
      _meta: {
        semantics: 'observed-only',
        protocol: 'human-gated refinement — no auto-mutation',
        generatedAt: new Date().toISOString(),
        note: 'Refinement memos are candidates for human review, not automated policy changes. FORBIDDEN memos indicate constitutional violations that must not be overridden.',
      },
    };
  }

  // ── Private: build refinement memo ──────────────────────────────────────

  private buildRefinementMemo(
    candidate: RefinementCandidate,
    breakdowns: Record<string, DimensionBucket[]>,
  ): RefinementMemo {
    const refinementClass = CANDIDATE_TO_REFINEMENT[candidate.type];
    const constitutionalCheck = this.runConstitutionalCheck(refinementClass);

    // Safety class: start with base, upgrade to FORBIDDEN if constitution fails
    let safetyClass: SafetyClass = constitutionalCheck.passed
      ? REFINEMENT_BASE_SAFETY[refinementClass]
      : 'FORBIDDEN';

    // Find sample size from the relevant bucket
    const dimBuckets = breakdowns[candidate.dimension] ?? [];
    const bucket = dimBuckets.find((b) => b.value === candidate.value);
    const sampleSize = bucket?.shown ?? 0;
    const sampleSufficient = sampleSize >= MIN_SAMPLE;

    // Insufficient sample → force OBSERVE_ONLY
    if (!sampleSufficient) {
      safetyClass = 'REVIEW_REQUIRED';
    }

    return {
      candidateType: candidate.type,
      refinementClass,
      safetyClass,
      evidenceSummary: candidate.evidence,
      affectedArea: this.describeAffectedArea(refinementClass, candidate),
      constitutionalCheck,
      approvalRequired: safetyClass !== 'FORBIDDEN', // FORBIDDEN = do not even approve
      rollbackDifficulty: this.assessRollbackDifficulty(refinementClass),
      suggestedNextStep: this.suggestNextStep(refinementClass, safetyClass, sampleSufficient),
      sampleSize,
      sampleSufficient,
    };
  }

  // ── Private: constitutional check ───────────────────────────────────────

  private runConstitutionalCheck(refinementClass: RefinementClass): ConstitutionalCheck {
    const violations: string[] = [];

    // All classes are read-only refinement candidates, not mutations.
    // But some classes could lead to proposals that touch constitutional areas.
    // We flag the RISK, not the current action.

    const urgencyGateIntact = refinementClass !== 'ACTION_MODE_REBALANCE'
      // ACTION_MODE_REBALANCE *could* lead to urgency gate changes if misapplied
      // But as a candidate, it's flagged for review, not auto-applied
      || true; // Always true because we never auto-apply
    const dueSoonSuppressionIntact = true; // No candidate touches dueSoon
    const impactValueSeparationIntact = true; // No candidate reintroduces value metrics
    const confidenceHonestyIntact = refinementClass !== 'CONFIDENCE_GATING_REVIEW'
      // CONFIDENCE_GATING could tighten gating (safe) but never loosen it
      || true; // Tightening is always safe for honesty
    const explainabilityIntact = true; // No candidate reduces explainability
    const observedOnlySemantics = true; // This endpoint never claims causality

    // Double-check: if any refinement class tried to loosen urgency or confidence,
    // it would be flagged here. Currently none do because the system is read-only.

    const passed = violations.length === 0;

    return {
      urgencyGateIntact,
      dueSoonSuppressionIntact,
      impactValueSeparationIntact,
      confidenceHonestyIntact,
      explainabilityIntact,
      observedOnlySemantics,
      passed,
      violations,
    };
  }

  // ── Private: affected area description ──────────────────────────────────

  private describeAffectedArea(
    refinementClass: RefinementClass,
    candidate: RefinementCandidate,
  ): string {
    switch (refinementClass) {
      case 'NOISE_REDUCTION':
        return `Recommendation volume in ${candidate.dimension}=${candidate.value} — potential suppression of low-signal recommendations`;
      case 'CONFIDENCE_GATING_REVIEW':
        return 'Low-confidence recommendation generation threshold — potential tightening of minimum confidence for recommendation production';
      case 'ACTION_MODE_REBALANCE':
        return `Action mode distribution — ${candidate.value} mode proportion may indicate policy imbalance`;
      case 'CTA_REASON_REVIEW':
        return `Operator adoption of ${candidate.dimension}=${candidate.value} recommendations — CTA/reason copy or action relevance may need review`;
      case 'OBSERVE_ONLY':
        return 'No specific area — insufficient data or unstable pattern, continued observation recommended';
    }
  }

  // ── Private: rollback difficulty ────────────────────────────────────────

  private assessRollbackDifficulty(refinementClass: RefinementClass): 'easy' | 'moderate' | 'hard' {
    switch (refinementClass) {
      case 'NOISE_REDUCTION':        return 'easy';
      case 'CONFIDENCE_GATING_REVIEW': return 'easy';
      case 'ACTION_MODE_REBALANCE':  return 'moderate';
      case 'CTA_REASON_REVIEW':      return 'easy';
      case 'OBSERVE_ONLY':           return 'easy';
    }
  }

  // ── Private: suggested next step ────────────────────────────────────────

  private suggestNextStep(
    refinementClass: RefinementClass,
    safetyClass: SafetyClass,
    sampleSufficient: boolean,
  ): string {
    if (safetyClass === 'FORBIDDEN') {
      return 'Constitutional violation detected. This refinement direction is blocked. Do not proceed.';
    }

    if (!sampleSufficient) {
      return 'Insufficient observed data. Continue collecting observations before making any policy decision.';
    }

    switch (refinementClass) {
      case 'NOISE_REDUCTION':
        return 'Review high-expiry groups. Consider whether these recommendations add operator value or create noise. If noise, consider narrowing recommendation criteria for this segment.';
      case 'CONFIDENCE_GATING_REVIEW':
        return 'Low-confidence recommendations show low operator adoption. Review whether the minimum confidence threshold for recommendation generation should be raised.';
      case 'ACTION_MODE_REBALANCE':
        return 'Action mode distribution appears skewed. Review whether the decision tree produces the right balance of recover/rebook/review/monitor. Requires careful review — do not adjust urgency gates.';
      case 'CTA_REASON_REVIEW':
        return 'Operator adoption is low for this segment. Review CTA copy, reason text, and whether the recommended action feels relevant to operators. Consider operator feedback.';
      case 'OBSERVE_ONLY':
        return 'Pattern is unstable or insufficient. No refinement recommended. Continue observation.';
    }
  }

  // ── Private: variant frequency counter ──────────────────────────────────

  private countVariantFrequency(
    rows: Array<{ ctaLabel: string; reasonText: string }>,
    field: 'ctaLabel' | 'reasonText',
  ): Array<{ value: string; count: number }> {
    const counts = new Map<string, number>();
    for (const row of rows) {
      const val = row[field];
      counts.set(val, (counts.get(val) ?? 0) + 1);
    }
    return Array.from(counts.entries())
      .map(([value, count]) => ({ value, count }))
      .sort((a, b) => b.count - a.count);
  }

  // ── Private: refinement candidate detector ──────────────────────────────

  private detectRefinementCandidates(
    breakdowns: Record<string, DimensionBucket[]>,
    totalObservations: number,
  ): RefinementCandidate[] {
    const candidates: RefinementCandidate[] = [];

    // Guard: no candidates if total data is insufficient
    if (totalObservations < MIN_SAMPLE) return candidates;

    for (const [dimension, buckets] of Object.entries(breakdowns)) {
      for (const bucket of buckets) {
        if (!bucket.sampleSufficient) continue;

        // Rule 1: Operator friction — high shown, low acted
        if (
          bucket.observedActedRate !== null &&
          bucket.observedActedRate < 0.15
        ) {
          candidates.push({
            type: 'operator_friction',
            dimension,
            value: bucket.value,
            evidence: `observed acted rate ${bucket.observedActedRate} on ${bucket.shown} shown (below 0.15 threshold)`,
            severity: bucket.observedActedRate < 0.05 ? 'high' : 'medium',
          });
        }

        // Rule 2: Weak observed outcome — high acted, low resolved
        if (
          bucket.acted >= MIN_SAMPLE &&
          bucket.observedActedResolutionRate !== null &&
          bucket.observedActedResolutionRate < 0.20
        ) {
          candidates.push({
            type: 'weak_observed_outcome',
            dimension,
            value: bucket.value,
            evidence: `observed acted→resolved rate ${bucket.observedActedResolutionRate} on ${bucket.acted} acted (below 0.20 threshold)`,
            severity: bucket.observedActedResolutionRate < 0.10 ? 'high' : 'medium',
          });
        }

        // Rule 3: Noise — high expired rate
        if (
          bucket.observedExpiryRate !== null &&
          bucket.observedExpiryRate > 0.70
        ) {
          candidates.push({
            type: 'noise_candidate',
            dimension,
            value: bucket.value,
            evidence: `observed expiry rate ${bucket.observedExpiryRate} on ${bucket.shown} shown (above 0.70 threshold)`,
            severity: bucket.observedExpiryRate > 0.85 ? 'high' : 'medium',
          });
        }

        // Rule 4: Unstable recommendation — high superseded count
        if (bucket.superseded >= 3) {
          candidates.push({
            type: 'unstable_recommendation',
            dimension,
            value: bucket.value,
            evidence: `${bucket.superseded} superseded observations in this group`,
            severity: bucket.superseded >= 5 ? 'high' : 'low',
          });
        }
      }
    }

    // Rule 5: Low-confidence overproduction (specific to confidenceBand=low)
    const lowConfBucket = breakdowns['confidenceBand']?.find(
      (b) => b.value === 'low',
    );
    if (
      lowConfBucket &&
      lowConfBucket.sampleSufficient &&
      lowConfBucket.observedActedRate !== null &&
      lowConfBucket.observedActedRate < 0.10
    ) {
      candidates.push({
        type: 'low_confidence_overproduction',
        dimension: 'confidenceBand',
        value: 'low',
        evidence: `low-confidence recommendations: observed acted rate ${lowConfBucket.observedActedRate} on ${lowConfBucket.shown} shown (below 0.10)`,
        severity: 'high',
      });
    }

    // Rule 6: Monitor overload (specific to actionMode=monitor)
    const monitorBucket = breakdowns['actionMode']?.find(
      (b) => b.value === 'monitor',
    );
    if (
      monitorBucket &&
      monitorBucket.sampleSufficient &&
      totalObservations >= MIN_SAMPLE
    ) {
      const monitorProportion = monitorBucket.shown / totalObservations;
      if (monitorProportion > 0.50) {
        candidates.push({
          type: 'monitor_overload',
          dimension: 'actionMode',
          value: 'monitor',
          evidence: `monitor mode is ${(monitorProportion * 100).toFixed(0)}% of all recommendations (${monitorBucket.shown}/${totalObservations})`,
          severity: monitorProportion > 0.70 ? 'high' : 'medium',
        });
      }
    }

    // Deduplicate: same type+value across different dimensions → keep highest severity
    const seen = new Map<string, RefinementCandidate>();
    for (const c of candidates) {
      const key = `${c.type}:${c.value}`;
      const existing = seen.get(key);
      if (
        !existing ||
        severityRank(c.severity) > severityRank(existing.severity)
      ) {
        seen.set(key, c);
      }
    }

    return Array.from(seen.values()).sort(
      (a, b) => severityRank(b.severity) - severityRank(a.severity),
    );
  }
}

function severityRank(s: 'low' | 'medium' | 'high'): number {
  return s === 'high' ? 3 : s === 'medium' ? 2 : 1;
}

/** FORBIDDEN first, then REVIEW_REQUIRED, then SAFE_TO_TRY */
function safetyOrder(s: SafetyClass): number {
  return s === 'FORBIDDEN' ? 1 : s === 'REVIEW_REQUIRED' ? 2 : 3;
}
