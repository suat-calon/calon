-- =============================================================================
-- FAZ 14: Appointment Consistency Engine
-- Double-booking önleme: DB constraint + Redis lock + Transaction
-- =============================================================================

-- -----------------------------------------------------------------------------
-- 1. MEVCUT CONSTRAINT DOĞRULAMA
--    excl_no_staff_double_booking ve excl_no_room_double_booking Faz 0'dan beri
--    mevcut. Bu migration onları belgeler ve Faz 14 standart isimlerini ekler.
-- -----------------------------------------------------------------------------

-- Staff çakışma constraint'i: Faz 14 adıyla kayıt (IF NOT EXISTS)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'appointment_staff_timeslot_exclusion'
      AND conrelid = 'appointments'::regclass
  ) THEN
    -- excl_no_staff_double_booking zaten varsa aynı semantiği tekrarlama
    IF NOT EXISTS (
      SELECT 1 FROM pg_constraint
      WHERE conname = 'excl_no_staff_double_booking'
        AND conrelid = 'appointments'::regclass
    ) THEN
      ALTER TABLE "appointments"
        ADD CONSTRAINT appointment_staff_timeslot_exclusion
        EXCLUDE USING gist (
          "tenantId" WITH =,
          "staffId"  WITH =,
          tstzrange("startTime", "endTime") WITH &&
        );
    END IF;
  END IF;
END $$;

-- Oda çakışma constraint'i: Faz 14 adıyla kayıt (IF NOT EXISTS)
-- roomId NULL ise constraint bypass edilir (PostgreSQL EXCLUDE NULL semantiği)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'appointment_room_timeslot_exclusion'
      AND conrelid = 'appointments'::regclass
  ) THEN
    IF NOT EXISTS (
      SELECT 1 FROM pg_constraint
      WHERE conname = 'excl_no_room_double_booking'
        AND conrelid = 'appointments'::regclass
    ) THEN
      ALTER TABLE "appointments"
        ADD CONSTRAINT appointment_room_timeslot_exclusion
        EXCLUDE USING gist (
          "tenantId" WITH =,
          "roomId"   WITH =,
          tstzrange("startTime", "endTime") WITH &&
        );
    END IF;
  END IF;
END $$;

-- -----------------------------------------------------------------------------
-- 2. SLOT AVAILABILITY CACHE İÇİN COMPOSITE GiST INDEX
--    Availability sorgularında tenant+staff+zaman aralığı filtrelemesini hızlandırır.
--    availability:{tenantId}:{staffId}:{date} cache key'ini destekler.
-- -----------------------------------------------------------------------------
CREATE INDEX CONCURRENTLY IF NOT EXISTS
  idx_appointments_availability_gist
  ON "appointments" USING gist (
    "tenantId",
    "staffId",
    tstzrange("startTime", "endTime")
  )
  WHERE "isDeleted" = false
    AND status NOT IN ('CANCELLED', 'NO_SHOW', 'COMPLETED');

-- -----------------------------------------------------------------------------
-- 3. CONCURRENCY LOCK DOKÜMANi
--    Redis lock key formatı: lock:appointment:{tenantId}:{staffId}:{startTime}
--    TTL: 10 saniye (create transaction süresi)
--    Uygulama: AppointmentService.create() ve AppointmentService.reschedule()
--    Bu constraint uygulamanın Redis bağımlılığını belgeler.
-- -----------------------------------------------------------------------------
COMMENT ON CONSTRAINT excl_no_staff_double_booking ON "appointments" IS
  'FAZ 0+14: Staff double-booking son savunma hattı. Redis lock + transactional overlap check uygulama tarafında ön katman olarak çalışır.';

-- -----------------------------------------------------------------------------
-- 4. RESCHEDULE İÇİN SOFT-DELETE KONTROLÜ
--    Silinmiş randevuların GIST dışında kalmasını izleme view'i
-- -----------------------------------------------------------------------------
CREATE OR REPLACE VIEW v_active_appointments AS
  SELECT *
  FROM "appointments"
  WHERE "isDeleted" = false
    AND status NOT IN ('CANCELLED', 'NO_SHOW', 'COMPLETED');

COMMENT ON VIEW v_active_appointments IS
  'FAZ 14: Aktif (non-terminal, non-deleted) randevular. Availability cache invalidation trigger için referans.';
