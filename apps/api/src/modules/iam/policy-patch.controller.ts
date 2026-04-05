/**
 * POLICY PATCH CONTROLLER — Phase 06.1: Live Execution
 * ─────────────────────────────────────────────────────────────────────────────
 * Patch-based, constitution-gated, audit-trailed policy refinement.
 * Apply now performs REAL live config mutation on RecommendationPolicyConfig.
 * Rollback now performs REAL state restore.
 *
 * Status machine:
 *   DRAFT → APPROVED → APPLIED → ROLLED_BACK
 *   DRAFT → REJECTED
 *   DRAFT → CONSTITUTION_FAILED
 *
 * Live mutation surface (ALLOWED_PATCH_TARGETS):
 *   - lowConfidenceMinVisits
 *   - monitorProportionCap
 *   - reviewProportionCap
 *   - observationWindowDays
 *   - noiseSuppressExpiredRate
 *
 * Frozen surface (FORBIDDEN_PATCH_TARGETS — constitution blocks):
 *   - criticalRatio, criticalOverdueDays, overdueRatio, overdueOverdueDays
 *   - dormantDays, confidenceVarianceThreshold, strongRelationshipMinVisits
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

// ── Typed Patch Target System ──────────────────────────────────────────────

/** Fields on RecommendationPolicyConfig that patches CAN modify */
const ALLOWED_PATCH_TARGETS = [
  'lowConfidenceMinVisits',
  'monitorProportionCap',
  'reviewProportionCap',
  'observationWindowDays',
  'noiseSuppressExpiredRate',
] as const;

type AllowedTarget = (typeof ALLOWED_PATCH_TARGETS)[number];

/** Fields that are constitutionally FROZEN — patches CANNOT touch these */
const FROZEN_TARGETS = [
  'criticalRatio',
  'criticalOverdueDays',
  'overdueRatio',
  'overdueOverdueDays',
  'dormantDays',
  'confidenceVarianceThreshold',
  'strongRelationshipMinVisits',
] as const;

const VALID_PATCH_TYPES = [
  'POLICY_FILTER',
  'ACTION_BALANCE',
  'MESSAGING',
  'VALIDATION_CONFIG',
  'NOOP',
] as const;

/** Which patch types can target which config fields */
const PATCH_TYPE_TARGETS: Record<string, readonly AllowedTarget[]> = {
  POLICY_FILTER:     ['lowConfidenceMinVisits', 'noiseSuppressExpiredRate'],
  ACTION_BALANCE:    ['monitorProportionCap', 'reviewProportionCap'],
  VALIDATION_CONFIG: ['observationWindowDays'],
  MESSAGING:         [], // Messaging patches don't touch config fields
  NOOP:              [],
};

// ── Types ───────────────────────────────────────────────────────────────────

interface ProposedChange {
  target: string;
  newValue: number;
  description: string;
}

interface ConstitutionGateResult {
  verdict: 'PASS' | 'FAIL' | 'NEEDS_REVIEW';
  checks: {
    targetIsAllowed: boolean;
    targetNotFrozen: boolean;
    patchTypeMatchesTarget: boolean;
    safetyClassNotForbidden: boolean;
    rollbackStrategyPresent: boolean;
    valueWithinBounds: boolean;
  };
  violations: string[];
}

/** Safe bounds for patchable fields — prevents extreme values */
const VALUE_BOUNDS: Record<AllowedTarget, { min: number; max: number }> = {
  lowConfidenceMinVisits:   { min: 2, max: 10 },
  monitorProportionCap:     { min: 0.10, max: 0.80 },
  reviewProportionCap:      { min: 0.10, max: 0.80 },
  observationWindowDays:    { min: 7, max: 30 },
  noiseSuppressExpiredRate: { min: 0.50, max: 0.95 },
};

// ── DTOs ────────────────────────────────────────────────────────────────────

class CreatePatchDto {
  patchType!: string;
  sourceCandidateType!: string;
  safetyClass!: string;
  proposedChange!: ProposedChange;
  evidenceSummary!: string;
  rollbackStrategy!: string;
  notes?: string;
}

class ActorDto {
  actor!: string;
  notes?: string;
}

class ApplyPatchDto {
  actor!: string;
  notes?: string;
}

// ── Controller ──────────────────────────────────────────────────────────────

@Controller('policy-patches')
export class PolicyPatchController {
  constructor(private readonly prisma: PrismaService) {}

  // ═══════════════════════════════════════════════════════════════════════════
  // PATCH LIFECYCLE
  // ═══════════════════════════════════════════════════════════════════════════

