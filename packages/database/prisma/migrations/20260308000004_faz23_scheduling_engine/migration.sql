-- =============================================================================
-- FAZ 23: SCHEDULING ENGINE — Deterministic Slot Booking Core
-- =============================================================================
-- Değişiklikler:
--   1. btree_gist extension (UUID + tstzrange EXCLUDE için zorunlu)
--   2. Yeni enum'lar: AppointmentHoldStatus, StaffShiftType, ResourceType
--   3. appointment_holds tablosu + GIST EXCLUDE (ACTIVE hold çakışmaları engeller)
--   4. staff_shifts: tenantId + shiftType sütunları eklendi
--   5. appointments: eski GIST kısıtları düşürüldü → status-filtered yenileri eklendi
--   6. service_resource_requirements tablosu (minimal, Faz 24'te genişletilir)
-- =============================================================================

-- =============================================================================
-- 1. btree_gist extension
-- =============================================================================
-- btree_gist: UUID gibi btree türlerini GIST EXCLUDE içinde kullanmaya izin verir.
-- Bu olmadan "tenantId WITH =" ifadesi GIST exclude constraint içinde çalışmaz.
CREATE EXTENSION IF NOT EXISTS btree_gist;

-- =============================================================================
-- 2. Yeni enum'lar
-- =============================================================================

CREATE TYPE "AppointmentHoldStatus" AS ENUM ('ACTIVE', 'CONSUMED', 'EXPIRED', 'RELEASED');
CREATE TYPE "StaffShiftType"        AS ENUM ('WORKING', 'LEAVE', 'BLOCK');
CREATE TYPE "ResourceType"          AS ENUM ('ROOM', 'EQUIPMENT');

-- =============================================================================
-- 3. appointment_holds tablosu
-- =============================================================================

CREATE TABLE "appointment_holds" (
  "id"        UUID                    NOT NULL DEFAULT gen_random_uuid(),
  "tenantId"  UUID                    NOT NULL,
  "staffId"   UUID                    NOT NULL,
  "serviceId" UUID                    NOT NULL,
  "startTime" TIMESTAMPTZ             NOT NULL,
  "endTime"   TIMESTAMPTZ             NOT NULL,
  "expiresAt" TIMESTAMPTZ             NOT NULL,
  "status"    "AppointmentHoldStatus" NOT NULL DEFAULT 'ACTIVE',
  "holdToken" TEXT,
  "createdAt" TIMESTAMPTZ             NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "appointment_holds_pkey" PRIMARY KEY ("id")
);

-- Btree indeksler (Prisma findMany sorguları)
CREATE INDEX "appointment_holds_tenantId_staffId_startTime_idx"
  ON "appointment_holds"("tenantId", "staffId", "startTime");

CREATE INDEX "appointment_holds_tenantId_status_idx"
  ON "appointment_holds"("tenantId", "status");

CREATE INDEX "appointment_holds_expiresAt_idx"
  ON "appointment_holds"("expiresAt");

-- Partial btree index: ACTIVE hold'lar için range overlap sorguları
-- Prisma: startTime < ? AND endTime > ? (açık slot kontrolü)
CREATE INDEX "appointment_holds_active_overlap_idx"
  ON "appointment_holds"("tenantId", "staffId", "startTime", "endTime")
  WHERE (status = 'ACTIVE');

-- NOT: Aşağıdaki EXCLUDE constraint örtük bir GiST index oluşturur.
-- PostgreSQL bu index'i hem constraint enforcement hem && sorguları için kullanır.
-- Ayrı bir açık GiST index oluşturmak gereksiz (disk/bellek israfı + insert yükü).

-- GIST EXCLUDE: Aynı tenant + staff için ACTIVE hold'lar çakışamaz
ALTER TABLE "appointment_holds"
  ADD CONSTRAINT holds_staff_overlap_excl
  EXCLUDE USING gist (
    "tenantId" WITH =,
    "staffId"  WITH =,
    tstzrange("startTime", "endTime") WITH &&
  )
  WHERE (status = 'ACTIVE');

-- FK kısıtları
ALTER TABLE "appointment_holds"
  ADD CONSTRAINT "appointment_holds_tenantId_fkey"
  FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON DELETE RESTRICT;

ALTER TABLE "appointment_holds"
  ADD CONSTRAINT "appointment_holds_staffId_fkey"
  FOREIGN KEY ("staffId") REFERENCES "staff_profiles"("id") ON DELETE RESTRICT;

ALTER TABLE "appointment_holds"
  ADD CONSTRAINT "appointment_holds_serviceId_fkey"
  FOREIGN KEY ("serviceId") REFERENCES "services"("id") ON DELETE RESTRICT;

-- Row Level Security
ALTER TABLE "appointment_holds" ENABLE ROW LEVEL SECURITY;

CREATE POLICY tenant_isolation ON "appointment_holds"
  FOR ALL TO calon_app
  USING      ("tenantId" = current_setting('app.tenant_id', true)::uuid)
  WITH CHECK ("tenantId" = current_setting('app.tenant_id', true)::uuid);

-- =============================================================================
-- 4. staff_shifts: tenantId + shiftType sütunları
-- =============================================================================

ALTER TABLE "staff_shifts"
  ADD COLUMN "tenantId"  UUID             REFERENCES "tenants"("id") ON DELETE RESTRICT,
  ADD COLUMN "shiftType" "StaffShiftType" NOT NULL DEFAULT 'WORKING';

-- Backfill: tenantId'yi staff_profiles'tan kopyala
UPDATE "staff_shifts" ss
  SET "tenantId" = sp."tenantId"
  FROM "staff_profiles" sp
  WHERE ss."staffId" = sp.id;

-- Backfill tamamlandı → NOT NULL yap
ALTER TABLE "staff_shifts" ALTER COLUMN "tenantId" SET NOT NULL;

-- Eski indeksi düşür, tenantId önde gelen yenisini ekle
DROP INDEX IF EXISTS "staff_shifts_staffId_date_idx";

CREATE INDEX "staff_shifts_tenantId_staffId_date_idx"
  ON "staff_shifts"("tenantId", "staffId", "date");

-- RLS (eğer yoksa ekle)
ALTER TABLE "staff_shifts" ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE tablename = 'staff_shifts' AND policyname = 'tenant_isolation'
  ) THEN
    EXECUTE $policy$
      CREATE POLICY tenant_isolation ON "staff_shifts"
        FOR ALL TO calon_app
        USING      ("tenantId" = current_setting('app.tenant_id', true)::uuid)
        WITH CHECK ("tenantId" = current_setting('app.tenant_id', true)::uuid)
    $policy$;
  END IF;
