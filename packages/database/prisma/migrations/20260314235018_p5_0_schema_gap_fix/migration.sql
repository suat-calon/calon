-- ════════════════════════════════════════════════════════════
-- P5-0: staff_working_hours / staff_services tenantId Ekleme
-- ════════════════════════════════════════════════════════════
-- Schema gap tasfiyesi: Bu iki tablo tenantId kolonu taşımıyordu.
-- İzolasyon staffId FK üzerinden dolaylı sağlanıyordu.
-- Bu migration doğrudan tenantId ekler + RLS aktif eder.
--
-- Backfill: staff_profiles.tenantId üzerinden doldurulur.
-- Production'da tablo boş olsa bile backfill güvenlik için korunur.
-- ════════════════════════════════════════════════════════════

-- 1. Nullable olarak kolon ekle
ALTER TABLE "staff_working_hours" ADD COLUMN "tenantId" UUID;
ALTER TABLE "staff_services" ADD COLUMN "tenantId" UUID;

-- 2. Backfill: mevcut satırları staff_profiles'tan doldur
UPDATE "staff_working_hours" swh
SET "tenantId" = sp."tenantId"
FROM "staff_profiles" sp
WHERE swh."staffId" = sp.id;

UPDATE "staff_services" ss
SET "tenantId" = sp."tenantId"
FROM "staff_profiles" sp
WHERE ss."staffId" = sp.id;

-- 3. NOT NULL constraint ekle (backfill sonrası güvenli)
ALTER TABLE "staff_working_hours" ALTER COLUMN "tenantId" SET NOT NULL;
ALTER TABLE "staff_services" ALTER COLUMN "tenantId" SET NOT NULL;

-- 4. FK constraint
ALTER TABLE "staff_working_hours"
  ADD CONSTRAINT "staff_working_hours_tenantId_fkey"
  FOREIGN KEY ("tenantId") REFERENCES "tenants"("id")
  ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "staff_services"
  ADD CONSTRAINT "staff_services_tenantId_fkey"
  FOREIGN KEY ("tenantId") REFERENCES "tenants"("id")
  ON DELETE RESTRICT ON UPDATE CASCADE;

-- 5. RLS
ALTER TABLE "staff_working_hours" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "staff_working_hours" FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation_staff_working_hours ON "staff_working_hours"
  FOR ALL TO calon_app
  USING ("tenantId" = current_setting('app.tenant_id', true)::uuid)
  WITH CHECK ("tenantId" = current_setting('app.tenant_id', true)::uuid);

ALTER TABLE "staff_services" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "staff_services" FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation_staff_services ON "staff_services"
  FOR ALL TO calon_app
  USING ("tenantId" = current_setting('app.tenant_id', true)::uuid)
  WITH CHECK ("tenantId" = current_setting('app.tenant_id', true)::uuid);
