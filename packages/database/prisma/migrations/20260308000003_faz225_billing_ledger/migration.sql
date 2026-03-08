-- =============================================================================
-- FAZ 22.5: BILLING LEDGER — Immutable abonelik dönem kaydı
-- =============================================================================

-- BillingPeriodStatus enum
CREATE TYPE "BillingPeriodStatus" AS ENUM ('ACTIVE', 'CLOSED', 'REFUNDED');

-- billing_periods tablosu
-- Kural: her ödeme başarıldığında yeni satır açılır; UPDATE yasaktır.
-- Tek istisna: status sütunu (ACTIVE → CLOSED / REFUNDED geçişi).
CREATE TABLE "billing_periods" (
  "id"                UUID         NOT NULL DEFAULT gen_random_uuid(),
  "tenantId"          UUID         NOT NULL,
  "plan"              "TenantPlan" NOT NULL,
  "cycle"             "BillingCycle" NOT NULL,
  "status"            "BillingPeriodStatus" NOT NULL DEFAULT 'ACTIVE',
  "amountCents"       INTEGER      NOT NULL,
  "currency"          TEXT         NOT NULL DEFAULT 'TRY',
  "periodStart"       TIMESTAMP(3) NOT NULL,
  "periodEnd"         TIMESTAMP(3) NOT NULL,
  "attemptId"         UUID,
  "providerPaymentId" TEXT,
  "createdAt"         TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "billing_periods_pkey" PRIMARY KEY ("id")
);

-- İndeksler
CREATE INDEX "billing_periods_tenantId_periodStart_idx"
  ON "billing_periods"("tenantId", "periodStart");

CREATE INDEX "billing_periods_tenantId_status_idx"
  ON "billing_periods"("tenantId", "status");

CREATE INDEX "billing_periods_attemptId_idx"
  ON "billing_periods"("attemptId");

-- FK
ALTER TABLE "billing_periods"
  ADD CONSTRAINT "billing_periods_tenantId_fkey"
  FOREIGN KEY ("tenantId") REFERENCES "tenants"("id")
  ON DELETE RESTRICT ON UPDATE CASCADE;

-- Row Level Security
-- Authenticated erişim: tenantId = JWT claim'deki tenant
-- webhook handler superuser bağlantı kullanır → RLS bypass

ALTER TABLE "billing_periods" ENABLE ROW LEVEL SECURITY;

CREATE POLICY tenant_isolation ON "billing_periods"
  FOR ALL TO calon_app
  USING      ("tenantId" = current_setting('app.tenant_id', true)::uuid)
  WITH CHECK ("tenantId" = current_setting('app.tenant_id', true)::uuid);
