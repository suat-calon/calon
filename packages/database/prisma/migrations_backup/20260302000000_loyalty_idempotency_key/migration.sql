-- =============================================================================
-- FAZ 11: LoyaltyTransaction — İdempotency Key sütunu
-- Amaç: Aynı loyalty kazanımı/harcamasının iki kez uygulanmasını engelle.
-- Strateji: UNIQUE kısıtlı sütun; BullMQ retry veya double-click'te P2002 fırlatır.
-- =============================================================================

ALTER TABLE "loyalty_transactions"
  ADD COLUMN IF NOT EXISTS "idempotencyKey" TEXT;

CREATE UNIQUE INDEX IF NOT EXISTS "loyalty_transactions_idempotencyKey_key"
  ON "loyalty_transactions" ("idempotencyKey");
