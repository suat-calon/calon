-- ════════════════════════════════════════════════════════════
-- P5-1: GIST EXCLUDE Constraints + AppointmentHold RLS
-- ════════════════════════════════════════════════════════════
-- Migration squash (20260314204129_init_clean_baseline) sırasında
-- btree_gist extension ve tüm GIST constraint'ler kayboldu.
--
-- Triple-Layer Slot Security:
--   L1: Redis NX (fast-path, ~1ms)
--   L2: Application overlap check (kullanıcı dostu 409)
--   L3: PostgreSQL GIST EXCLUDE (hard guard — bu dosya)
-- ════════════════════════════════════════════════════════════

-- ── 1. btree_gist Extension ─────────────────────────────────
-- UUID (=) ile range (&&) birleştirmek için zorunlu.
CREATE EXTENSION IF NOT EXISTS btree_gist;

-- ── 2. Appointment Staff Overlap Constraint ─────────────────
-- Aynı tenant + personel + zaman aralığında aktif randevu çakışması engeller.
-- Half-open interval [start, end): bitişik randevular ÇAKIŞMAZ.
-- tsrange kullanılır (sütunlar timestamp without time zone).
-- COMPLETED kasıtlı olarak hariç: tamamlanan randevu slotu serbest bırakır.
ALTER TABLE "appointments"
  ADD CONSTRAINT appt_staff_overlap_excl
  EXCLUDE USING gist (
    "tenantId" WITH =,
    "staffId"  WITH =,
    tsrange("startTime", "endTime") WITH &&
  )
  WHERE (
    status NOT IN ('CANCELLED', 'NO_SHOW', 'COMPLETED')
    AND "isDeleted" = false
  );

-- ── 3. Appointment Room Overlap Constraint ──────────────────
-- Aynı tenant + oda + zaman aralığında aktif randevu çakışması engeller.
-- roomId NULL ise constraint uygulanmaz (NULL != NULL).
ALTER TABLE "appointments"
  ADD CONSTRAINT appt_room_overlap_excl
  EXCLUDE USING gist (
    "tenantId" WITH =,
    "roomId"   WITH =,
    tsrange("startTime", "endTime") WITH &&
  )
  WHERE (
    "roomId" IS NOT NULL
    AND status NOT IN ('CANCELLED', 'NO_SHOW', 'COMPLETED')
    AND "isDeleted" = false
  );

-- ── 4. Hold Overlap Constraint ──────────────────────────────
-- Aynı tenant + personel + zaman aralığında aktif hold çakışması engeller.
-- tsrange kullanılır (sütunlar timestamp without time zone).
ALTER TABLE "appointment_holds"
  ADD CONSTRAINT hold_staff_overlap_excl
  EXCLUDE USING gist (
    "tenantId" WITH =,
    "staffId"  WITH =,
    tsrange("startTime", "endTime") WITH &&
  )
  WHERE (status = 'ACTIVE');

-- ── 5. AppointmentHold RLS ──────────────────────────────────
-- Defense-in-depth: hold service kendi tenantId filtresi yapıyor
-- ama RLS ikinci katman olarak eklenir.
ALTER TABLE "appointment_holds" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "appointment_holds" FORCE ROW LEVEL SECURITY;

CREATE POLICY tenant_isolation_appointment_holds
  ON "appointment_holds"
  FOR ALL TO calon_app
  USING ("tenantId" = current_setting('app.tenant_id', true)::uuid)
  WITH CHECK ("tenantId" = current_setting('app.tenant_id', true)::uuid);
