-- ─────────────────────────────────────────────────────────────────────────────
-- FAZ 24 HARDENING: DELIVERY UNIQUE INDEX
-- ─────────────────────────────────────────────────────────────────────────────
-- Amaç:
--   Her (eventId, channel) çifti için yalnızca bir delivery kaydı olmasını
--   DB seviyesinde garanti eder. Application katmanında P2002 yakalanarak
--   idempotent INSERT davranışı sağlanır.
--
-- Etki:
--   Dispatcher aynı event için aynı kanalda ikinci kez delivery oluşturmaya
--   çalışırsa INSERT sessizce atlanır (ON CONFLICT DO NOTHING semantiği).
-- ─────────────────────────────────────────────────────────────────────────────

-- Mevcut non-unique index'i kaldır (varsa)
DROP INDEX IF EXISTS event_deliveries_eventId_channel_idx;

-- Unique constraint olarak yeniden oluştur
CREATE UNIQUE INDEX "event_deliveries_eventId_channel_key"
  ON event_deliveries ("eventId", channel);
