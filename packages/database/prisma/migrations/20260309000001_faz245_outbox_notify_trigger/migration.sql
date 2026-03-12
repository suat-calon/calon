-- ─────────────────────────────────────────────────────────────────────────────
-- FAZ 24.5: OUTBOX NOTIFY TRIGGER
-- ─────────────────────────────────────────────────────────────────────────────
-- Amaç:
--   event_outbox'a PENDING event INSERT edildiğinde pg_notify ile OutboxListenerService'e
--   anlık bildirim gönder. Bu sayede cron bekleme süresi (≤60s) → <50ms'ye düşer.
--
-- Güvenlik:
--   • scheduledFor IS NULL OR scheduledFor <= NOW()  → Zamanlanmış eventler notify edilmez.
--     Sweeper cron onları kendi zamanında alır.
--   • Status = 'PENDING' kontrolü: UPDATE veya diğer status'larda tetiklenme olmaz.
--
-- Kanal:
--   'outbox_pending_event' — OutboxListenerService bu kanalı dinler.
--
-- Payload:
--   {"eventId": "<uuid>", "tenantId": "<uuid>"}
--   Minimal payload: sadece routing için yeterli, tam veri OutboxRepository'den okunur.
-- ─────────────────────────────────────────────────────────────────────────────

-- 1. Trigger fonksiyonu oluştur (veya güncelle)
CREATE OR REPLACE FUNCTION notify_outbox_pending()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
DECLARE
  payload TEXT;
BEGIN
  -- Sadece PENDING status ve scheduledFor zamanı gelmiş eventleri bildir
  IF NEW.status = 'PENDING' AND (NEW."scheduledFor" IS NULL OR NEW."scheduledFor" <= NOW()) THEN
    payload := json_build_object(
      'eventId',  NEW.id,
      'tenantId', NEW."tenantId"
    )::text;

    PERFORM pg_notify('outbox_pending_event', payload);
  END IF;

  RETURN NEW;
END;
$$;

-- 2. Trigger'ı event_outbox tablosuna bağla (AFTER INSERT)
DROP TRIGGER IF EXISTS trg_notify_outbox_pending ON event_outbox;

CREATE TRIGGER trg_notify_outbox_pending
  AFTER INSERT ON event_outbox
  FOR EACH ROW
  EXECUTE FUNCTION notify_outbox_pending();
