-- =============================================================================
-- FAZ 8 ADIM 3 — AuditLog PostgreSQL Aylık Partitioning (Range Partitioning)
-- =============================================================================
-- Amaç   : 10.000 tenant ölçeğinde milyarlarca audit kaydının performanslı
--           sorgulanabilmesi için audit_logs tablosunu aylık Range partition'lara
--           böl. Her yılın her ayına ait yazma/okuma işlemleri ilgili partition'a
--           yönlendirilir; sorgu planlayıcısı partition pruning uygular.
--
-- Strateji: Zero-Downtime Rename + Rebuild
--   1. Mevcut "audit_logs" tablosu "audit_logs_old" olarak yeniden adlandırılır
--      (veri kaybı yok, eski kayıtlar korunur).
--   2. Aynı sütun yapısında yeni, PARTITION BY RANGE (createdAt) ile tanımlı
--      "audit_logs" tablosu yaratılır.
--   3. Her ay için fiziksel partition tabloları oluşturulur:
--        audit_log_y2026m01 … audit_log_y2026m12
--   4. Catch-all DEFAULT partition (önceki/sonraki yıllar için güvenlik ağı).
--   5. Parent tabloya index'ler yeniden oluşturulur (partition'lara otomatik yayılır).
--   6. RLS politikası parent tabloya uygulanır.
--   7. Mevcut veriler audit_logs_old → audit_logs'a taşınır.
--
-- PostgreSQL Notu (PK Kısıtlaması):
--   PostgreSQL deklaratif partitioning, birincil anahtarın partition key sütununu
--   içermesini ZORUNLU KILAR. Partition key'imiz "createdAt" olduğundan PK
--   PRIMARY KEY ("id", "createdAt") olarak tanımlanmıştır.
--   Prisma şeması @id @default(uuid()) ile tek sütunlu id kullanmaya devam eder;
--   uygulama katmanında sorguların tamamı WHERE "id" = $1 biçiminde çalışır.
--   Üretim geçişinde Prisma şeması @@id([id, createdAt]) ile güncellenmeli
--   veya Prisma'nın rawQuery API'si tercih edilmelidir.
-- =============================================================================

-- -----------------------------------------------------------------------------
-- Adım 1: Mevcut tabloyu koru (veri kaybı YOK)
-- -----------------------------------------------------------------------------
ALTER TABLE "audit_logs" RENAME TO "audit_logs_old";

-- Eski tablonun index'lerini devre dışı bırak
-- (yeni partitioned tabloya aynı mantıkla yeniden açılacak)
DROP INDEX IF EXISTS idx_audit_tenant_entity;
DROP INDEX IF EXISTS idx_audit_tenant_created;

-- Eski tablonun RLS politikasını kaldır
-- (yeni tablo için yeniden tanımlanacak)
ALTER TABLE "audit_logs_old" DISABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_isolation ON "audit_logs_old";

-- -----------------------------------------------------------------------------
-- Adım 2: Yeni partitioned tablo — PARTITION BY RANGE ("createdAt")
-- -----------------------------------------------------------------------------
CREATE TABLE "audit_logs" (
  "id"         UUID        NOT NULL DEFAULT uuid_generate_v4(),
  "tenantId"   UUID        NOT NULL REFERENCES "tenants"("id"),
  "entityType" TEXT        NOT NULL,
  "entityId"   UUID        NOT NULL,
  "action"     TEXT        NOT NULL,
  "actorId"    UUID        REFERENCES "users"("id"),
  "actorRole"  TEXT,
  "before"     JSONB,
  "after"      JSONB,
  "ipAddress"  TEXT,
  "createdAt"  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  -- Composite PK: PostgreSQL partition key "createdAt"'in dahil edilmesini zorunlu kılar
  PRIMARY KEY ("id", "createdAt")
) PARTITION BY RANGE ("createdAt");

-- -----------------------------------------------------------------------------
-- Adım 3: 2026 yılı aylık partition'ları
-- FORMAT: audit_log_y{YYYY}m{MM}
-- -----------------------------------------------------------------------------

CREATE TABLE audit_log_y2026m01 PARTITION OF "audit_logs"
  FOR VALUES FROM ('2026-01-01 00:00:00+00') TO ('2026-02-01 00:00:00+00');

CREATE TABLE audit_log_y2026m02 PARTITION OF "audit_logs"
  FOR VALUES FROM ('2026-02-01 00:00:00+00') TO ('2026-03-01 00:00:00+00');

CREATE TABLE audit_log_y2026m03 PARTITION OF "audit_logs"
  FOR VALUES FROM ('2026-03-01 00:00:00+00') TO ('2026-04-01 00:00:00+00');

CREATE TABLE audit_log_y2026m04 PARTITION OF "audit_logs"
  FOR VALUES FROM ('2026-04-01 00:00:00+00') TO ('2026-05-01 00:00:00+00');

