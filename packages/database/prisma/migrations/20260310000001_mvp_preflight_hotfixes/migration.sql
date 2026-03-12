-- ──────────────────────────────────────────────────────────────────────────────
-- MVP-GATE-1 Pre-flight Hotfixes
-- Migration: 20260310000001_mvp_preflight_hotfixes
-- ──────────────────────────────────────────────────────────────────────────────
-- Fix 5: Referral self-fraud DB constraint
--   Bir müşteri kendisini referral ile davet edemez.
--   Bu kısıt uygulama katmanındaki kontrollerin yanı sıra veritabanı seviyesinde
--   güvence sağlar — kodu bypass eden doğrudan DB yazımlarını da engeller.
-- ──────────────────────────────────────────────────────────────────────────────

ALTER TABLE "referrals"
  ADD CONSTRAINT "no_self_referral"
  CHECK ("referrerCustomerId" <> "referredCustomerId");
