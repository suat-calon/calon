-- ════════════════════════════════════════════════════════════
-- P5-2.1: GRACEFUL RLS POLICIES — NULLIF Pattern
-- ════════════════════════════════════════════════════════════
-- Sorun: Interceptor artık set_config YAPMIYOR (filter-only).
-- Eski policy: current_setting(...)::uuid → boş string ''::uuid
-- cast hatası → 500 Internal Server Error.
--
-- Çözüm: NULLIF(current_setting('app.tenant_id', true), '')::uuid
--   - Boş string → NULL → uuid = NULL → false → satır dönmez
--   - set_config yapılmışsa → normal uuid karşılaştırma
--   - Defense-in-depth korunur: WHERE filtre (Katman 1) + RLS (Katman 2)
--
-- $tenantTransaction helper'ı interactive tx'lerde set_config yapar →
-- RLS policy o zaman gerçek tenant filtresi uygular.
-- ════════════════════════════════════════════════════════════

-- ── 1. locations ──────────────────────────────────────────
DROP POLICY IF EXISTS tenant_isolation_locations ON "locations";
CREATE POLICY tenant_isolation_locations ON "locations"
  FOR ALL TO calon_app
  USING ("tenantId" = NULLIF(current_setting('app.tenant_id', true), '')::uuid)
  WITH CHECK ("tenantId" = NULLIF(current_setting('app.tenant_id', true), '')::uuid);

-- ── 2. rooms ──────────────────────────────────────────────
DROP POLICY IF EXISTS tenant_isolation_rooms ON "rooms";
CREATE POLICY tenant_isolation_rooms ON "rooms"
  FOR ALL TO calon_app
  USING ("tenantId" = NULLIF(current_setting('app.tenant_id', true), '')::uuid)
  WITH CHECK ("tenantId" = NULLIF(current_setting('app.tenant_id', true), '')::uuid);

-- ── 3. user_tenants ───────────────────────────────────────
DROP POLICY IF EXISTS tenant_isolation_user_tenants ON "user_tenants";
CREATE POLICY tenant_isolation_user_tenants ON "user_tenants"
  FOR ALL TO calon_app
  USING ("tenantId" = NULLIF(current_setting('app.tenant_id', true), '')::uuid)
  WITH CHECK ("tenantId" = NULLIF(current_setting('app.tenant_id', true), '')::uuid);

-- ── 4. staff_profiles ─────────────────────────────────────
DROP POLICY IF EXISTS tenant_isolation_staff_profiles ON "staff_profiles";
CREATE POLICY tenant_isolation_staff_profiles ON "staff_profiles"
  FOR ALL TO calon_app
  USING ("tenantId" = NULLIF(current_setting('app.tenant_id', true), '')::uuid)
  WITH CHECK ("tenantId" = NULLIF(current_setting('app.tenant_id', true), '')::uuid);

-- ── 5. staff_shifts ───────────────────────────────────────
DROP POLICY IF EXISTS tenant_isolation_staff_shifts ON "staff_shifts";
CREATE POLICY tenant_isolation_staff_shifts ON "staff_shifts"
  FOR ALL TO calon_app
  USING ("tenantId" = NULLIF(current_setting('app.tenant_id', true), '')::uuid)
  WITH CHECK ("tenantId" = NULLIF(current_setting('app.tenant_id', true), '')::uuid);

-- ── 6. service_categories ─────────────────────────────────
DROP POLICY IF EXISTS tenant_isolation_service_categories ON "service_categories";
CREATE POLICY tenant_isolation_service_categories ON "service_categories"
  FOR ALL TO calon_app
  USING ("tenantId" = NULLIF(current_setting('app.tenant_id', true), '')::uuid)
  WITH CHECK ("tenantId" = NULLIF(current_setting('app.tenant_id', true), '')::uuid);

-- ── 7. services ───────────────────────────────────────────
DROP POLICY IF EXISTS tenant_isolation_services ON "services";
CREATE POLICY tenant_isolation_services ON "services"
  FOR ALL TO calon_app
  USING ("tenantId" = NULLIF(current_setting('app.tenant_id', true), '')::uuid)
  WITH CHECK ("tenantId" = NULLIF(current_setting('app.tenant_id', true), '')::uuid);

