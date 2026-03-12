-- =============================================================================
-- FAZ 12: Plan Engine — TenantBilling, UsagePeriod, UsageEvent, Snapshot
-- =============================================================================

-- ── Enum'lar ──────────────────────────────────────────────────────────────────

CREATE TYPE "TenantPlan"      AS ENUM ('SOLO', 'BOUTIQUE', 'ENTERPRISE');
CREATE TYPE "BillingCycle"    AS ENUM ('MONTHLY', 'YEARLY');
CREATE TYPE "BillingStatus"   AS ENUM ('TRIAL', 'ACTIVE', 'PAST_DUE', 'SUSPENDED', 'CANCELED');
CREATE TYPE "BillingProvider" AS ENUM ('NONE', 'IYZICO', 'PAYTR', 'STRIPE');
CREATE TYPE "UsageEventType"  AS ENUM ('SMS', 'AI');

-- ── TenantBilling (1:1 Tenant) ────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS "tenant_billing" (
  "tenantId"               UUID          NOT NULL,
  "plan"                   "TenantPlan"  NOT NULL DEFAULT 'SOLO',
  "cycle"                  "BillingCycle" NOT NULL DEFAULT 'MONTHLY',
  "status"                 "BillingStatus" NOT NULL DEFAULT 'TRIAL',
  "trialEndsAt"            TIMESTAMPTZ   NOT NULL,
  "graceUntil"             TIMESTAMPTZ   NOT NULL,
  "currentPeriodStart"     TIMESTAMPTZ   NOT NULL DEFAULT NOW(),
  "currentPeriodEnd"       TIMESTAMPTZ   NOT NULL,
  "cancelAtPeriodEnd"      BOOLEAN       NOT NULL DEFAULT FALSE,
  "provider"               "BillingProvider" NOT NULL DEFAULT 'NONE',
  "providerSubscriptionId" TEXT,
  "lastPaymentAt"          TIMESTAMPTZ,
  "createdAt"              TIMESTAMPTZ   NOT NULL DEFAULT NOW(),
  "updatedAt"              TIMESTAMPTZ   NOT NULL DEFAULT NOW(),

  CONSTRAINT "tenant_billing_pkey" PRIMARY KEY ("tenantId"),
  CONSTRAINT "tenant_billing_tenantId_fkey"
    FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON DELETE CASCADE
);

-- ── UsagePeriod ───────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS "usage_periods" (
  "id"                UUID        NOT NULL DEFAULT gen_random_uuid(),
  "tenantId"          UUID        NOT NULL,
  "periodStart"       TIMESTAMPTZ NOT NULL,
  "periodEnd"         TIMESTAMPTZ NOT NULL,
  "smsIncluded"       INTEGER     NOT NULL DEFAULT 0,
  "smsUsed"           INTEGER     NOT NULL DEFAULT 0,
  "aiIncluded"        INTEGER     NOT NULL DEFAULT 0,
  "aiUsed"            INTEGER     NOT NULL DEFAULT 0,
  "extraSmsPurchased" INTEGER     NOT NULL DEFAULT 0,
  "extraAiPurchased"  INTEGER     NOT NULL DEFAULT 0,
  "createdAt"         TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  "updatedAt"         TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  CONSTRAINT "usage_periods_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "usage_periods_tenantId_fkey"
    FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS "usage_periods_tenantId_periodStart_idx"
  ON "usage_periods" ("tenantId", "periodStart");

-- ── UsageEvent (append-only) ──────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS "usage_events" (
  "id"             UUID             NOT NULL DEFAULT gen_random_uuid(),
  "tenantId"       UUID             NOT NULL,
  "type"           "UsageEventType" NOT NULL,
  "units"          INTEGER          NOT NULL,
  "idempotencyKey" TEXT             NOT NULL,
  "occurredAt"     TIMESTAMPTZ      NOT NULL DEFAULT NOW(),

  CONSTRAINT "usage_events_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "usage_events_idempotencyKey_key" UNIQUE ("idempotencyKey"),
  CONSTRAINT "usage_events_tenantId_fkey"
    FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS "usage_events_tenantId_occurredAt_idx"
  ON "usage_events" ("tenantId", "occurredAt");

-- ── TenantEntitlementSnapshot (DB cache) ──────────────────────────────────────

CREATE TABLE IF NOT EXISTS "tenant_entitlement_snapshots" (
  "tenantId"     UUID            NOT NULL,
  "featuresJson" JSONB           NOT NULL DEFAULT '{}',
  "limitsJson"   JSONB           NOT NULL DEFAULT '{}',
  "quotaJson"    JSONB           NOT NULL DEFAULT '{}',
  "status"       "BillingStatus" NOT NULL DEFAULT 'TRIAL',
  "isTrial"      BOOLEAN         NOT NULL DEFAULT TRUE,
  "updatedAt"    TIMESTAMPTZ     NOT NULL DEFAULT NOW(),
  "version"      INTEGER         NOT NULL DEFAULT 0,

  CONSTRAINT "tenant_entitlement_snapshots_pkey" PRIMARY KEY ("tenantId"),
  CONSTRAINT "tenant_entitlement_snapshots_tenantId_fkey"
    FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON DELETE CASCADE
);