  /**
   * POST /policy-patches
   * Create a patch draft. Constitution gate runs automatically.
   */
  @Post()
  @HttpCode(HttpStatus.CREATED)
  async createPatch(
    @CurrentTenant() tenantId: string,
    @Body() dto: CreatePatchDto,
  ) {
    if (!VALID_PATCH_TYPES.includes(dto.patchType as (typeof VALID_PATCH_TYPES)[number])) {
      throw new BadRequestException(`Invalid patchType. Must be: ${VALID_PATCH_TYPES.join(', ')}`);
    }

    if (!dto.rollbackStrategy?.trim()) {
      throw new BadRequestException('rollbackStrategy is required.');
    }

    const constitution = this.runConstitutionGate(dto.patchType, dto.proposedChange, dto.safetyClass, dto.rollbackStrategy);

    const status = constitution.verdict === 'FAIL' || dto.safetyClass === 'FORBIDDEN'
      ? 'CONSTITUTION_FAILED'
      : 'DRAFT';

    return this.prisma.policyPatch.create({
      data: {
        tenantId,
        patchType: dto.patchType,
        sourceCandidateType: dto.sourceCandidateType,
        status,
        safetyClass: dto.safetyClass,
        affectedArea: dto.proposedChange.target,
        proposedChange: dto.proposedChange as unknown as Prisma.InputJsonValue,
        evidenceSummary: dto.evidenceSummary,
        constitutionVerdict: constitution.verdict,
        constitutionDetails: constitution as unknown as Prisma.InputJsonValue,
        rollbackStrategy: dto.rollbackStrategy,
        notes: dto.notes ?? null,
      },
    });
  }

  /**
   * POST /policy-patches/:id/approve
   * Approve a DRAFT patch. Does NOT apply it.
   */
  @Post(':id/approve')
  @HttpCode(HttpStatus.OK)
  async approvePatch(
    @CurrentTenant() tenantId: string,
    @Param('id') id: string,
    @Body() dto: ActorDto,
  ) {
    const patch = await this.findPatchOrFail(tenantId, id);

    if (patch.status !== 'DRAFT') {
      throw new BadRequestException(`Cannot approve: status is '${patch.status}', expected 'DRAFT'.`);
    }
    if (patch.constitutionVerdict === 'FAIL') {
      throw new BadRequestException('Cannot approve: constitution gate failed.');
    }

    return this.prisma.policyPatch.update({
      where: { id },
      data: {
        status: 'APPROVED',
        approvedBy: dto.actor,
        approvedAt: new Date(),
        notes: appendNote(patch.notes, 'APPROVE', dto.notes),
      },
    });
  }

  /**
   * POST /policy-patches/:id/apply
   * Apply an APPROVED patch — REAL live config mutation.
   *
   * Flow:
   *   1. Re-check constitution gate (defense in depth)
   *   2. Ensure/create tenant config (upsert with defaults)
   *   3. Read current value (previousState)
   *   4. Validate target is in ALLOWED set
   *   5. Write new value to live config
   *   6. Save previousState on patch
   *   7. Update patch status → APPLIED with audit
   */
  @Post(':id/apply')
  @HttpCode(HttpStatus.OK)
  async applyPatch(
    @CurrentTenant() tenantId: string,
    @Param('id') id: string,
    @Body() dto: ApplyPatchDto,
  ) {
    const patch = await this.findPatchOrFail(tenantId, id);

    if (patch.status !== 'APPROVED') {
      throw new BadRequestException(`Cannot apply: status is '${patch.status}', expected 'APPROVED'.`);
    }

    const proposed = patch.proposedChange as unknown as ProposedChange;

    // Re-check constitution (defense in depth)
    const recheck = this.runConstitutionGate(
      patch.patchType, proposed, patch.safetyClass, patch.rollbackStrategy,
    );

    if (recheck.verdict === 'FAIL') {
      await this.prisma.policyPatch.update({
        where: { id },
        data: {
          status: 'CONSTITUTION_FAILED',
          constitutionVerdict: 'FAIL',
          constitutionDetails: recheck as unknown as Prisma.InputJsonValue,
          notes: appendNote(patch.notes, 'APPLY_BLOCKED', 'Constitution re-check failed at apply time.'),
        },
      });
      throw new BadRequestException('Apply blocked: constitution re-check failed.');
    }

    // Validate target is allowed
    const target = proposed.target as AllowedTarget;
    if (!ALLOWED_PATCH_TARGETS.includes(target)) {
      throw new BadRequestException(`Target '${proposed.target}' is not in the allowed patch surface.`);
    }

    // Ensure config exists (upsert with all defaults)
    const config = await this.prisma.recommendationPolicyConfig.upsert({
      where: { tenantId },
      create: { tenantId },
      update: {},
    });

    // Read current value
    const currentValue = (config as Record<string, unknown>)[target];

    // Apply mutation — atomic update of single field
    const updateData: Record<string, number> = {};
    updateData[target] = proposed.newValue;

    await this.prisma.recommendationPolicyConfig.update({
      where: { tenantId },
      data: updateData,
    });

    // Save previousState and mark APPLIED
    const previousState = {
      target,
      previousValue: currentValue,
      newValue: proposed.newValue,
      appliedAt: new Date().toISOString(),
    };

    return this.prisma.policyPatch.update({
      where: { id },
      data: {
        status: 'APPLIED',
        appliedBy: dto.actor,
        appliedAt: new Date(),
        previousState: previousState as unknown as Prisma.InputJsonValue,
        notes: appendNote(
          patch.notes,
          'APPLY',
          `${target}: ${currentValue} → ${proposed.newValue}. ${dto.notes ?? ''}`,
        ),
      },
    });
  }