-- ── 8. products ───────────────────────────────────────────
DROP POLICY IF EXISTS tenant_isolation_products ON "products";
CREATE POLICY tenant_isolation_products ON "products"
  FOR ALL TO calon_app
  USING ("tenantId" = NULLIF(current_setting('app.tenant_id', true), '')::uuid)
  WITH CHECK ("tenantId" = NULLIF(current_setting('app.tenant_id', true), '')::uuid);

-- ── 9. stock_logs ─────────────────────────────────────────
DROP POLICY IF EXISTS tenant_isolation_stock_logs ON "stock_logs";
CREATE POLICY tenant_isolation_stock_logs ON "stock_logs"
  FOR ALL TO calon_app
  USING ("tenantId" = NULLIF(current_setting('app.tenant_id', true), '')::uuid)
  WITH CHECK ("tenantId" = NULLIF(current_setting('app.tenant_id', true), '')::uuid);

-- ── 10. customers ─────────────────────────────────────────
DROP POLICY IF EXISTS tenant_isolation_customers ON "customers";
CREATE POLICY tenant_isolation_customers ON "customers"
  FOR ALL TO calon_app
  USING ("tenantId" = NULLIF(current_setting('app.tenant_id', true), '')::uuid)
  WITH CHECK ("tenantId" = NULLIF(current_setting('app.tenant_id', true), '')::uuid);

-- ── 11. appointments ──────────────────────────────────────
DROP POLICY IF EXISTS tenant_isolation_appointments ON "appointments";
CREATE POLICY tenant_isolation_appointments ON "appointments"
  FOR ALL TO calon_app
  USING ("tenantId" = NULLIF(current_setting('app.tenant_id', true), '')::uuid)
  WITH CHECK ("tenantId" = NULLIF(current_setting('app.tenant_id', true), '')::uuid);

-- ── 12. transaction_ledger ────────────────────────────────
DROP POLICY IF EXISTS tenant_isolation_transaction_ledger ON "transaction_ledger";
CREATE POLICY tenant_isolation_transaction_ledger ON "transaction_ledger"
  FOR ALL TO calon_app
  USING ("tenantId" = NULLIF(current_setting('app.tenant_id', true), '')::uuid)
  WITH CHECK ("tenantId" = NULLIF(current_setting('app.tenant_id', true), '')::uuid);

-- ── 13. commission_logs ───────────────────────────────────
DROP POLICY IF EXISTS tenant_isolation_commission_logs ON "commission_logs";
CREATE POLICY tenant_isolation_commission_logs ON "commission_logs"
  FOR ALL TO calon_app
  USING ("tenantId" = NULLIF(current_setting('app.tenant_id', true), '')::uuid)
  WITH CHECK ("tenantId" = NULLIF(current_setting('app.tenant_id', true), '')::uuid);

-- ── 14. loyalty_transactions ──────────────────────────────
DROP POLICY IF EXISTS tenant_isolation_loyalty_transactions ON "loyalty_transactions";
CREATE POLICY tenant_isolation_loyalty_transactions ON "loyalty_transactions"
  FOR ALL TO calon_app
  USING ("tenantId" = NULLIF(current_setting('app.tenant_id', true), '')::uuid)
  WITH CHECK ("tenantId" = NULLIF(current_setting('app.tenant_id', true), '')::uuid);

-- ── 15. consent_forms ─────────────────────────────────────
DROP POLICY IF EXISTS tenant_isolation_consent_forms ON "consent_forms";
CREATE POLICY tenant_isolation_consent_forms ON "consent_forms"
  FOR ALL TO calon_app
  USING ("tenantId" = NULLIF(current_setting('app.tenant_id', true), '')::uuid)
  WITH CHECK ("tenantId" = NULLIF(current_setting('app.tenant_id', true), '')::uuid);

-- ── 16. refresh_tokens ────────────────────────────────────
DROP POLICY IF EXISTS tenant_isolation_refresh_tokens ON "refresh_tokens";
CREATE POLICY tenant_isolation_refresh_tokens ON "refresh_tokens"
  FOR ALL TO calon_app
  USING ("tenantId" = NULLIF(current_setting('app.tenant_id', true), '')::uuid)
  WITH CHECK ("tenantId" = NULLIF(current_setting('app.tenant_id', true), '')::uuid);

-- ── 17. idempotency_keys ──────────────────────────────────
DROP POLICY IF EXISTS tenant_isolation_idempotency_keys ON "idempotency_keys";
CREATE POLICY tenant_isolation_idempotency_keys ON "idempotency_keys"
  FOR ALL TO calon_app
  USING ("tenantId" = NULLIF(current_setting('app.tenant_id', true), '')::uuid)
  WITH CHECK ("tenantId" = NULLIF(current_setting('app.tenant_id', true), '')::uuid);

