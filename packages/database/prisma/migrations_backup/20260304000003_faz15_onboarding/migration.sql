-- =============================================================================
-- FAZ 15: Self-Onboarding Wizard + Admin Growth Dashboard
-- Değişiklikler:
--   1. users.emailVerifiedAt kolonu eklendi
--   2. tenants.currency kolonu eklendi
--   3. onboarding_idempotency tablosu oluşturuldu
-- =============================================================================

-- 1. User tablosuna emailVerifiedAt kolonu ekle (e-posta doğrulama tarihi)
ALTER TABLE "users"
  ADD COLUMN IF NOT EXISTS "emailVerifiedAt" TIMESTAMP;

-- 2. Tenant tablosuna currency kolonu ekle (para birimi varsayılanı TRY)
ALTER TABLE "tenants"
  ADD COLUMN IF NOT EXISTS "currency" TEXT NOT NULL DEFAULT 'TRY';

-- 3. Onboarding Wizard İdempotency tablosu
--    (tenantId, key) UNIQUE: aynı tenant + Idempotency-Key bir kez wizard çalışır.
CREATE TABLE IF NOT EXISTS "onboarding_idempotency" (
  "id"        UUID      NOT NULL DEFAULT gen_random_uuid(),
  "tenantId"  UUID      NOT NULL,
  "key"       TEXT      NOT NULL,
  "response"  JSONB     NOT NULL,
  "createdAt" TIMESTAMP NOT NULL DEFAULT now(),

  CONSTRAINT "onboarding_idempotency_pkey"
    PRIMARY KEY ("id"),

  CONSTRAINT "onboarding_idempotency_tenantId_fkey"
    FOREIGN KEY ("tenantId")
    REFERENCES "tenants"("id")
    ON DELETE CASCADE
);

CREATE UNIQUE INDEX IF NOT EXISTS "onboarding_idempotency_tenantId_key_key"
  ON "onboarding_idempotency" ("tenantId", "key");

CREATE INDEX IF NOT EXISTS "onboarding_idempotency_tenantId_idx"
  ON "onboarding_idempotency" ("tenantId");

COMMENT ON TABLE "onboarding_idempotency" IS
  'FAZ 15: Setup wizard idempotency. Aynı (tenantId, Idempotency-Key) ikinci çağrıda cached yanıtı döner.';
