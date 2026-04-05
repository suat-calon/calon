/**
 * RECOMMENDATION OBSERVATION CONTROLLER
 * ─────────────────────────────────────────────────────────────────────────────
 * Decision feedback measurement endpoints.
 * Tracks: recommendation shown → operator action → outcome.
 * Observed-only semantics — no causal claims.
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

// ── Controller ──────────────────────────────────────────────────────────────

@Controller('recommendations')
export class RecommendationController {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * POST /recommendations/snapshot
   * Records that a recommendation was shown to the operator.
   * Idempotent via unique(tenantId, fingerprint) — upsert behavior.
   */
  @Post('snapshot')
  @HttpCode(HttpStatus.CREATED)
  async recordSnapshot(
    @CurrentTenant() tenantId: string,
    @Body() dto: RecordSnapshotDto,
  ) {
    return this.prisma.recommendationObservation.upsert({
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
        // Supersede: update snapshot but keep status
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
  }

  /**
   * POST /recommendations/action
   * Records operator's interaction with a recommendation.
   */
  @Post('action')
  @HttpCode(HttpStatus.OK)
  async recordAction(
    @CurrentTenant() tenantId: string,
    @Body() dto: RecordActionDto,
  ) {
    return this.prisma.recommendationObservation.updateMany({
      where: { tenantId, fingerprint: dto.fingerprint, status: 'ACTIVE' },
      data: {
        operatorAction: dto.actionType,
        operatorActedAt: new Date(),
        status: 'ACTED',
      },
    });
  }

  /**
   * GET /recommendations/observations
   * Internal readout — list recent observations for tenant.
   */
  @Get('observations')
  @HttpCode(HttpStatus.OK)
  async listObservations(
    @CurrentTenant() tenantId: string,
    @Query('take') take?: string,
  ) {
    return this.prisma.recommendationObservation.findMany({
      where: { tenantId },
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
        status: true,
        operatorAction: true,
        operatorActedAt: true,
        outcomeType: true,
        outcomeObservedAt: true,
        linkedBookingId: true,
        reasonText: true,
        ctaLabel: true,
      },
    });
  }
}