-- ── 18. audit_logs ────────────────────────────────────────
DROP POLICY IF EXISTS tenant_isolation_audit_logs ON "audit_logs";
CREATE POLICY tenant_isolation_audit_logs ON "audit_logs"
  FOR ALL TO calon_app
  USING ("tenantId" = NULLIF(current_setting('app.tenant_id', true), '')::uuid)
  WITH CHECK ("tenantId" = NULLIF(current_setting('app.tenant_id', true), '')::uuid);

-- ── 19. messages ──────────────────────────────────────────
DROP POLICY IF EXISTS tenant_isolation_messages ON "messages";
CREATE POLICY tenant_isolation_messages ON "messages"
  FOR ALL TO calon_app
  USING ("tenantId" = NULLIF(current_setting('app.tenant_id', true), '')::uuid)
  WITH CHECK ("tenantId" = NULLIF(current_setting('app.tenant_id', true), '')::uuid);

-- ── 20. campaign_templates ────────────────────────────────
DROP POLICY IF EXISTS tenant_isolation_campaign_templates ON "campaign_templates";
CREATE POLICY tenant_isolation_campaign_templates ON "campaign_templates"
  FOR ALL TO calon_app
  USING ("tenantId" = NULLIF(current_setting('app.tenant_id', true), '')::uuid)
  WITH CHECK ("tenantId" = NULLIF(current_setting('app.tenant_id', true), '')::uuid);

-- ── 21. customer_photos ───────────────────────────────────
DROP POLICY IF EXISTS tenant_isolation_customer_photos ON "customer_photos";
CREATE POLICY tenant_isolation_customer_photos ON "customer_photos"
  FOR ALL TO calon_app
  USING ("tenantId" = NULLIF(current_setting('app.tenant_id', true), '')::uuid)
  WITH CHECK ("tenantId" = NULLIF(current_setting('app.tenant_id', true), '')::uuid);

-- ── 22. referrals ─────────────────────────────────────────
DROP POLICY IF EXISTS tenant_isolation_referrals ON "referrals";
CREATE POLICY tenant_isolation_referrals ON "referrals"
  FOR ALL TO calon_app
  USING ("tenantId" = NULLIF(current_setting('app.tenant_id', true), '')::uuid)
  WITH CHECK ("tenantId" = NULLIF(current_setting('app.tenant_id', true), '')::uuid);

-- ── 23. payments ──────────────────────────────────────────
DROP POLICY IF EXISTS tenant_isolation_payments ON "payments";
CREATE POLICY tenant_isolation_payments ON "payments"
  FOR ALL TO calon_app
  USING ("tenantId" = NULLIF(current_setting('app.tenant_id', true), '')::uuid)
  WITH CHECK ("tenantId" = NULLIF(current_setting('app.tenant_id', true), '')::uuid);

-- ── 24. staff_working_hours ───────────────────────────────
DROP POLICY IF EXISTS tenant_isolation_staff_working_hours ON "staff_working_hours";
CREATE POLICY tenant_isolation_staff_working_hours ON "staff_working_hours"
  FOR ALL TO calon_app
  USING ("tenantId" = NULLIF(current_setting('app.tenant_id', true), '')::uuid)
  WITH CHECK ("tenantId" = NULLIF(current_setting('app.tenant_id', true), '')::uuid);

-- ── 25. staff_services ────────────────────────────────────
DROP POLICY IF EXISTS tenant_isolation_staff_services ON "staff_services";
CREATE POLICY tenant_isolation_staff_services ON "staff_services"
  FOR ALL TO calon_app
  USING ("tenantId" = NULLIF(current_setting('app.tenant_id', true), '')::uuid)
  WITH CHECK ("tenantId" = NULLIF(current_setting('app.tenant_id', true), '')::uuid);

-- ── 26. appointment_holds ─────────────────────────────────
DROP POLICY IF EXISTS tenant_isolation_appointment_holds ON "appointment_holds";
CREATE POLICY tenant_isolation_appointment_holds ON "appointment_holds"
  FOR ALL TO calon_app
  USING ("tenantId" = NULLIF(current_setting('app.tenant_id', true), '')::uuid)
  WITH CHECK ("tenantId" = NULLIF(current_setting('app.tenant_id', true), '')::uuid);
