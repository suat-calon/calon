-- ─────────────────────────────────────────────────────────────────────────────
-- RESTORE: OUTBOX NOTIFY TRIGGER
-- ─────────────────────────────────────────────────────────────────────────────
-- Bu migration, clean baseline (20260314) sırasında kaybolan outbox NOTIFY
-- trigger hattını geri getirir.
--
-- Orijinal tanım: migrations_backup/20260309000001_faz245_outbox_notify_trigger
--
-- Amaç:
--   event_outbox'a PENDING event INSERT edildiğinde pg_notify ile
--   OutboxListenerService'e anlık bildirim gönder.
--   Sweeper cron (5-min) fallback olarak korunur.
--
-- Kanal: 'outbox_pending_event'
-- Payload: {"eventId": "<uuid>", "tenantId": "<uuid>"} (minimal routing)
--
-- Güvenlik:
--   • scheduledFor yaklaşık NOW() civarında veya geçmişte → immediate notify
--   • scheduledFor gelecekte (>1s) → notify yapma, sweeper zamanında alır
--   • status = 'PENDING' kontrolü → UPDATE veya diğer status'larda tetiklenme olmaz
--
-- Timestamp(3) uyumluluğu:
--   event_outbox.scheduledFor timestamp(3) hassasiyetinde (ms'ye yuvarlanır).
--   NOW() microsecond hassasiyetindedir. scheduledFor = NOW() olarak INSERT
--   edildiğinde, ms yuvarlama sonucu scheduledFor NOW()'dan birkaç µs büyük
--   olabilir. 1 saniyelik tolerans bu race condition'ı ortadan kaldırır.
--   Sweeper cron (5-min) yine de safety net olarak kalır.
--
-- İdempotent: CREATE OR REPLACE + DROP TRIGGER IF EXISTS
-- ─────────────────────────────────────────────────────────────────────────────

-- 1. Trigger fonksiyonu oluştur (veya güncelle)
CREATE OR REPLACE FUNCTION notify_outbox_pending()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
DECLARE
  payload TEXT;
BEGIN
  -- 1 saniyelik tolerans: timestamp(3) yuvarlama vs NOW() microsecond race'i önler.
  -- Gelecek zamanlanmış eventler (>1s) notify edilmez; sweeper onları kendi zamanında alır.
  IF NEW.status = 'PENDING' AND (NEW."scheduledFor" IS NULL OR NEW."scheduledFor" <= NOW() + interval '1 second') THEN
    payload := json_build_object(
      'eventId',  NEW.id,
      'tenantId', NEW."tenantId"
    )::text;

    PERFORM pg_notify('outbox_pending_event', payload);
  END IF;

  RETURN NEW;
END;
$$;

-- 2. Trigger'ı event_outbox tablosuna bağla (AFTER INSERT, row-level)
DROP TRIGGER IF EXISTS trg_notify_outbox_pending ON event_outbox;

CREATE TRIGGER trg_notify_outbox_pending
  AFTER INSERT ON event_outbox
  FOR EACH ROW
  EXECUTE FUNCTION notify_outbox_pending();
