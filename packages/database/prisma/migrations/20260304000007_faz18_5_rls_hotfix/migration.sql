-- ─────────────────────────────────────────────────────────────────────────────
-- Migration: 20260304000007_faz18_5_rls_hotfix
-- Faz 18.5 Core Hardening — RLS Ayar Adı Düzeltmesi
-- ─────────────────────────────────────────────────────────────────────────────
-- SORUN:
--   Faz 18 (20260304000005) ve Faz 18.1 (20260304000006) migration'larında
--   referrals tablosunun RLS politikası yanlışlıkla `app.current_tenant_id`
--   ayarını kullanıyordu.
--
--   Tüm diğer politikalar (`init_steel_core` dahil) `app.tenant_id` kullanır.
--   PrismaService.$extends interceptor da `SET set_config('app.tenant_id', ...)`
--   şeklinde ayarlar. Bu tutarsızlık, referrals tablosunda RLS'nin hiçbir zaman
--   tetiklenmemesine yol açıyordu.
--
-- DÜZELTME:
--   `tenant_isolation_referrals` politikası `app.tenant_id` ile yeniden oluşturulur.
--   İdempotent: DROP IF EXISTS + CREATE — tekrar çalıştırılabilir.
--
-- ETKİ:
--   auralis_app tablo sahibidir → RLS'den otomatik muaf, uygulama sorguları
--   etkilenmez. Politika yalnızca `anon` ve diğer sınırlı roller için geçerlidir.
-- ─────────────────────────────────────────────────────────────────────────────

-- RLS'nin aktif olduğunu garanti et (idempotent)
ALTER TABLE "referrals" ENABLE ROW LEVEL SECURITY;

-- Yanlış ayar adını kullanan politikayı kaldır ve doğru adla yeniden oluştur
DROP POLICY IF EXISTS "tenant_isolation_referrals" ON "referrals";

CREATE POLICY "tenant_isolation_referrals"
  ON "referrals"
  FOR ALL
  USING (
    "tenantId"::text = current_setting('app.tenant_id', TRUE)
  )
  WITH CHECK (
    "tenantId"::text = current_setting('app.tenant_id', TRUE)
  );

-- Uygulama rolüne tam yetki (idempotent — GRANT'lar tekrar çalıştırılabilir)
GRANT SELECT, INSERT, UPDATE, DELETE ON "referrals" TO auralis_app;
