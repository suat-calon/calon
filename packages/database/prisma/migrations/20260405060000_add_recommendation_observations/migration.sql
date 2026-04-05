-- ─────────────────────────────────────────────────────────────────────────────
-- ADD: RecommendationObservation — Decision feedback measurement
-- ─────────────────────────────────────────────────────────────────────────────
-- Tracks: recommendation shown → operator action → booking outcome
-- Durable, tenant-safe, queryable. Observed-only semantics (no causal claims).
-- ─────────────────────────────────────────────────────────────────────────────

CREATE TABLE "recommendation_observations" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "tenantId" UUID NOT NULL,
    "customerId" UUID NOT NULL,
    "fingerprint" TEXT NOT NULL,
    "generatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "impactClass" TEXT NOT NULL,
    "actionMode" TEXT NOT NULL,
    "actionHardness" TEXT NOT NULL,
    "urgencyClass" TEXT NOT NULL,
    "confidenceBand" TEXT NOT NULL,
    "relationshipBand" TEXT NOT NULL,
    "reasonText" TEXT NOT NULL,
    "ctaLabel" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'ACTIVE',
    "operatorAction" TEXT,
    "operatorActedAt" TIMESTAMP(3),
    "outcomeType" TEXT,
    "outcomeObservedAt" TIMESTAMP(3),
    "linkedBookingId" UUID,
    "windowDays" INTEGER NOT NULL DEFAULT 14,

    CONSTRAINT "recommendation_observations_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "recommendation_observations_tenantId_status_idx"
    ON "recommendation_observations"("tenantId", "status");

CREATE INDEX "recommendation_observations_tenantId_customerId_status_idx"
    ON "recommendation_observations"("tenantId", "customerId", "status");

CREATE UNIQUE INDEX "recommendation_observations_tenantId_fingerprint_key"
    ON "recommendation_observations"("tenantId", "fingerprint");

ALTER TABLE "recommendation_observations"
    ADD CONSTRAINT "recommendation_observations_tenantId_fkey"
    FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "recommendation_observations"
    ADD CONSTRAINT "recommendation_observations_customerId_fkey"
    FOREIGN KEY ("customerId") REFERENCES "customers"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
