-- =============================================================================
-- AURALIS BUSINESS OS — FAZ 0: ÇELİK ÇEKİRDEK MIGRATION
-- Bu migration Prisma'nın üretemeyeceği donanımsal güvenlik kurallarını içerir.
-- Hiçbir zaman değiştirilmemeli; yeni kural yeni migration'da yazılmalıdır.
-- =============================================================================

-- -----------------------------------------------------------------------------
-- 0. TEMEL EKLENTİLER (Extensions)
-- -----------------------------------------------------------------------------
-- btree_gist: tsrange kolonlarını B-Tree ile birleştirerek EXCLUDE USING GIST
-- ifadesinin uuid + tsrange üzerinde çalışmasını sağlar.
-- uuid-ossp: uuid_generate_v4() için (Prisma @default(uuid()) alternatifi)
CREATE EXTENSION IF NOT EXISTS "btree_gist";
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- -----------------------------------------------------------------------------
-- 1. VERİTABANI ROLÜ (Least Privilege — Superuser değil)
-- -----------------------------------------------------------------------------
-- auralis_app: Sadece gerekli izinlere sahip uygulama rolü.
-- RLS politikaları bu rol için geçerlidir (superuser RLS'yi atlar!).
DO $$
BEGIN
  IF NOT EXISTS (SELECT FROM pg_roles WHERE rolname = 'auralis_app') THEN
    CREATE ROLE auralis_app LOGIN PASSWORD 'CHANGE_IN_PRODUCTION_VAULT';
  END IF;
END
$$;

-- Schema yetkisi
GRANT USAGE ON SCHEMA public TO auralis_app;

-- Tablo yetkisi (sadece DML — DDL yok)
GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES    IN SCHEMA public TO auralis_app;
GRANT USAGE, SELECT                  ON ALL SEQUENCES IN SCHEMA public TO auralis_app;

-- Gelecekte oluşturulacak tablolar için varsayılan yetki
ALTER DEFAULT PRIVILEGES IN SCHEMA public
  GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES    TO auralis_app;
ALTER DEFAULT PRIVILEGES IN SCHEMA public
  GRANT USAGE, SELECT                  ON SEQUENCES TO auralis_app;

-- -----------------------------------------------------------------------------
-- 2. TABLOLAR (Prisma'nın ürettiği DDL'yi burada manuel yazıyoruz)
--    Sıra önemli: foreign key referansları gözetilmeli.
-- -----------------------------------------------------------------------------

CREATE TABLE "tenants" (
  "id"          UUID        NOT NULL DEFAULT uuid_generate_v4() PRIMARY KEY,
  "name"        TEXT        NOT NULL,
  "slug"        TEXT        NOT NULL UNIQUE,
  "plan"        TEXT        NOT NULL DEFAULT 'SOLO',
  "status"      TEXT        NOT NULL DEFAULT 'ACTIVE',
  "brandColor"  TEXT,
  "logoUrl"     TEXT,
  "timezone"    TEXT        NOT NULL DEFAULT 'Europe/Istanbul',
  "locale"      TEXT        NOT NULL DEFAULT 'tr-TR',
  "createdAt"   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  "updatedAt"   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  "deletedAt"   TIMESTAMPTZ,
  "isDeleted"   BOOLEAN     NOT NULL DEFAULT FALSE
);
CREATE INDEX idx_tenants_slug   ON "tenants"("slug");
CREATE INDEX idx_tenants_status ON "tenants"("status");

CREATE TABLE "users" (
  "id"           UUID        NOT NULL DEFAULT uuid_generate_v4() PRIMARY KEY,
  "email"        TEXT        NOT NULL UNIQUE,
  "passwordHash" TEXT        NOT NULL,
  "firstName"    TEXT        NOT NULL,
  "lastName"     TEXT        NOT NULL,
  "phone"        TEXT,
  "avatarUrl"    TEXT,
  "status"       TEXT        NOT NULL DEFAULT 'INVITED',
  "createdAt"    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  "updatedAt"    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  "lastLoginAt"  TIMESTAMPTZ,
  "deletedAt"    TIMESTAMPTZ,
  "isDeleted"    BOOLEAN     NOT NULL DEFAULT FALSE
);
CREATE INDEX idx_users_email ON "users"("email");

CREATE TABLE "locations" (
  "id"        UUID        NOT NULL DEFAULT uuid_generate_v4() PRIMARY KEY,
  "tenantId"  UUID        NOT NULL REFERENCES "tenants"("id"),
  "name"      TEXT        NOT NULL,
  "address"   TEXT,
  "city"      TEXT,
  "country"   TEXT        NOT NULL DEFAULT 'TR',
  "phone"     TEXT,
  "isActive"  BOOLEAN     NOT NULL DEFAULT TRUE,
  "createdAt" TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  "updatedAt" TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  "deletedAt" TIMESTAMPTZ,
  "isDeleted" BOOLEAN     NOT NULL DEFAULT FALSE
);
CREATE INDEX idx_locations_tenant ON "locations"("tenantId");

CREATE TABLE "rooms" (
  "id"         UUID        NOT NULL DEFAULT uuid_generate_v4() PRIMARY KEY,
  "tenantId"   UUID        NOT NULL REFERENCES "tenants"("id"),
  "locationId" UUID        NOT NULL REFERENCES "locations"("id"),
  "name"       TEXT        NOT NULL,
  "capacity"   INT         NOT NULL DEFAULT 1,
  "isActive"   BOOLEAN     NOT NULL DEFAULT TRUE,
  "createdAt"  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  "updatedAt"  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  "deletedAt"  TIMESTAMPTZ,
  "isDeleted"  BOOLEAN     NOT NULL DEFAULT FALSE
);
CREATE INDEX idx_rooms_tenant_location ON "rooms"("tenantId", "locationId");

CREATE TABLE "user_tenants" (
  "id"         UUID NOT NULL DEFAULT uuid_generate_v4() PRIMARY KEY,
  "userId"     UUID NOT NULL REFERENCES "users"("id")    ON DELETE CASCADE,
  "tenantId"   UUID NOT NULL REFERENCES "tenants"("id") ON DELETE CASCADE,
  "role"       TEXT NOT NULL DEFAULT 'STAFF',
  "locationId" UUID REFERENCES "locations"("id"),
  "createdAt"  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  "updatedAt"  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE("userId", "tenantId")
);
CREATE INDEX idx_user_tenants_tenant_role ON "user_tenants"("tenantId", "role");

CREATE TABLE "staff_profiles" (
  "id"             UUID        NOT NULL DEFAULT uuid_generate_v4() PRIMARY KEY,
  "tenantId"       UUID        NOT NULL REFERENCES "tenants"("id"),
  "locationId"     UUID        NOT NULL REFERENCES "locations"("id"),
  "userId"         UUID        REFERENCES "users"("id"),
  "firstName"      TEXT        NOT NULL,
  "lastName"       TEXT        NOT NULL,
  "phone"          TEXT,
  "avatarUrl"      TEXT,
  "title"          TEXT,
  "colorHex"       TEXT        NOT NULL DEFAULT '#6366f1',
  "commissionRate" FLOAT       NOT NULL DEFAULT 0,
  "isActive"       BOOLEAN     NOT NULL DEFAULT TRUE,
  "createdAt"      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  "updatedAt"      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  "deletedAt"      TIMESTAMPTZ,
  "isDeleted"      BOOLEAN     NOT NULL DEFAULT FALSE
);
CREATE INDEX idx_staff_tenant_location ON "staff_profiles"("tenantId", "locationId");

CREATE TABLE "staff_working_hours" (
  "id"           UUID    NOT NULL DEFAULT uuid_generate_v4() PRIMARY KEY,
  "staffId"      UUID    NOT NULL REFERENCES "staff_profiles"("id") ON DELETE CASCADE,
  "dayOfWeek"    TEXT    NOT NULL,
  "startTime"    TEXT    NOT NULL,
  "endTime"      TEXT    NOT NULL,
  "isWorkingDay" BOOLEAN NOT NULL DEFAULT TRUE,
  "breakStart"   TEXT,
  "breakEnd"     TEXT,
  UNIQUE("staffId", "dayOfWeek")
);

CREATE TABLE "staff_shifts" (
  "id"        UUID        NOT NULL DEFAULT uuid_generate_v4() PRIMARY KEY,
  "staffId"   UUID        NOT NULL REFERENCES "staff_profiles"("id") ON DELETE CASCADE,
  "date"      DATE        NOT NULL,
  "startTime" TIMESTAMPTZ NOT NULL,
  "endTime"   TIMESTAMPTZ NOT NULL,
  "notes"     TEXT
);
CREATE INDEX idx_shifts_staff_date ON "staff_shifts"("staffId", "date");

CREATE TABLE "service_categories" (
  "id"          UUID        NOT NULL DEFAULT uuid_generate_v4() PRIMARY KEY,
  "tenantId"    UUID        NOT NULL REFERENCES "tenants"("id"),
  "name"        TEXT        NOT NULL,
  "description" TEXT,
  "colorHex"    TEXT        NOT NULL DEFAULT '#6366f1',
  "sortOrder"   INT         NOT NULL DEFAULT 0,
  "isActive"    BOOLEAN     NOT NULL DEFAULT TRUE,
  "createdAt"   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  "updatedAt"   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  "isDeleted"   BOOLEAN     NOT NULL DEFAULT FALSE
);
CREATE INDEX idx_service_categories_tenant ON "service_categories"("tenantId");

CREATE TABLE "services" (
  "id"          UUID           NOT NULL DEFAULT uuid_generate_v4() PRIMARY KEY,
  "tenantId"    UUID           NOT NULL REFERENCES "tenants"("id"),
  "categoryId"  UUID           NOT NULL REFERENCES "service_categories"("id"),
  "name"        TEXT           NOT NULL,
  "description" TEXT,
  "durationMin" INT            NOT NULL,
  "price"       DECIMAL(10,2)  NOT NULL,
  "currency"    TEXT           NOT NULL DEFAULT 'TRY',
  "depositRate" FLOAT          NOT NULL DEFAULT 0,
  "isActive"    BOOLEAN        NOT NULL DEFAULT TRUE,
  "createdAt"   TIMESTAMPTZ    NOT NULL DEFAULT NOW(),
  "updatedAt"   TIMESTAMPTZ    NOT NULL DEFAULT NOW(),
  "isDeleted"   BOOLEAN        NOT NULL DEFAULT FALSE
);
CREATE INDEX idx_services_tenant_category ON "services"("tenantId", "categoryId");

CREATE TABLE "staff_services" (
  "staffId"   UUID NOT NULL REFERENCES "staff_profiles"("id") ON DELETE CASCADE,
  "serviceId" UUID NOT NULL REFERENCES "services"("id")       ON DELETE CASCADE,
  PRIMARY KEY ("staffId", "serviceId")
);

CREATE TABLE "products" (
  "id"          UUID           NOT NULL DEFAULT uuid_generate_v4() PRIMARY KEY,
  "tenantId"    UUID           NOT NULL REFERENCES "tenants"("id"),
  "name"        TEXT           NOT NULL,
  "sku"         TEXT,
  "unit"        TEXT           NOT NULL DEFAULT 'ml',
  "stockAmount" DECIMAL(10,3)  NOT NULL DEFAULT 0,
  "minStock"    DECIMAL(10,3)  NOT NULL DEFAULT 0,
  "costPrice"   DECIMAL(10,2)  NOT NULL DEFAULT 0,
  "isActive"    BOOLEAN        NOT NULL DEFAULT TRUE,
  "createdAt"   TIMESTAMPTZ    NOT NULL DEFAULT NOW(),
  "updatedAt"   TIMESTAMPTZ    NOT NULL DEFAULT NOW(),
  "isDeleted"   BOOLEAN        NOT NULL DEFAULT FALSE
);
CREATE INDEX idx_products_tenant ON "products"("tenantId");

CREATE TABLE "service_products" (
  "serviceId"   UUID          NOT NULL REFERENCES "services"("id")  ON DELETE CASCADE,
  "productId"   UUID          NOT NULL REFERENCES "products"("id")  ON DELETE CASCADE,
  "usageAmount" DECIMAL(10,3) NOT NULL,
  PRIMARY KEY ("serviceId", "productId")
);

CREATE TABLE "stock_logs" (
  "id"        UUID           NOT NULL DEFAULT uuid_generate_v4() PRIMARY KEY,
  "productId" UUID           NOT NULL REFERENCES "products"("id"),
  "tenantId"  UUID           NOT NULL REFERENCES "tenants"("id"),
  "delta"     DECIMAL(10,3)  NOT NULL,
  "reason"    TEXT           NOT NULL,
  "createdAt" TIMESTAMPTZ    NOT NULL DEFAULT NOW()
);
CREATE INDEX idx_stock_logs_tenant_product ON "stock_logs"("tenantId", "productId");
CREATE INDEX idx_stock_logs_created_at     ON "stock_logs"("createdAt");

CREATE TABLE "customers" (
  "id"            UUID        NOT NULL DEFAULT uuid_generate_v4() PRIMARY KEY,
  "tenantId"      UUID        NOT NULL REFERENCES "tenants"("id"),
  "firstName"     TEXT        NOT NULL,
  "lastName"      TEXT        NOT NULL,
  "email"         TEXT,
  "phone"         TEXT,
  "dateOfBirth"   DATE,
  "gender"        TEXT,
  "avatarUrl"     TEXT,
  "notes"         TEXT,
  "loyaltyTier"   TEXT        NOT NULL DEFAULT 'BRONZE',
  "loyaltyPoints" INT         NOT NULL DEFAULT 0,
  "consentGiven"  BOOLEAN     NOT NULL DEFAULT FALSE,
  "consentDate"   TIMESTAMPTZ,
  "anonymizedAt"  TIMESTAMPTZ,
  "createdAt"     TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  "updatedAt"     TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  "deletedAt"     TIMESTAMPTZ,
  "isDeleted"     BOOLEAN     NOT NULL DEFAULT FALSE
);
CREATE INDEX idx_customers_tenant_phone ON "customers"("tenantId", "phone");
CREATE INDEX idx_customers_tenant_email ON "customers"("tenantId", "email");

-- ★★★ RANDEVU TABLOSU — ÇAKIŞMA KORUMASI BURADA ★★★
CREATE TABLE "appointments" (
  "id"                  UUID           NOT NULL DEFAULT uuid_generate_v4() PRIMARY KEY,
  "tenantId"            UUID           NOT NULL REFERENCES "tenants"("id"),
  "customerId"          UUID           NOT NULL REFERENCES "customers"("id"),
  "staffId"             UUID           NOT NULL REFERENCES "staff_profiles"("id"),
  "serviceId"           UUID           NOT NULL REFERENCES "services"("id"),
  "locationId"          UUID           NOT NULL REFERENCES "locations"("id"),
  "roomId"              UUID           REFERENCES "rooms"("id"),
  "status"              TEXT           NOT NULL DEFAULT 'PENDING',
  "source"              TEXT           NOT NULL DEFAULT 'RECEPTIONIST',
  "startTime"           TIMESTAMPTZ    NOT NULL,
  "endTime"             TIMESTAMPTZ    NOT NULL,
  "notes"               TEXT,
  "internalNotes"       TEXT,
  "depositPaid"         DECIMAL(10,2),
  "totalPrice"          DECIMAL(10,2),
  "idempotencyKey"      TEXT           UNIQUE,
  "integrityHash"       TEXT,
  "createdAt"           TIMESTAMPTZ    NOT NULL DEFAULT NOW(),
  "updatedAt"           TIMESTAMPTZ    NOT NULL DEFAULT NOW(),
  "cancelledAt"         TIMESTAMPTZ,
  "cancellationReason"  TEXT,
  -- KIRMIZI ÇİZGİ: Randevular asla fiziksel silinmez!
  "isDeleted"           BOOLEAN        NOT NULL DEFAULT FALSE,

  -- startTime < endTime zorunluluğu
  CONSTRAINT chk_appointment_times CHECK ("startTime" < "endTime")
);

-- Performans indexleri
CREATE INDEX idx_appointments_tenant_staff_time
  ON "appointments"("tenantId", "staffId", "startTime", "endTime");
CREATE INDEX idx_appointments_tenant_customer
  ON "appointments"("tenantId", "customerId");
CREATE INDEX idx_appointments_tenant_status
  ON "appointments"("tenantId", "status");
CREATE INDEX idx_appointments_start_time
  ON "appointments"("startTime");

-- ★★★ DONANIM SEVİYESİ ÇAKIŞMA KORUMASI ★★★
-- EXCLUDE USING GIST: Aynı tenant'ta aynı personele çakışan zaman aralığı
-- veritabanı motoru tarafından fiziksel olarak engellenir.
-- Yazılım katmanını bypass etmek imkansızdır.
ALTER TABLE "appointments"
  ADD CONSTRAINT excl_no_staff_double_booking
  EXCLUDE USING GIST (
    "tenantId" WITH =,
    "staffId"  WITH =,
    tstzrange("startTime", "endTime", '[)') WITH &&
  )
  WHERE (status NOT IN ('CANCELLED', 'NO_SHOW') AND "isDeleted" = FALSE);

-- Oda çakışması (varsa)
ALTER TABLE "appointments"
  ADD CONSTRAINT excl_no_room_double_booking
  EXCLUDE USING GIST (
    "tenantId" WITH =,
    "roomId"   WITH =,
    tstzrange("startTime", "endTime", '[)') WITH &&
  )
  WHERE (
    "roomId" IS NOT NULL
    AND status NOT IN ('CANCELLED', 'NO_SHOW')
    AND "isDeleted" = FALSE
  );

CREATE TABLE "transaction_ledger" (
  "id"            UUID          NOT NULL DEFAULT uuid_generate_v4() PRIMARY KEY,
  "tenantId"      UUID          NOT NULL REFERENCES "tenants"("id"),
  "appointmentId" UUID          REFERENCES "appointments"("id"),
  "type"          TEXT          NOT NULL,
  "amount"        DECIMAL(10,2) NOT NULL,
  "currency"      TEXT          NOT NULL DEFAULT 'TRY',
  "description"   TEXT,
  "reference"     TEXT,
  "processedAt"   TIMESTAMPTZ   NOT NULL DEFAULT NOW(),
  "isDeleted"     BOOLEAN       NOT NULL DEFAULT FALSE
);
CREATE INDEX idx_ledger_tenant_processed ON "transaction_ledger"("tenantId", "processedAt");
CREATE INDEX idx_ledger_appointment       ON "transaction_ledger"("appointmentId");

CREATE TABLE "commission_logs" (
  "id"            UUID          NOT NULL DEFAULT uuid_generate_v4() PRIMARY KEY,
  "tenantId"      UUID          NOT NULL REFERENCES "tenants"("id"),
  "staffId"       UUID          NOT NULL REFERENCES "staff_profiles"("id"),
  "appointmentId" UUID          NOT NULL REFERENCES "appointments"("id"),
  "amount"        DECIMAL(10,2) NOT NULL,
  "rate"          FLOAT         NOT NULL,
  "periodStart"   DATE          NOT NULL,
  "periodEnd"     DATE          NOT NULL,
  "isPaid"        BOOLEAN       NOT NULL DEFAULT FALSE,
  "paidAt"        TIMESTAMPTZ
);
CREATE INDEX idx_commissions_tenant_staff_paid ON "commission_logs"("tenantId", "staffId", "isPaid");

CREATE TABLE "loyalty_transactions" (
  "id"            UUID        NOT NULL DEFAULT uuid_generate_v4() PRIMARY KEY,
  "tenantId"      UUID        NOT NULL REFERENCES "tenants"("id"),
  "customerId"    UUID        NOT NULL REFERENCES "customers"("id"),
  "appointmentId" UUID        REFERENCES "appointments"("id"),
  "action"        TEXT        NOT NULL,
  "points"        INT         NOT NULL,
  "balanceAfter"  INT         NOT NULL,
  "description"   TEXT,
  "createdAt"     TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX idx_loyalty_tenant_customer ON "loyalty_transactions"("tenantId", "customerId");

CREATE TABLE "consent_forms" (
  "id"            UUID        NOT NULL DEFAULT uuid_generate_v4() PRIMARY KEY,
  "tenantId"      UUID        NOT NULL REFERENCES "tenants"("id"),
  "customerId"    UUID        NOT NULL REFERENCES "customers"("id"),
  "appointmentId" UUID        REFERENCES "appointments"("id"),
  "formType"      TEXT        NOT NULL,
  "content"       TEXT        NOT NULL,
  "signedAt"      TIMESTAMPTZ NOT NULL,
  "ipAddress"     TEXT,
  "userAgent"     TEXT
);
CREATE INDEX idx_consent_tenant_customer ON "consent_forms"("tenantId", "customerId");

CREATE TABLE "refresh_tokens" (
  "id"        UUID        NOT NULL DEFAULT uuid_generate_v4() PRIMARY KEY,
  "token"     TEXT        NOT NULL UNIQUE,
  "userId"    UUID        NOT NULL REFERENCES "users"("id")    ON DELETE CASCADE,
  "tenantId"  UUID        NOT NULL REFERENCES "tenants"("id") ON DELETE CASCADE,
  "expiresAt" TIMESTAMPTZ NOT NULL,
  "revokedAt" TIMESTAMPTZ,
  "createdAt" TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  "userAgent" TEXT,
  "ipAddress" TEXT
);
CREATE INDEX idx_refresh_tokens_user       ON "refresh_tokens"("userId");
CREATE INDEX idx_refresh_tokens_expires_at ON "refresh_tokens"("expiresAt");

CREATE TABLE "idempotency_keys" (
  "id"        UUID        NOT NULL DEFAULT uuid_generate_v4() PRIMARY KEY,
  "key"       TEXT        NOT NULL UNIQUE,
  "tenantId"  UUID        NOT NULL REFERENCES "tenants"("id") ON DELETE CASCADE,
  "response"  JSONB,
  "createdAt" TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  "expiresAt" TIMESTAMPTZ NOT NULL
);
CREATE INDEX idx_idempotency_expires_at ON "idempotency_keys"("expiresAt");

CREATE TABLE "audit_logs" (
  "id"         UUID        NOT NULL DEFAULT uuid_generate_v4() PRIMARY KEY,
  "tenantId"   UUID        NOT NULL REFERENCES "tenants"("id"),
  "entityType" TEXT        NOT NULL,
  "entityId"   UUID        NOT NULL,
  "action"     TEXT        NOT NULL,
  "actorId"    UUID        REFERENCES "users"("id"),
  "actorRole"  TEXT,
  "before"     JSONB,
  "after"      JSONB,
  "ipAddress"  TEXT,
  "createdAt"  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX idx_audit_tenant_entity  ON "audit_logs"("tenantId", "entityType", "entityId");
CREATE INDEX idx_audit_tenant_created ON "audit_logs"("tenantId", "createdAt");

-- v2 Placeholder tablolar (endpoint YOK, schema VAR)
CREATE TABLE "messages" (
  "id"         UUID        NOT NULL DEFAULT uuid_generate_v4() PRIMARY KEY,
  "tenantId"   UUID        NOT NULL REFERENCES "tenants"("id"),
  "customerId" UUID        REFERENCES "customers"("id"),
  "channel"    TEXT        NOT NULL,
  "direction"  TEXT        NOT NULL,
  "content"    TEXT        NOT NULL,
  "intent"     TEXT,
  "sessionId"  TEXT,
  "createdAt"  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX idx_messages_tenant_customer ON "messages"("tenantId", "customerId");
CREATE INDEX idx_messages_session         ON "messages"("sessionId");

CREATE TABLE "campaign_templates" (
  "id"        UUID        NOT NULL DEFAULT uuid_generate_v4() PRIMARY KEY,
  "tenantId"  UUID        NOT NULL REFERENCES "tenants"("id"),
  "name"      TEXT        NOT NULL,
  "channel"   TEXT        NOT NULL,
  "subject"   TEXT,
  "body"      TEXT        NOT NULL,
  "isActive"  BOOLEAN     NOT NULL DEFAULT FALSE,
  "createdAt" TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  "updatedAt" TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX idx_campaign_templates_tenant ON "campaign_templates"("tenantId");

-- -----------------------------------------------------------------------------
-- 3. ROW-LEVEL SECURITY (RLS) — ÇİFT KATMANLI İZOLASYON
-- Superuser bu policy'lere takılmaz — auralis_app rolü takılır.
-- current_setting('app.tenant_id', true): NestJS her sorguda set eder.
-- -----------------------------------------------------------------------------

-- Tüm tablolarda RLS'yi etkinleştir
ALTER TABLE "tenants"              ENABLE ROW LEVEL SECURITY;
ALTER TABLE "locations"            ENABLE ROW LEVEL SECURITY;
ALTER TABLE "rooms"                ENABLE ROW LEVEL SECURITY;
ALTER TABLE "user_tenants"         ENABLE ROW LEVEL SECURITY;
ALTER TABLE "staff_profiles"       ENABLE ROW LEVEL SECURITY;
ALTER TABLE "staff_working_hours"  ENABLE ROW LEVEL SECURITY;
ALTER TABLE "staff_shifts"         ENABLE ROW LEVEL SECURITY;
ALTER TABLE "service_categories"   ENABLE ROW LEVEL SECURITY;
ALTER TABLE "services"             ENABLE ROW LEVEL SECURITY;
ALTER TABLE "staff_services"       ENABLE ROW LEVEL SECURITY;
ALTER TABLE "products"             ENABLE ROW LEVEL SECURITY;
ALTER TABLE "stock_logs"           ENABLE ROW LEVEL SECURITY;
ALTER TABLE "customers"            ENABLE ROW LEVEL SECURITY;
ALTER TABLE "appointments"         ENABLE ROW LEVEL SECURITY;
ALTER TABLE "transaction_ledger"   ENABLE ROW LEVEL SECURITY;
ALTER TABLE "commission_logs"      ENABLE ROW LEVEL SECURITY;
ALTER TABLE "loyalty_transactions" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "consent_forms"        ENABLE ROW LEVEL SECURITY;
ALTER TABLE "refresh_tokens"       ENABLE ROW LEVEL SECURITY;
ALTER TABLE "idempotency_keys"     ENABLE ROW LEVEL SECURITY;
ALTER TABLE "audit_logs"           ENABLE ROW LEVEL SECURITY;
ALTER TABLE "messages"             ENABLE ROW LEVEL SECURITY;
ALTER TABLE "campaign_templates"   ENABLE ROW LEVEL SECURITY;

-- Tenants tablosu için özel policy: sadece kendi satırını görsün
CREATE POLICY tenant_self_isolation ON "tenants"
  FOR ALL TO auralis_app
  USING (id = current_setting('app.tenant_id', true)::uuid);

-- tenantId olan tüm tablolar için policy (makro):
CREATE POLICY tenant_isolation ON "locations"
  FOR ALL TO auralis_app
  USING ("tenantId" = current_setting('app.tenant_id', true)::uuid);

CREATE POLICY tenant_isolation ON "rooms"
  FOR ALL TO auralis_app
  USING ("tenantId" = current_setting('app.tenant_id', true)::uuid);

CREATE POLICY tenant_isolation ON "user_tenants"
  FOR ALL TO auralis_app
  USING ("tenantId" = current_setting('app.tenant_id', true)::uuid);

CREATE POLICY tenant_isolation ON "staff_profiles"
  FOR ALL TO auralis_app
  USING ("tenantId" = current_setting('app.tenant_id', true)::uuid);

CREATE POLICY tenant_isolation ON "staff_working_hours"
  FOR ALL TO auralis_app
  USING (
    "staffId" IN (
      SELECT id FROM "staff_profiles"
      WHERE "tenantId" = current_setting('app.tenant_id', true)::uuid
    )
  );

CREATE POLICY tenant_isolation ON "staff_shifts"
  FOR ALL TO auralis_app
  USING (
    "staffId" IN (
      SELECT id FROM "staff_profiles"
      WHERE "tenantId" = current_setting('app.tenant_id', true)::uuid
    )
  );

CREATE POLICY tenant_isolation ON "service_categories"
  FOR ALL TO auralis_app
  USING ("tenantId" = current_setting('app.tenant_id', true)::uuid);

CREATE POLICY tenant_isolation ON "services"
  FOR ALL TO auralis_app
  USING ("tenantId" = current_setting('app.tenant_id', true)::uuid);

CREATE POLICY tenant_isolation ON "staff_services"
  FOR ALL TO auralis_app
  USING (
    "staffId" IN (
      SELECT id FROM "staff_profiles"
      WHERE "tenantId" = current_setting('app.tenant_id', true)::uuid
    )
  );

CREATE POLICY tenant_isolation ON "products"
  FOR ALL TO auralis_app
  USING ("tenantId" = current_setting('app.tenant_id', true)::uuid);

CREATE POLICY tenant_isolation ON "stock_logs"
  FOR ALL TO auralis_app
  USING ("tenantId" = current_setting('app.tenant_id', true)::uuid);

CREATE POLICY tenant_isolation ON "customers"
  FOR ALL TO auralis_app
  USING ("tenantId" = current_setting('app.tenant_id', true)::uuid);

CREATE POLICY tenant_isolation ON "appointments"
  FOR ALL TO auralis_app
  USING ("tenantId" = current_setting('app.tenant_id', true)::uuid);

CREATE POLICY tenant_isolation ON "transaction_ledger"
  FOR ALL TO auralis_app
  USING ("tenantId" = current_setting('app.tenant_id', true)::uuid);

CREATE POLICY tenant_isolation ON "commission_logs"
  FOR ALL TO auralis_app
  USING ("tenantId" = current_setting('app.tenant_id', true)::uuid);

CREATE POLICY tenant_isolation ON "loyalty_transactions"
  FOR ALL TO auralis_app
  USING ("tenantId" = current_setting('app.tenant_id', true)::uuid);

CREATE POLICY tenant_isolation ON "consent_forms"
  FOR ALL TO auralis_app
  USING ("tenantId" = current_setting('app.tenant_id', true)::uuid);

CREATE POLICY tenant_isolation ON "refresh_tokens"
  FOR ALL TO auralis_app
  USING ("tenantId" = current_setting('app.tenant_id', true)::uuid);

CREATE POLICY tenant_isolation ON "idempotency_keys"
  FOR ALL TO auralis_app
  USING ("tenantId" = current_setting('app.tenant_id', true)::uuid);

CREATE POLICY tenant_isolation ON "audit_logs"
  FOR ALL TO auralis_app
  USING ("tenantId" = current_setting('app.tenant_id', true)::uuid);

CREATE POLICY tenant_isolation ON "messages"
  FOR ALL TO auralis_app
  USING ("tenantId" = current_setting('app.tenant_id', true)::uuid);

CREATE POLICY tenant_isolation ON "campaign_templates"
  FOR ALL TO auralis_app
  USING ("tenantId" = current_setting('app.tenant_id', true)::uuid);
