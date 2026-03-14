-- ============================================================================
-- FAZ 19: İYZİCO ÖDEME MOTORU
-- AppointmentStatus enum genişletme + Service.requiresDeposit + Payment model
-- ============================================================================

-- 1. AppointmentStatus enum oluştur (init_steel_core TEXT kullandı; burada enum'a dönüştürülüyor)
DO $$ BEGIN
  CREATE TYPE "AppointmentStatus" AS ENUM (
    'PENDING', 'CONFIRMED', 'CHECKED_IN', 'IN_SERVICE',
    'COMPLETED', 'CANCELLED', 'NO_SHOW',
    'PENDING_PAYMENT', 'PAID'
  );
EXCEPTION WHEN duplicate_object THEN
  -- Enum zaten varsa sadece eksik değerleri ekle
  BEGIN
    ALTER TYPE "AppointmentStatus" ADD VALUE IF NOT EXISTS 'PENDING_PAYMENT';
  EXCEPTION WHEN others THEN NULL;
  END;
  BEGIN
    ALTER TYPE "AppointmentStatus" ADD VALUE IF NOT EXISTS 'PAID';
  EXCEPTION WHEN others THEN NULL;
  END;
END $$;

-- TEXT'ten enum'a sütun dönüşümü (IF TEXT tipindeyse)
DO $$ BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'appointments'
      AND column_name = 'status'
      AND data_type = 'text'
  ) THEN
    -- 1. status kolonuna bağlı tüm nesneleri geçici olarak kaldır
    DROP VIEW IF EXISTS v_active_appointments;
    ALTER TABLE "appointments" DROP CONSTRAINT IF EXISTS excl_no_staff_double_booking;
    ALTER TABLE "appointments" DROP CONSTRAINT IF EXISTS excl_no_room_double_booking;
    ALTER TABLE "appointments" DROP CONSTRAINT IF EXISTS appointment_staff_timeslot_exclusion;
    ALTER TABLE "appointments" DROP CONSTRAINT IF EXISTS appointment_room_timeslot_exclusion;
    -- status WHERE clause'u olan kısmi index'ler
    DROP INDEX IF EXISTS idx_appointments_availability_gist;
    DROP INDEX IF EXISTS idx_appointments_tenant_status;

    -- 2. DEFAULT kaldır (TEXT default → enum'a cast edilemez)
    ALTER TABLE "appointments" ALTER COLUMN "status" DROP DEFAULT;

    -- 3. Kolonu enum'a dönüştür
    ALTER TABLE "appointments"
      ALTER COLUMN "status" TYPE "AppointmentStatus"
      USING "status"::"AppointmentStatus";

    -- 4. Enum default'ı geri ekle
    ALTER TABLE "appointments"
      ALTER COLUMN "status" SET DEFAULT 'PENDING'::"AppointmentStatus";

    -- 5. GIST constraint'leri enum-uyumlu şekilde yeniden ekle
    ALTER TABLE "appointments"
      ADD CONSTRAINT excl_no_staff_double_booking
      EXCLUDE USING GIST (
        "tenantId" WITH =,
        "staffId"  WITH =,
        tstzrange("startTime", "endTime", '[)') WITH &&
      )
      WHERE (status NOT IN ('CANCELLED', 'NO_SHOW') AND "isDeleted" = FALSE);

    ALTER TABLE "appointments"
      ADD CONSTRAINT excl_no_room_double_booking
      EXCLUDE USING GIST (
        "tenantId" WITH =,
        "roomId"   WITH =,
        tstzrange("startTime", "endTime", '[)') WITH &&
      )
      WHERE (
        "roomId" IS NOT NULL
        AND status NOT IN ('CANCELLED', 'NO_SHOW')
        AND "isDeleted" = FALSE
      );

    -- 6. Index'leri yeniden oluştur
    CREATE INDEX idx_appointments_tenant_status
      ON "appointments"("tenantId", "status");

    CREATE INDEX idx_appointments_availability_gist
      ON "appointments" USING gist (
        "tenantId",
        "staffId",
        tstzrange("startTime", "endTime")
      )
      WHERE "isDeleted" = false
        AND status NOT IN ('CANCELLED', 'NO_SHOW', 'COMPLETED');

    -- 7. View'u enum tipiyle yeniden oluştur
    CREATE OR REPLACE VIEW v_active_appointments AS
      SELECT * FROM "appointments"
      WHERE "isDeleted" = false
        AND status NOT IN ('CANCELLED', 'NO_SHOW', 'COMPLETED');
  END IF;
END $$;

-- 2. Service tablosuna requiresDeposit kolonu ekle
ALTER TABLE "services"
  ADD COLUMN IF NOT EXISTS "requiresDeposit" BOOLEAN NOT NULL DEFAULT false;

-- 3. PaymentStatus enum oluştur
DO $$ BEGIN
  CREATE TYPE "PaymentStatus" AS ENUM ('PENDING', 'PAID', 'FAILED', 'REFUNDED');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- 4. payments tablosu oluştur
CREATE TABLE IF NOT EXISTS "payments" (
  "id"            UUID          NOT NULL DEFAULT gen_random_uuid(),
  "tenantId"      UUID          NOT NULL,
  "appointmentId" UUID          NOT NULL,
  "providerId"    TEXT,
  "amount"        DECIMAL(10,2) NOT NULL,
  "currency"      TEXT          NOT NULL DEFAULT 'TRY',
  "status"        "PaymentStatus" NOT NULL DEFAULT 'PENDING',
  "paymentUrl"    TEXT,
  "providerMeta"  JSONB,
  "createdAt"     TIMESTAMPTZ   NOT NULL DEFAULT NOW(),
  "updatedAt"     TIMESTAMPTZ   NOT NULL DEFAULT NOW(),

  CONSTRAINT "payments_pkey"          PRIMARY KEY ("id"),
  CONSTRAINT "payments_appointmentId_key" UNIQUE ("appointmentId"),
  CONSTRAINT "payments_providerId_key"    UNIQUE ("providerId"),
  CONSTRAINT "payments_tenantId_fkey"
    FOREIGN KEY ("tenantId")      REFERENCES "tenants"("id")      ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "payments_appointmentId_fkey"
    FOREIGN KEY ("appointmentId") REFERENCES "appointments"("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

CREATE INDEX IF NOT EXISTS "payments_tenantId_idx" ON "payments"("tenantId");

-- 5. RLS — tenant isolation
ALTER TABLE "payments" ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "tenant_isolation_payments" ON "payments";
CREATE POLICY "tenant_isolation_payments" ON "payments"
  USING (
    "tenantId" = NULLIF(current_setting('app.tenant_id', true), '')::UUID
  );