END $$;

-- =============================================================================
-- 5. appointments: status-filtered GIST kısıtları
-- =============================================================================
-- Eski kısıtlar CANCELLED/NO_SHOW/COMPLETED slotları da bloke ediyordu.
-- Yeni kısıtlar yalnızca aktif randevuları kontrol eder.

-- Eski kısıtları idempotent olarak düşür
DO $$ BEGIN
  IF EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'appointment_staff_timeslot_exclusion'
      AND conrelid = 'appointments'::regclass
  ) THEN
    ALTER TABLE "appointments" DROP CONSTRAINT appointment_staff_timeslot_exclusion;
  END IF;
END $$;

DO $$ BEGIN
  IF EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'excl_no_staff_double_booking'
      AND conrelid = 'appointments'::regclass
  ) THEN
    ALTER TABLE "appointments" DROP CONSTRAINT excl_no_staff_double_booking;
  END IF;
END $$;

DO $$ BEGIN
  IF EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'appointment_room_timeslot_exclusion'
      AND conrelid = 'appointments'::regclass
  ) THEN
    ALTER TABLE "appointments" DROP CONSTRAINT appointment_room_timeslot_exclusion;
  END IF;
END $$;

DO $$ BEGIN
  IF EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'excl_no_room_double_booking'
      AND conrelid = 'appointments'::regclass
  ) THEN
    ALTER TABLE "appointments" DROP CONSTRAINT excl_no_room_double_booking;
  END IF;
END $$;

-- Yeni status-filtered GIST kısıtı (staff çift rezervasyon)
-- CANCELLED / NO_SHOW / COMPLETED ve silinmiş randevular slotu serbest bırakır
ALTER TABLE "appointments"
  ADD CONSTRAINT appt_staff_overlap_excl
  EXCLUDE USING gist (
    "tenantId" WITH =,
    "staffId"  WITH =,
    tstzrange("startTime", "endTime") WITH &&
  )
  WHERE (
    status NOT IN ('CANCELLED', 'NO_SHOW', 'COMPLETED')
    AND "isDeleted" = false
  );

-- Yeni status-filtered GIST kısıtı (oda çift rezervasyon)
-- roomId NULL ise kısıt uygulanmaz
ALTER TABLE "appointments"
  ADD CONSTRAINT appt_room_overlap_excl
  EXCLUDE USING gist (
    "tenantId" WITH =,
    "roomId"   WITH =,
    tstzrange("startTime", "endTime") WITH &&
  )
  WHERE (
    "roomId" IS NOT NULL
    AND status NOT IN ('CANCELLED', 'NO_SHOW', 'COMPLETED')
    AND "isDeleted" = false
  );

-- =============================================================================
-- 6. service_resource_requirements tablosu
-- =============================================================================

CREATE TABLE "service_resource_requirements" (
  "id"           UUID           NOT NULL DEFAULT gen_random_uuid(),
  "serviceId"    UUID           NOT NULL,
  "resourceType" "ResourceType" NOT NULL,
  "resourceId"   UUID,
  "quantity"     INTEGER        NOT NULL DEFAULT 1,
  CONSTRAINT "service_resource_requirements_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "srr_serviceId_idx"
  ON "service_resource_requirements"("serviceId");

ALTER TABLE "service_resource_requirements"
  ADD CONSTRAINT "srr_serviceId_fkey"
  FOREIGN KEY ("serviceId") REFERENCES "services"("id") ON DELETE CASCADE;
