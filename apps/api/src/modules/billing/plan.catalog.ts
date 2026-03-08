/**
 * PLAN CATALOG — Tek Kaynak (Single Source of Truth)
 * ──────────────────────────────────────────────────────────────────────────────
 * Planlar veritabanında "editable" değildir. Bu dosya tüm plan tanımlarının
 * tek kaynağıdır. EntitlementsService bu kataloğu okur; hiçbir endpoint
 * planları DB'den okuyup değiştirmez.
 *
 * TRIAL: Ayrı bir plan DEĞİLDİR. BOUTIQUE feature set'i + düşük quota.
 * Hesaplama: status === TRIAL ise TRIAL_OVERRIDE uygulanır.
 *
 * PLAN_PRICES: Faz 22 — abonelik fiyat kataloğu.
 * TODO(future): Bölgesel fiyatlandırma veya plan yönetimi gerektiğinde DB'ye taşı.
 * ──────────────────────────────────────────────────────────────────────────────
 */

import type { BillingCycle, TenantPlan } from '@prisma/client';

// ── Tip Tanımları ─────────────────────────────────────────────────────────────

export interface PlanFeatures {
  /** Sadakat puanı motoru (Faz 11) */
  loyalty:           boolean;
  /** Stok yönetimi */
  inventory:         boolean;
  /** SMS/E-posta kampanyaları */
  marketing:         boolean;
  /** Birden fazla şube */
  multiLocation:     boolean;
  /** Personel yönetimi (vardiya, hakediş) */
  staffManagement:   boolean;
  /** Gelişmiş raporlama */
  advancedReporting: boolean;
}

export interface PlanLimits {
  /** Maksimum aktif personel sayısı */
  staffMax:  number;
  /** Maksimum şube/lokasyon sayısı */
  branchMax: number;
}

export interface PlanIncludedUsage {
  /** Dönem başına dahil SMS adedi */
  smsIncluded: number;
  /** Dönem başına dahil AI çağrısı adedi */
  aiIncluded:  number;
}

export interface PlanEntry {
  features:      PlanFeatures;
  limits:        PlanLimits;
  includedUsage: PlanIncludedUsage;
}

// ── Plan Kataloğu ─────────────────────────────────────────────────────────────

export const PlanCatalog: Record<string, PlanEntry> = {
  /** SOLO: Tek kişilik işletme */
  SOLO: {
    features: {
      loyalty:           false,
      inventory:         false,
      marketing:         false,
      multiLocation:     false,
      staffManagement:   false,
      advancedReporting: false,
    },
    limits: {
      staffMax:  1,
      branchMax: 1,
    },
    includedUsage: {
      smsIncluded: 100,
      aiIncluded:  0,
    },
  },

  /** BOUTIQUE: 3–10 personelli salon */
  BOUTIQUE: {
    features: {
      loyalty:           true,
      inventory:         true,
      marketing:         true,
      multiLocation:     false,
      staffManagement:   true,
      advancedReporting: false,
    },
    limits: {
      staffMax:  10,
      branchMax: 1,
    },
    includedUsage: {
      smsIncluded: 500,
      aiIncluded:  100,
    },
  },

  /** ENTERPRISE: Klinik / Zincir şube */
  ENTERPRISE: {
    features: {
      loyalty:           true,
      inventory:         true,
      marketing:         true,
      multiLocation:     true,
      staffManagement:   true,
      advancedReporting: true,
    },
    limits: {
      staffMax:  100,
      branchMax: 10,
    },
    includedUsage: {
      smsIncluded: 2000,
      aiIncluded:  500,
    },
  },
} as const;

// ── TRIAL Override ────────────────────────────────────────────────────────────
/**
 * TRIAL: Ayrı plan DEĞİL; BOUTIQUE feature set'i + kısıtlı quota.
 * EntitlementsService, billing.status === 'TRIAL' olduğunda bu override'ı uygular.
 */
export const TRIAL_OVERRIDE: PlanEntry = {
  features:      { ...PlanCatalog['BOUTIQUE'].features },
  limits:        { ...PlanCatalog['BOUTIQUE'].limits },
  includedUsage: {
    smsIncluded: 50,
    aiIncluded:  20,
  },
};

// ── Yardımcı ──────────────────────────────────────────────────────────────────

/**
 * Plan adına göre PlanEntry döner; tanımlanmamış plan → SOLO fallback.
 */
export function getPlanEntry(plan: string): PlanEntry {
  return PlanCatalog[plan] ?? PlanCatalog['SOLO'];
}

// ── Faz 22: Abonelik Fiyat Kataloğu ──────────────────────────────────────────
// TODO(future): Bölgesel fiyatlandırma veya dinamik plan yönetimi gerektiğinde
//               bu sabit değerleri bir DB fiyatlandırma tablosuna taşı.

export const PLAN_PRICES: Record<
  TenantPlan,
  Record<BillingCycle, { amountCents: number; currency: string }>
> = {
  SOLO: {
    MONTHLY: { amountCents:   39_900, currency: 'TRY' },
    YEARLY:  { amountCents:  399_000, currency: 'TRY' },
  },
  BOUTIQUE: {
    MONTHLY: { amountCents:   99_900, currency: 'TRY' },
    YEARLY:  { amountCents:  999_000, currency: 'TRY' },
  },
  ENTERPRISE: {
    MONTHLY: { amountCents:  299_900, currency: 'TRY' },
    YEARLY:  { amountCents: 2_999_000, currency: 'TRY' },
  },
};

/**
 * Plan ve döngüye göre fiyat döner.
 * amountCents: kuruş cinsinden (örn. 39_900 = 399.00 TL)
 */
export function getPlanPrice(
  plan:  TenantPlan,
  cycle: BillingCycle,
): { amountCents: number; currency: string } {
  return PLAN_PRICES[plan]?.[cycle] ?? { amountCents: 0, currency: 'TRY' };
}
