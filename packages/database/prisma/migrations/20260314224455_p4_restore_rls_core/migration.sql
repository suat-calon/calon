-- ════════════════════════════════════════════════════════════
-- P4: RLS RESTORASYON — 23 Tenant-Scoped Tablo
-- ════════════════════════════════════════════════════════════
-- Migration squash (20260314204129_init_clean_baseline) sırasında
-- tüm RLS politikaları kayboldu. Bu migration restore eder.
--
-- Defense-in-Depth: Prisma $extends interceptor (Katman 1) +
-- PostgreSQL RLS (Katman 2, bu dosya).
--
-- FORCE ROW LEVEL SECURITY: tablo sahibi dahil tüm roller
-- için RLS zorunlu.
--
-- Policy target: calon_app (uygulama bağlantı rolü)
-- Cast yönü: current_setting()::uuid (index-friendly)
-- ════════════════════════════════════════════════════════════

-- 1. locations
ALTER TABLE "locations" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "locations" FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation_locations ON "locations"
  FOR ALL TO calon_app
  USING ("tenantId" = current_setting('app.tenant_id', true)::uuid)
  WITH CHECK ("tenantId" = current_setting('app.tenant_id', true)::uuid);

-- 2. rooms
ALTER TABLE "rooms" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "rooms" FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation_rooms ON "rooms"
  FOR ALL TO calon_app
  USING ("tenantId" = current_setting('app.tenant_id', true)::uuid)
  WITH CHECK ("tenantId" = current_setting('app.tenant_id', true)::uuid);

-- 3. user_tenants
ALTER TABLE "user_tenants" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "user_tenants" FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation_user_tenants ON "user_tenants"
  FOR ALL TO calon_app
  USING ("tenantId" = current_setting('app.tenant_id', true)::uuid)
  WITH CHECK ("tenantId" = current_setting('app.tenant_id', true)::uuid);

-- 4. staff_profiles
ALTER TABLE "staff_profiles" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "staff_profiles" FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation_staff_profiles ON "staff_profiles"
  FOR ALL TO calon_app
  USING ("tenantId" = current_setting('app.tenant_id', true)::uuid)
  WITH CHECK ("tenantId" = current_setting('app.tenant_id', true)::uuid);

-- staff_working_hours: tenantId kolonu YOK (staffId FK üzerinden dolaylı izolasyon)
-- staff_services: tenantId kolonu YOK (staffId+serviceId FK üzerinden dolaylı izolasyon)

-- 5. staff_shifts
ALTER TABLE "staff_shifts" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "staff_shifts" FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation_staff_shifts ON "staff_shifts"
  FOR ALL TO calon_app
  USING ("tenantId" = current_setting('app.tenant_id', true)::uuid)
  WITH CHECK ("tenantId" = current_setting('app.tenant_id', true)::uuid);

-- 7. service_categories
ALTER TABLE "service_categories" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "service_categories" FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation_service_categories ON "service_categories"
  FOR ALL TO calon_app
  USING ("tenantId" = current_setting('app.tenant_id', true)::uuid)
  WITH CHECK ("tenantId" = current_setting('app.tenant_id', true)::uuid);

-- 8. services
ALTER TABLE "services" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "services" FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation_services ON "services"
  FOR ALL TO calon_app
  USING ("tenantId" = current_setting('app.tenant_id', true)::uuid)
  WITH CHECK ("tenantId" = current_setting('app.tenant_id', true)::uuid);

-- 9. products
ALTER TABLE "products" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "products" FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation_products ON "products"
  FOR ALL TO calon_app
  USING ("tenantId" = current_setting('app.tenant_id', true)::uuid)
  WITH CHECK ("tenantId" = current_setting('app.tenant_id', true)::uuid);

-- 11. stock_logs
ALTER TABLE "stock_logs" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "stock_logs" FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation_stock_logs ON "stock_logs"
  FOR ALL TO calon_app
  USING ("tenantId" = current_setting('app.tenant_id', true)::uuid)
  WITH CHECK ("tenantId" = current_setting('app.tenant_id', true)::uuid);

-- 12. customers
ALTER TABLE "customers" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "customers" FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation_customers ON "customers"
  FOR ALL TO calon_app
  USING ("tenantId" = current_setting('app.tenant_id', true)::uuid)
  WITH CHECK ("tenantId" = current_setting('app.tenant_id', true)::uuid);

