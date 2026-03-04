-- ─────────────────────────────────────────────────────────────────────────────
-- Migration: 20260304000006_faz18_1_rls_as_code
-- Faz 18.1: Production Disiplini — "RLS as Code"
-- ─────────────────────────────────────────────────────────────────────────────
-- Bu migration, Faz 18'de manuel olarak uygulanan RLS politikasını
-- "Infrastructure as Code" prensibine uygun şekilde migration geçmişine taşır.
--
-- İdempotent tasarım: politika zaten varsa önce düşürülür (DROP ... IF EXISTS),
-- ardından canonical haliyle yeniden oluşturulur.
-- Bu sayede migration tekrar çalıştırılsa bile hata vermez.
--
-- Güvenlik notu:
--   auralis_app, referrals tablosunun sahibidir → RLS politikalarından
--   OTOMATİK MUAF. Mevcut uygulama sorguları ETKİLENMEZ.
--   Politika, gelecekteki read-only / analytics rolleri için izolasyon sağlar.
-- ─────────────────────────────────────────────────────────────────────────────

-- 1. RLS'nin etkin olduğunu garanti et (idempotent — defalarca çalıştırılabilir)
ALTER TABLE "referrals" ENABLE ROW LEVEL SECURITY;

-- 2. Varsa eski politikayı temizle, ardından canonical haliyle yeniden oluştur
DROP POLICY IF EXISTS "tenant_isolation_referrals" ON "referrals";

CREATE POLICY "tenant_isolation_referrals"
  ON "referrals"
  FOR ALL
  USING (
    "tenantId"::text = current_setting('app.current_tenant_id', TRUE)
  )
  WITH CHECK (
    "tenantId"::text = current_setting('app.current_tenant_id', TRUE)
  );

-- 3. Uygulama rolüne tam yetki (idempotent — GRANT'lar tekrar çalıştırılabilir)
GRANT SELECT, INSERT, UPDATE, DELETE ON "referrals" TO auralis_app;