  /**
   * POST /policy-patches/:id/rollback
   * Rollback an APPLIED patch — REAL state restore.
   *
   * Reads previousState from patch, restores config field to previous value.
   */
  @Post(':id/rollback')
  @HttpCode(HttpStatus.OK)
  async rollbackPatch(
    @CurrentTenant() tenantId: string,
    @Param('id') id: string,
    @Body() dto: ActorDto,
  ) {
    const patch = await this.findPatchOrFail(tenantId, id);

    if (patch.status !== 'APPLIED') {
      throw new BadRequestException(`Cannot rollback: status is '${patch.status}', expected 'APPLIED'.`);
    }

    const prev = patch.previousState as { target: string; previousValue: number } | null;
    if (!prev?.target || prev.previousValue === undefined) {
      throw new BadRequestException('Cannot rollback: no previousState recorded.');
    }

    // Validate target is still in allowed set
    if (!ALLOWED_PATCH_TARGETS.includes(prev.target as AllowedTarget)) {
      throw new BadRequestException(`Cannot rollback: target '${prev.target}' is not in allowed surface.`);
    }

    // Restore previous value
    const restoreData: Record<string, number> = {};
    restoreData[prev.target] = prev.previousValue;

    await this.prisma.recommendationPolicyConfig.update({
      where: { tenantId },
      data: restoreData,
    });

    return this.prisma.policyPatch.update({
      where: { id },
      data: {
        status: 'ROLLED_BACK',
        rolledBackBy: dto.actor,
        rolledBackAt: new Date(),
        notes: appendNote(
          patch.notes,
          'ROLLBACK',
          `${prev.target}: restored to ${prev.previousValue}. ${dto.notes ?? ''}`,
        ),
      },
    });
  }