-- 13. appointments
ALTER TABLE "appointments" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "appointments" FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation_appointments ON "appointments"
  FOR ALL TO calon_app
  USING ("tenantId" = current_setting('app.tenant_id', true)::uuid)
  WITH CHECK ("tenantId" = current_setting('app.tenant_id', true)::uuid);

-- 14. transaction_ledger
ALTER TABLE "transaction_ledger" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "transaction_ledger" FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation_transaction_ledger ON "transaction_ledger"
  FOR ALL TO calon_app
  USING ("tenantId" = current_setting('app.tenant_id', true)::uuid)
  WITH CHECK ("tenantId" = current_setting('app.tenant_id', true)::uuid);

-- 15. commission_logs
ALTER TABLE "commission_logs" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "commission_logs" FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation_commission_logs ON "commission_logs"
  FOR ALL TO calon_app
  USING ("tenantId" = current_setting('app.tenant_id', true)::uuid)
  WITH CHECK ("tenantId" = current_setting('app.tenant_id', true)::uuid);

-- 16. loyalty_transactions
ALTER TABLE "loyalty_transactions" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "loyalty_transactions" FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation_loyalty_transactions ON "loyalty_transactions"
  FOR ALL TO calon_app
  USING ("tenantId" = current_setting('app.tenant_id', true)::uuid)
  WITH CHECK ("tenantId" = current_setting('app.tenant_id', true)::uuid);

-- 17. consent_forms
ALTER TABLE "consent_forms" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "consent_forms" FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation_consent_forms ON "consent_forms"
  FOR ALL TO calon_app
  USING ("tenantId" = current_setting('app.tenant_id', true)::uuid)
  WITH CHECK ("tenantId" = current_setting('app.tenant_id', true)::uuid);

-- 18. refresh_tokens
ALTER TABLE "refresh_tokens" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "refresh_tokens" FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation_refresh_tokens ON "refresh_tokens"
  FOR ALL TO calon_app
  USING ("tenantId" = current_setting('app.tenant_id', true)::uuid)
  WITH CHECK ("tenantId" = current_setting('app.tenant_id', true)::uuid);

-- 19. idempotency_keys
ALTER TABLE "idempotency_keys" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "idempotency_keys" FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation_idempotency_keys ON "idempotency_keys"
  FOR ALL TO calon_app
  USING ("tenantId" = current_setting('app.tenant_id', true)::uuid)
  WITH CHECK ("tenantId" = current_setting('app.tenant_id', true)::uuid);

-- 20. audit_logs
ALTER TABLE "audit_logs" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "audit_logs" FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation_audit_logs ON "audit_logs"
  FOR ALL TO calon_app
  USING ("tenantId" = current_setting('app.tenant_id', true)::uuid)
  WITH CHECK ("tenantId" = current_setting('app.tenant_id', true)::uuid);

-- 21. messages
ALTER TABLE "messages" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "messages" FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation_messages ON "messages"
  FOR ALL TO calon_app
  USING ("tenantId" = current_setting('app.tenant_id', true)::uuid)
  WITH CHECK ("tenantId" = current_setting('app.tenant_id', true)::uuid);

-- 22. campaign_templates
ALTER TABLE "campaign_templates" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "campaign_templates" FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation_campaign_templates ON "campaign_templates"
  FOR ALL TO calon_app
  USING ("tenantId" = current_setting('app.tenant_id', true)::uuid)
  WITH CHECK ("tenantId" = current_setting('app.tenant_id', true)::uuid);

-- 23. customer_photos
ALTER TABLE "customer_photos" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "customer_photos" FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation_customer_photos ON "customer_photos"
  FOR ALL TO calon_app
  USING ("tenantId" = current_setting('app.tenant_id', true)::uuid)
  WITH CHECK ("tenantId" = current_setting('app.tenant_id', true)::uuid);

-- 24. referrals
ALTER TABLE "referrals" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "referrals" FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation_referrals ON "referrals"
  FOR ALL TO calon_app
  USING ("tenantId" = current_setting('app.tenant_id', true)::uuid)
  WITH CHECK ("tenantId" = current_setting('app.tenant_id', true)::uuid);

-- 25. payments
ALTER TABLE "payments" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "payments" FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation_payments ON "payments"
  FOR ALL TO calon_app
  USING ("tenantId" = current_setting('app.tenant_id', true)::uuid)
  WITH CHECK ("tenantId" = current_setting('app.tenant_id', true)::uuid);
