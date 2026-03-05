/**
 * ENTITLEMENTS SERVICE — Plan Yetki Motoru
 * ──────────────────────────────────────────────────────────────────────────────
 * Her korumalı istekte "ne yapabilirsin?" sorusunu yanıtlar.
 *
 * Veri akışı:
 *   JWT plan claim → PlanCatalog → TenantBilling.status → UsagePeriod → Redis cache
 *
 * Cache stratejisi:
 *   - Redis key: calon:tenant:entitlements:{tenantId}, TTL: 90s
 *   - Billing değişince BillingService.invalidateCache() çağırır → DEL
 *   - Cache miss → buildEntitlements() → Redis'e yaz
 *
 * TRIAL override:
 *   status === TRIAL → BOUTIQUE features + smsIncluded=50, aiIncluded=20
 * ──────────────────────────────────────────────────────────────────────────────
 */

import { Injectable, Logger, Inject } from '@nestjs/common';
import { BillingStatus }              from '@prisma/client';
import Redis                          from 'ioredis';

import { PrismaService }              from '../../common/prisma.service';
import { REDIS_CLIENT }               from '../../common/redis.module';
import { redisKey }                   from '../../common/redis.util';
import {
  PlanEntry,
  PlanFeatures,
  PlanLimits,
  getPlanEntry,
  TRIAL_OVERRIDE,
} from './plan.catalog';

// ── Tipler ────────────────────────────────────────────────────────────────────

export interface QuotaSnapshot {
  smsIncluded:  number;
  smsUsed:      number;
  aiIncluded:   number;
  aiUsed:       number;
}

export interface EntitlementsResult {
  status:   BillingStatus;
  isTrial:  boolean;
  features: PlanFeatures;
  limits:   PlanLimits;
  quota:    QuotaSnapshot;
}

// ── Sabitler ──────────────────────────────────────────────────────────────────

const CACHE_TTL_SEC   = 90;
const cacheKey = (tenantId: string) => redisKey('tenant', 'entitlements', tenantId);

// ── Servis ────────────────────────────────────────────────────────────────────

@Injectable()
export class EntitlementsService {
  private readonly logger = new Logger(EntitlementsService.name);

  constructor(
    private readonly prisma: PrismaService,
    @Inject(REDIS_CLIENT) private readonly redis: Redis,
  ) {}

  // ═══════════════════════════════════════════════════════════════════════════
  // GETENTITLEMENTS — Ana giriş noktası (cache-aside + Redis fallback)
  // ═══════════════════════════════════════════════════════════════════════════
  async getEntitlements(
    tenantId:     string,
    jwtPlanClaim: string = 'SOLO',
  ): Promise<EntitlementsResult> {
    // ── 1. Redis cache hit (200 ms timeout — SPOF koruması) ──────────────────
    try {
      const raw = await Promise.race<string | null>([
        this.redis.get(cacheKey(tenantId)),
        new Promise<never>((_, reject) =>
          setTimeout(() => reject(new Error('Redis timeout (200ms)')), 200),
        ),
      ]);
      if (raw) {
        return JSON.parse(raw) as EntitlementsResult;
      }
    } catch (err) {
      // Redis çöktü veya timeout → Doğrudan DB fallback — 500 kesilmez
      this.logger.warn(
        `[Entitlements] Redis okuma hatası — DB fallback aktif: ${String(err)}`,
      );
      return this.buildEntitlements(tenantId, jwtPlanClaim);
    }

    // ── 2. Cache miss → DB'den build et ─────────────────────────────────────
    const result = await this.buildEntitlements(tenantId, jwtPlanClaim);

    // ── 3. Cache'e yaz (hata olursa yut — sonraki istek tekrar DB'den okur) ──
    try {
      await this.redis.setex(cacheKey(tenantId), CACHE_TTL_SEC, JSON.stringify(result));
    } catch (err) {
      this.logger.warn(`[Entitlements] Redis yazma hatası: ${String(err)}`);
    }

    return result;
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // INVALIDATE — Billing değişince çağrılır
  // ═══════════════════════════════════════════════════════════════════════════
  async invalidate(tenantId: string): Promise<void> {
    try {
      await this.redis.del(cacheKey(tenantId));
      this.logger.debug(`[Entitlements] Cache invalidate: ${tenantId}`);
    } catch (err) {
      this.logger.warn(`[Entitlements] Cache invalidate hatası: ${String(err)}`);
    }
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // BUILD — TenantBilling + UsagePeriod → EntitlementsResult
  // ═══════════════════════════════════════════════════════════════════════════
  private async buildEntitlements(
    tenantId:     string,
    jwtPlanClaim: string,
  ): Promise<EntitlementsResult> {
    // ── TenantBilling kaydını al ─────────────────────────────────────────────
    const billing = await this.prisma.tenantBilling.findUnique({
      where: { tenantId },
    });

    if (!billing) {
      // Kayıt yok: JWT claim + ACTIVE fallback (eski tenant'lar için)
      const planEntry = getPlanEntry(jwtPlanClaim);
      return this.buildResult('ACTIVE', false, planEntry, null);
    }

    const isTrial  = billing.status === 'TRIAL';
    const planEntry: PlanEntry = isTrial
      ? TRIAL_OVERRIDE
      : getPlanEntry(billing.plan);

    // ── Aktif kullanım dönemini al ───────────────────────────────────────────
    const now = new Date();
    const usagePeriod = await this.prisma.usagePeriod.findFirst({
      where: {
        tenantId,
        periodStart: { lte: now },
        periodEnd:   { gte: now },
      },
    });

    return this.buildResult(billing.status, isTrial, planEntry, usagePeriod);
  }

  // ── Yardımcı: sonuç nesnesi ──────────────────────────────────────────────────
  private buildResult(
    status:      BillingStatus | 'ACTIVE',
    isTrial:     boolean,
    planEntry:   PlanEntry,
    usagePeriod: { smsUsed: number; aiUsed: number; extraSmsPurchased: number; extraAiPurchased: number } | null,
  ): EntitlementsResult {
    return {
      status:   status as BillingStatus,
      isTrial,
      features: planEntry.features,
      limits:   planEntry.limits,
      quota: {
        smsIncluded: planEntry.includedUsage.smsIncluded + (usagePeriod?.extraSmsPurchased ?? 0),
        smsUsed:     usagePeriod?.smsUsed ?? 0,
        aiIncluded:  planEntry.includedUsage.aiIncluded  + (usagePeriod?.extraAiPurchased  ?? 0),
        aiUsed:      usagePeriod?.aiUsed  ?? 0,
      },
    };
  }
}