  /**
   * POST /policy-patches/:id/reject
   * Reject a DRAFT patch.
   */
  @Post(':id/reject')
  @HttpCode(HttpStatus.OK)
  async rejectPatch(
    @CurrentTenant() tenantId: string,
    @Param('id') id: string,
    @Body() dto: ActorDto,
  ) {
    const patch = await this.findPatchOrFail(tenantId, id);
    if (patch.status !== 'DRAFT') {
      throw new BadRequestException(`Cannot reject: status is '${patch.status}', expected 'DRAFT'.`);
    }

    return this.prisma.policyPatch.update({
      where: { id },
      data: {
        status: 'REJECTED',
        rejectedBy: dto.actor,
        rejectedAt: new Date(),
        notes: appendNote(patch.notes, 'REJECT', dto.notes),
      },
    });
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // READOUT
  // ═══════════════════════════════════════════════════════════════════════════

  /** GET /policy-patches — list patches */
  @Get()
  @HttpCode(HttpStatus.OK)
  async listPatches(
    @CurrentTenant() tenantId: string,
    @Query('status') status?: string,
    @Query('take') take?: string,
  ) {
    const validStatuses = ['DRAFT', 'APPROVED', 'CONSTITUTION_FAILED', 'APPLIED', 'ROLLED_BACK', 'REJECTED'];
    const filter = status && validStatuses.includes(status) ? status : undefined;

    return this.prisma.policyPatch.findMany({
      where: { tenantId, ...(filter ? { status: filter } : {}) },
      orderBy: { createdAt: 'desc' },
      take: Math.min(Number(take) || 20, 50),
    });
  }

  /** GET /policy-patches/config — current live config for tenant */
  @Get('config')
  @HttpCode(HttpStatus.OK)
  async getConfig(@CurrentTenant() tenantId: string) {
    const config = await this.prisma.recommendationPolicyConfig.findUnique({
      where: { tenantId },
    });

    return {
      config: config ?? 'NOT_INITIALIZED',
      allowedTargets: [...ALLOWED_PATCH_TARGETS],
      frozenTargets: [...FROZEN_TARGETS],
      valueBounds: VALUE_BOUNDS,
      _meta: {
        note: 'Frozen targets cannot be modified by patches. Allowed targets respect VALUE_BOUNDS.',
      },
    };
  }

  /** GET /policy-patches/:id — single patch detail */
  @Get(':id')
  @HttpCode(HttpStatus.OK)
  async getPatch(@CurrentTenant() tenantId: string, @Param('id') id: string) {
    return this.findPatchOrFail(tenantId, id);
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // CONSTITUTION GATE — TYPED, NOT STRINGLY
  // ═══════════════════════════════════════════════════════════════════════════

  private runConstitutionGate(
    patchType: string,
    proposed: ProposedChange,
    safetyClass: string,
    rollbackStrategy: string,
  ): ConstitutionGateResult {
    const violations: string[] = [];
    const target = proposed?.target ?? '';

    // Check 1: Target is in ALLOWED set
    const targetIsAllowed = ALLOWED_PATCH_TARGETS.includes(target as AllowedTarget)
      || patchType === 'MESSAGING' || patchType === 'NOOP'; // these don't touch config
    if (!targetIsAllowed) violations.push(`Target '${target}' is not in ALLOWED_PATCH_TARGETS.`);

    // Check 2: Target is NOT in FROZEN set
    const targetNotFrozen = !FROZEN_TARGETS.includes(target as (typeof FROZEN_TARGETS)[number]);
    if (!targetNotFrozen) violations.push(`Target '${target}' is FROZEN — constitutional violation.`);

    // Check 3: Patch type matches target
    const allowedForType = PATCH_TYPE_TARGETS[patchType] ?? [];
    const patchTypeMatchesTarget = patchType === 'MESSAGING' || patchType === 'NOOP'
      || allowedForType.includes(target as AllowedTarget);
    if (!patchTypeMatchesTarget) violations.push(`Patch type '${patchType}' cannot target '${target}'.`);

    // Check 4: Safety class not FORBIDDEN
    const safetyClassNotForbidden = safetyClass !== 'FORBIDDEN';
    if (!safetyClassNotForbidden) violations.push('Safety class is FORBIDDEN.');

    // Check 5: Rollback strategy present
    const rollbackStrategyPresent = !!rollbackStrategy?.trim();
    if (!rollbackStrategyPresent) violations.push('No rollback strategy provided.');

    // Check 6: Value within safe bounds
    let valueWithinBounds = true;
    if (ALLOWED_PATCH_TARGETS.includes(target as AllowedTarget) && proposed?.newValue !== undefined) {
      const bounds = VALUE_BOUNDS[target as AllowedTarget];
      if (proposed.newValue < bounds.min || proposed.newValue > bounds.max) {
        valueWithinBounds = false;
        violations.push(`Value ${proposed.newValue} out of bounds [${bounds.min}, ${bounds.max}] for '${target}'.`);
      }
    }

    let verdict: 'PASS' | 'FAIL' | 'NEEDS_REVIEW' = 'PASS';
    if (violations.length > 0) {
      verdict = 'FAIL';
    } else if (safetyClass === 'REVIEW_REQUIRED') {
      verdict = 'NEEDS_REVIEW';
    }

    return {
      verdict,
      checks: {
        targetIsAllowed,
        targetNotFrozen,
        patchTypeMatchesTarget,
        safetyClassNotForbidden,
        rollbackStrategyPresent,
        valueWithinBounds,
      },
      violations,
    };
  }

  // ── Helpers ─────────────────────────────────────────────────────────────

  private async findPatchOrFail(tenantId: string, id: string) {
    const patch = await this.prisma.policyPatch.findFirst({
      where: { id, tenantId },
    });
    if (!patch) throw new BadRequestException(`Patch ${id} not found.`);
    return patch;
  }
}

// ── Utility ───────────────────────────────────────────────────────────────

function appendNote(existing: string | null, tag: string, note?: string | null): string {
  const entry = note ? `[${tag}] ${note}` : `[${tag}]`;
  return existing ? `${existing}\n${entry}`.trim() : entry;
}
