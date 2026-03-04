-- ─────────────────────────────────────────────────────────────────────────────
-- Migration: 20260304000005_faz18_viral_growth_engine
-- Faz 18: Viral Booking Loop & Referral Engine
-- ─────────────────────────────────────────────────────────────────────────────
-- Güvenlik notu:
--   auralis_app tablo sahibi → RLS politikalarından OTOMATİK MUAF.
--   Mevcut uygulama sorguları ETKİLENMEZ.
--   RLS politikası gelecekteki read-only / analytics rolleri içindir.
-- ─────────────────────────────────────────────────────────────────────────────

-- 1. customers tablosuna referralCode sütunu ekle
ALTER TABLE "customers"
  ADD COLUMN IF NOT EXISTS "referralCode" TEXT;

-- 2. referralCode benzersiz kısıtı (platform geneli unique — aur-{RANDOM6})
ALTER TABLE "customers"
  ADD CONSTRAINT "customers_referralCode_key" UNIQUE ("referralCode");

-- 3. referrals tablosu oluştur
CREATE TABLE IF NOT EXISTS "referrals" (
  "id"                  UUID        NOT NULL DEFAULT uuid_generate_v4(),
  "tenantId"            UUID        NOT NULL,
  "referrerCustomerId"  UUID        NOT NULL,
  "referredCustomerId"  UUID        NOT NULL,
  "appointmentId"       UUID        NOT NULL,
  "awardedPoints"       INTEGER     NOT NULL DEFAULT 0,
  "createdAt"           TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  CONSTRAINT "referrals_pkey" PRIMARY KEY ("id"),

  -- FK kısıtları
  CONSTRAINT "referrals_tenantId_fkey"
    FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON DELETE RESTRICT ON UPDATE CASCADE,

  CONSTRAINT "referrals_referrerCustomerId_fkey"
    FOREIGN KEY ("referrerCustomerId") REFERENCES "customers"("id") ON DELETE RESTRICT ON UPDATE CASCADE,

  CONSTRAINT "referrals_referredCustomerId_fkey"
    FOREIGN KEY ("referredCustomerId") REFERENCES "customers"("id") ON DELETE RESTRICT ON UPDATE CASCADE,

  CONSTRAINT "referrals_appointmentId_fkey"
    FOREIGN KEY ("appointmentId") REFERENCES "appointments"("id") ON DELETE RESTRICT ON UPDATE CASCADE,

  -- 1-to-1: bir randevu yalnızca bir referrala bağlanabilir
  CONSTRAINT "referrals_appointmentId_key"
    UNIQUE ("appointmentId"),

  -- P2002 idempotency: aynı referrer→referred çifti yalnızca bir kez ödüllendirilir
  CONSTRAINT "referrals_referrerCustomerId_referredCustomerId_key"
    UNIQUE ("referrerCustomerId", "referredCustomerId")
);

-- 4. Acceptance criteria: (tenantId, referrerCustomerId) bileşik index
CREATE INDEX IF NOT EXISTS "referrals_tenantId_referrerCustomerId_idx"
  ON "referrals" ("tenantId", "referrerCustomerId");

-- 5. RLS etkinleştir (auralis_app owner → otomatik bypass)
ALTER TABLE "referrals" ENABLE ROW LEVEL SECURITY;

-- 6. Tenant izolasyon politikası
CREATE POLICY "tenant_isolation_referrals"
  ON "referrals"
  FOR ALL
  USING (
    "tenantId"::text = current_setting('app.current_tenant_id', TRUE)
  )
  WITH CHECK (
    "tenantId"::text = current_setting('app.current_tenant_id', TRUE)
  );

-- 7. Uygulama rolüne tam yetki (gelecek-güvenli)
GRANT SELECT, INSERT, UPDATE, DELETE ON "referrals" TO auralis_app;
