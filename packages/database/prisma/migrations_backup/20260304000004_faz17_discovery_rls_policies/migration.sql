-- ─────────────────────────────────────────────────────────────────────────────
-- Migration: 20260304000004_faz17_discovery_rls_policies
-- Faz 17: SEO Growth Engine — Marketplace RLS Politikaları
-- ─────────────────────────────────────────────────────────────────────────────
-- Güvenlik notu:
--   Tablolar auralis_app (table owner) tarafından oluşturulmuştur.
--   PostgreSQL varsayılan davranışı gereği tablo sahibi, RLS politikalarından
--   OTOMATİK MUAF tutulur (FORCE ROW LEVEL SECURITY yoksa).
--   Bu nedenle mevcut uygulama sorguları ETKİLENMEZ.
--
--   Bu politikalar;
--     a) Gelecekte eklenecek read-only analitik rolleri için,
--     b) Şu an marketplace sorguları için (cross-tenant SEO okuma) tanımlanmıştır.
-- ─────────────────────────────────────────────────────────────────────────────

-- 1. RLS'yi etkinleştir (uygulama bağlantısı tablo sahibi → otomatik bypass)
ALTER TABLE "tenants"   ENABLE ROW LEVEL SECURITY;
ALTER TABLE "locations" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "services"  ENABLE ROW LEVEL SECURITY;

-- 2. Marketplace: Aktif salonların genel bilgilerine herkese açık SELECT erişimi
--    (Auralis Discovery sayfaları bu politikaları kullanır)

CREATE POLICY marketplace_read_tenants
  ON "tenants"
  FOR SELECT
  USING (
    status IN ('ACTIVE', 'TRIAL')
    AND "isDeleted" = false
  );

CREATE POLICY marketplace_read_locations
  ON "locations"
  FOR SELECT
  USING (
    "tenantId" IN (
      SELECT id FROM tenants
      WHERE status IN ('ACTIVE', 'TRIAL')
        AND "isDeleted" = false
    )
    AND "isDeleted" = false
  );

CREATE POLICY marketplace_read_services
  ON "services"
  FOR SELECT
  USING (
    "tenantId" IN (
      SELECT id FROM tenants
      WHERE status IN ('ACTIVE', 'TRIAL')
        AND "isDeleted" = false
    )
    AND "isDeleted" = false
    AND "isActive" = true
  );
