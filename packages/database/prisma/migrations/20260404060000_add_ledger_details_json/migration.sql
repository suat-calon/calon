-- ─────────────────────────────────────────────────────────────────────────────
-- ADD: TransactionLedger.details — Structured checkout breakdown
-- ─────────────────────────────────────────────────────────────────────────────
-- Amaç:
--   Checkout sırasında oluşan ek kalemlerin (upsell, ürün, manuel kalem)
--   yapısal biçimde saklanması. Flat amount yanında işlenebilir breakdown.
--
-- Alan: details JSONB (nullable, varsayılan yok)
-- Eski kayıtlar: NULL olarak kalır — backward compatible
-- Append-only prensibi korunur — bu alan sadece CREATE sırasında set edilir
-- ─────────────────────────────────────────────────────────────────────────────

ALTER TABLE "transaction_ledger" ADD COLUMN "details" JSONB;
