-- =============================================================================
-- FAZ 14.1 HOTFIX: GIST Constraint İptal + Silinme Filtresi
-- Sorun: Eski constraint WHERE filtresi olmadığından CANCELLED/NO_SHOW/isDeleted=true
--        randevular da çakışma sayılıyordu. Bu migration eski constraint'leri düşürüp
--        yeni, filtrelenmiş versiyonlarını ekler.
-- =============================================================================

-- btree_gist extension: UUID + range GIST exclude için gerekli
CREATE EXTENSION IF NOT EXISTS btree_gist;

-- Eski kısıtlamaları temizle
ALTER TABLE "appointments" DROP CONSTRAINT IF EXISTS "excl_no_staff_double_booking";
ALTER TABLE "appointments" DROP CONSTRAINT IF EXISTS "excl_no_room_double_booking";

-- İptal ve silinmiş kayıtları YOK SAYAN yeni Staff kısıtlaması
-- Not: startTime/endTime kolonları TIMESTAMPTZ → tstzrange kullanılır
-- btree_gist extension gereklidir (CREATE EXTENSION IF NOT EXISTS btree_gist)
ALTER TABLE "appointments"
  ADD CONSTRAINT "excl_no_staff_double_booking"
  EXCLUDE USING gist (
    "tenantId" WITH =,
    "staffId"  WITH =,
    tstzrange("startTime", "endTime") WITH &&
  ) WHERE (status NOT IN ('CANCELLED', 'NO_SHOW') AND "isDeleted" = false);

-- İptal ve silinmiş kayıtları YOK SAYAN yeni Room kısıtlaması
ALTER TABLE "appointments"
  ADD CONSTRAINT "excl_no_room_double_booking"
  EXCLUDE USING gist (
    "tenantId" WITH =,
    "roomId"   WITH =,
    tstzrange("startTime", "endTime") WITH &&
  ) WHERE (status NOT IN ('CANCELLED', 'NO_SHOW') AND "isDeleted" = false AND "roomId" IS NOT NULL);

-- Constraint açıklamalarını güncelle
COMMENT ON CONSTRAINT excl_no_staff_double_booking ON "appointments" IS
  'FAZ 14.1: Staff double-booking son savunma hattı. CANCELLED/NO_SHOW/isDeleted satırlarını dışlar.';

COMMENT ON CONSTRAINT excl_no_room_double_booking ON "appointments" IS
  'FAZ 14.1: Oda double-booking son savunma hattı. CANCELLED/NO_SHOW/isDeleted/NULL-room satırlarını dışlar.';