CREATE TABLE audit_log_y2026m05 PARTITION OF "audit_logs"
  FOR VALUES FROM ('2026-05-01 00:00:00+00') TO ('2026-06-01 00:00:00+00');

CREATE TABLE audit_log_y2026m06 PARTITION OF "audit_logs"
  FOR VALUES FROM ('2026-06-01 00:00:00+00') TO ('2026-07-01 00:00:00+00');

CREATE TABLE audit_log_y2026m07 PARTITION OF "audit_logs"
  FOR VALUES FROM ('2026-07-01 00:00:00+00') TO ('2026-08-01 00:00:00+00');

CREATE TABLE audit_log_y2026m08 PARTITION OF "audit_logs"
  FOR VALUES FROM ('2026-08-01 00:00:00+00') TO ('2026-09-01 00:00:00+00');

CREATE TABLE audit_log_y2026m09 PARTITION OF "audit_logs"
  FOR VALUES FROM ('2026-09-01 00:00:00+00') TO ('2026-10-01 00:00:00+00');

CREATE TABLE audit_log_y2026m10 PARTITION OF "audit_logs"
  FOR VALUES FROM ('2026-10-01 00:00:00+00') TO ('2026-11-01 00:00:00+00');

CREATE TABLE audit_log_y2026m11 PARTITION OF "audit_logs"
  FOR VALUES FROM ('2026-11-01 00:00:00+00') TO ('2026-12-01 00:00:00+00');

CREATE TABLE audit_log_y2026m12 PARTITION OF "audit_logs"
  FOR VALUES FROM ('2026-12-01 00:00:00+00') TO ('2027-01-01 00:00:00+00');

-- -----------------------------------------------------------------------------
-- Adım 4: DEFAULT partition — 2026 dışı tarihler için güvenlik ağı
-- (önceki yıllardan taşınan veriler + 2027 ve sonrası için geçici yer)
-- -----------------------------------------------------------------------------
CREATE TABLE audit_log_default PARTITION OF "audit_logs" DEFAULT;

-- -----------------------------------------------------------------------------
-- Adım 5: Parent tabloya index'ler (partition'lara otomatik yayılır)
-- -----------------------------------------------------------------------------
CREATE INDEX idx_audit_tenant_entity  ON "audit_logs" ("tenantId", "entityType", "entityId");
CREATE INDEX idx_audit_tenant_created ON "audit_logs" ("tenantId", "createdAt");

-- -----------------------------------------------------------------------------
-- Adım 6: Row Level Security — RLS politikası parent tabloya uygulanır,
-- PostgreSQL 12+ partitioned tablolarda RLS otomatik olarak partition'lara yayılır
-- -----------------------------------------------------------------------------
ALTER TABLE "audit_logs" ENABLE ROW LEVEL SECURITY;

CREATE POLICY tenant_isolation ON "audit_logs"
  FOR ALL TO auralis_app
  USING ("tenantId" = current_setting('app.tenant_id', true)::uuid);

-- -----------------------------------------------------------------------------
-- Adım 7: Mevcut veriyi yeni partitioned tabloya taşı
-- "createdAt" değerine göre PostgreSQL otomatik olarak doğru partition'a yazar.
-- Tarih aralığı dışındaki kayıtlar audit_log_default'a düşer.
-- -----------------------------------------------------------------------------
INSERT INTO "audit_logs" (
  "id", "tenantId", "entityType", "entityId", "action",
  "actorId", "actorRole", "before", "after", "ipAddress", "createdAt"
)
SELECT
  "id", "tenantId", "entityType", "entityId", "action",
  "actorId", "actorRole", "before", "after", "ipAddress", "createdAt"
FROM "audit_logs_old";

-- =============================================================================
-- NOTLAR:
--
-- 1. Partition yönetimi (otomasyon):
--    Üretimde pg_partman extension'ı ile otomatik partition oluşturma/arşivleme
--    yönetilmeli; her ay başında yeni partition + TTL geçen partition'ların
--    arşivlenmesi için cron job kurulmalıdır.
--
-- 2. "audit_logs_old" tablosu:
--    Veri taşıma doğrulandıktan sonra (INSERT INTO SELECT sonucu kontrol)
--    DBA onayıyla kaldırılabilir: DROP TABLE "audit_logs_old";
--    Acil rollback için önce "audit_logs_old"'ın varlığı korunmalıdır.
--
-- 3. FK kısıtlaması:
--    "actorId" → users.id FK: Partitioned tablolarda FK desteği PostgreSQL 12+
--    ile sağlanmaktadır. Eğer FK kaldırılması gerekirse uygulama katmanında
--    referential integrity sağlanmalıdır.
--
-- 4. Prisma schema drift:
--    Prisma model AuditLog @id(id) tek sütun olarak tanımlıdır. DB gerçeği
--    (id, createdAt) composite PK'dır. Gelecek migrate dev çalışmalarında
--    bu drift tespit edilecektir. Çözüm: Prisma'da @@id([id, createdAt])
--    veya rawQuery API kullanımı.
-- =============================================================================
