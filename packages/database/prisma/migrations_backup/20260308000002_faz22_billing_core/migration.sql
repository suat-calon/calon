-- ──────────────────────────────────────────────────────────────────────────────
-- FAZ 22: Abonelik Billing Katmanı
-- BillingAttempt + WebhookEvent tabloları, RLS, ve concurrency guard index
-- ──────────────────────────────────────────────────────────────────────────────

-- BillingAttemptStatus enum
CREATE TYPE "BillingAttemptStatus" AS ENUM ('PENDING', 'SUCCEEDED', 'FAILED');

-- billing_attempts (expiresAt dahil — index oluşturma öncesi tanımlanmalı)
CREATE TABLE "billing_attempts" (
  "id"                UUID         NOT NULL DEFAULT gen_random_uuid(),
  "tenantId"          UUID         NOT NULL,
  "plan"              "TenantPlan" NOT NULL,
  "cycle"             "BillingCycle" NOT NULL,
  "amountCents"       INTEGER      NOT NULL,
  "currency"          TEXT         NOT NULL DEFAULT 'TRY',
  "status"            "BillingAttemptStatus" NOT NULL DEFAULT 'PENDING',
  "providerPaymentId" TEXT,                         -- UNIQUE değil; idempotency webhook_events.providerEventId üzerinden
  "providerMeta"      JSONB,
  "expiresAt"         TIMESTAMP(3) NOT NULL DEFAULT (CURRENT_TIMESTAMP + interval '30 minutes'),
  "createdAt"         TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt"         TIMESTAMP(3) NOT NULL,
  CONSTRAINT "billing_attempts_pkey" PRIMARY KEY ("id")
);

-- Standart indexler
CREATE INDEX "billing_attempts_tenantId_idx"          ON "billing_attempts"("tenantId");
CREATE INDEX "billing_attempts_status_expiresAt_idx"  ON "billing_attempts"("status", "expiresAt");
CREATE INDEX "billing_attempts_tenantId_plan_idx"     ON "billing_attempts"("tenantId", "plan");
CREATE INDEX "billing_attempts_tenant_status_idx"     ON "billing_attempts"("tenantId", "status");

-- Q4: Concurrency race guard — aynı tenant için aynı plan/cycle'da iki eş zamanlı PENDING girişim önlenir
-- İkinci eş zamanlı INSERT P2002 alır; service mevcut girişimi döndürür.
CREATE UNIQUE INDEX "billing_attempts_pending_unique_idx"
  ON "billing_attempts"("tenantId", "plan", "cycle") WHERE (status = 'PENDING');

-- Foreign key
ALTER TABLE "billing_attempts" ADD CONSTRAINT "billing_attempts_tenantId_fkey"
  FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- webhook_events — idempotency kalkanı
CREATE TABLE "webhook_events" (
  "id"              UUID         NOT NULL DEFAULT gen_random_uuid(),
  "source"          TEXT         NOT NULL,
  "providerEventId" TEXT         NOT NULL,
  "eventType"       TEXT         NOT NULL,
  "payload"         JSONB        NOT NULL,
  "tenantId"        UUID,
  "processedAt"     TIMESTAMP(3),
  "createdAt"       TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "webhook_events_pkey"               PRIMARY KEY ("id"),
  CONSTRAINT "webhook_events_providerEventId_key" UNIQUE      ("providerEventId")
);

CREATE INDEX "webhook_events_source_eventType_idx" ON "webhook_events"("source", "eventType");
CREATE INDEX "webhook_events_tenantId_idx"          ON "webhook_events"("tenantId");

-- ── RLS ──────────────────────────────────────────────────────────────────────
-- WITH CHECK: INSERT/UPDATE da tenant izolasyonunu ihlal edemez.

ALTER TABLE "billing_attempts" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "webhook_events"   ENABLE ROW LEVEL SECURITY;

CREATE POLICY tenant_isolation ON "billing_attempts"
  FOR ALL TO calon_app
  USING      ("tenantId" = current_setting('app.tenant_id', true)::uuid)
  WITH CHECK ("tenantId" = current_setting('app.tenant_id', true)::uuid);

-- webhook_events: tenantId nullable (bilinmiyor ise null); BYPASS superuser webhook handler
CREATE POLICY tenant_isolation ON "webhook_events"
  FOR ALL TO calon_app
  USING      ("tenantId" IS NULL OR "tenantId" = current_setting('app.tenant_id', true)::uuid)
  WITH CHECK ("tenantId" IS NULL OR "tenantId" = current_setting('app.tenant_id', true)::uuid);
