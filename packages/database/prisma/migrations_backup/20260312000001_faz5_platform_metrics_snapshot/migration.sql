-- CreateTable: platform_metrics_snapshots
-- FAZ 5: Super Admin Overview — analytics snapshot table
-- Analytics queries MUST target this table, not transactional tables.

CREATE TABLE "platform_metrics_snapshots" (
    "id"                   UUID         NOT NULL DEFAULT gen_random_uuid(),
    "capturedAt"           TIMESTAMPTZ  NOT NULL DEFAULT now(),
    "totalTenants"         INTEGER      NOT NULL,
    "activeTenants"        INTEGER      NOT NULL,
    "trialTenants"         INTEGER      NOT NULL,
    "pastDueTenants"       INTEGER      NOT NULL,
    "suspendedTenants"     INTEGER      NOT NULL,
    "canceledTenants"      INTEGER      NOT NULL,
    "newTenantsThisMonth"  INTEGER      NOT NULL,
    "bookingsToday"        INTEGER      NOT NULL,
    "estimatedMRR"         INTEGER      NOT NULL,
    "openAttemptCount"     INTEGER      NOT NULL,
    "failedAttemptCount"   INTEGER      NOT NULL,
    "planBreakdown"        JSONB        NOT NULL,

    CONSTRAINT "platform_metrics_snapshots_pkey" PRIMARY KEY ("id")
);

-- Desc index: en son snapshot önce gelsin
CREATE INDEX "platform_metrics_snapshots_capturedAt_idx"
    ON "platform_metrics_snapshots" ("capturedAt" DESC);
