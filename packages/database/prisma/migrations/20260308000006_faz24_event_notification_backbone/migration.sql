-- =============================================================================
-- FAZ 24: EVENT & NOTIFICATION BACKBONE
-- Deterministic, idempotent, multi-tenant, DB-first event outbox tabanlı
-- bildirim altyapısı.
-- =============================================================================

-- ── Enum Tipleri ──────────────────────────────────────────────────────────────

CREATE TYPE "OutboxEventStatus" AS ENUM (
  'PENDING',
  'DISPATCHED',
  'PROCESSING',
  'PARTIALLY_DELIVERED',
  'DELIVERED',
  'FAILED',
  'DEAD_LETTERED',
  'CANCELLED'
);

CREATE TYPE "DeliveryStatus" AS ENUM (
  'PENDING',
  'QUEUED',
  'PROCESSING',
  'SENT',
  'DELIVERED',
  'FAILED',
  'PERMANENT_FAILURE',
  'CANCELLED'
);

CREATE TYPE "NotificationChannel" AS ENUM (
  'SMS',
  'EMAIL',
  'PUSH'
);

CREATE TYPE "PreferenceScope" AS ENUM (
  'TENANT',
  'CUSTOMER',
  'STAFF'
);

-- ── event_outbox ──────────────────────────────────────────────────────────────
-- Transactional Outbox: domain event'lerin immutable, replay-safe kaydı.
-- KURAL: Domain write ile AYNI tx'e INSERT edilir. "Sonradan publish" YASAK.

CREATE TABLE "event_outbox" (
  "id"                   UUID         NOT NULL DEFAULT gen_random_uuid(),
  "tenantId"             UUID         NOT NULL,
  "aggregateType"        TEXT         NOT NULL,
  "aggregateId"          UUID         NOT NULL,
  "eventName"            TEXT         NOT NULL,
  "eventVersion"         INTEGER      NOT NULL DEFAULT 1,
  "occurredAt"           TIMESTAMPTZ  NOT NULL,
  "scheduledFor"         TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
  "status"               "OutboxEventStatus" NOT NULL DEFAULT 'PENDING',
  "partitionKey"         TEXT         NOT NULL,
  "correlationId"        UUID,
  "causationId"          UUID,
  "idempotencyKey"       TEXT         NOT NULL,
  "payload"              JSONB        NOT NULL DEFAULT '{}',
  "metadata"             JSONB        NOT NULL DEFAULT '{}',
  "dispatchedAt"         TIMESTAMPTZ,
  "processingStartedAt"  TIMESTAMPTZ,
  "completedAt"          TIMESTAMPTZ,
  "retryCount"           INTEGER      NOT NULL DEFAULT 0,
  "nextRetryAt"          TIMESTAMPTZ,
  "lastError"            TEXT,
  "createdAt"            TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
  "updatedAt"            TIMESTAMPTZ  NOT NULL DEFAULT NOW(),

  CONSTRAINT "event_outbox_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "event_outbox_tenant_idempotency_key"
    UNIQUE ("tenantId", "idempotencyKey"),
  CONSTRAINT "event_outbox_tenantId_fkey"
    FOREIGN KEY ("tenantId") REFERENCES "tenants" ("id") ON DELETE RESTRICT
);

-- Dispatcher polling: PENDING + zamanı gelmiş event'ler
CREATE INDEX "event_outbox_status_scheduled_retry_idx"
  ON "event_outbox" ("status", "scheduledFor", "nextRetryAt");

-- Partition-level ordering (aynı aggregate için sıralı işlem)
CREATE INDEX "event_outbox_partition_occurred_idx"
  ON "event_outbox" ("partitionKey", "occurredAt");

-- Tenant bazlı event sorgular (dashboard, audit)
CREATE INDEX "event_outbox_tenant_event_occurred_idx"
  ON "event_outbox" ("tenantId", "eventName", "occurredAt" DESC);

-- ── event_deliveries ─────────────────────────────────────────────────────────
-- Her event × kanal × alıcı için ayrı delivery denemesi kaydı.

CREATE TABLE "event_deliveries" (
  "id"                  UUID         NOT NULL DEFAULT gen_random_uuid(),
  "tenantId"            UUID         NOT NULL,
  "eventId"             UUID         NOT NULL,
  "channel"             "NotificationChannel" NOT NULL,
  "recipient"           TEXT         NOT NULL,
  "templateKey"         TEXT         NOT NULL,
  "templateVersion"     INTEGER      NOT NULL,
  "locale"              TEXT         NOT NULL DEFAULT 'tr',
  "provider"            TEXT,
  "providerMessageId"   TEXT,
  "status"              "DeliveryStatus" NOT NULL DEFAULT 'PENDING',
  "idempotencyKey"      TEXT         NOT NULL,
  "payload"             JSONB        NOT NULL DEFAULT '{}',
  "costEstimateMinor"   INTEGER,
  "actualCostMinor"     INTEGER,
  "attempts"            INTEGER      NOT NULL DEFAULT 0,
  "lastAttemptAt"       TIMESTAMPTZ,
  "nextAttemptAt"       TIMESTAMPTZ,
  "lastErrorCode"       TEXT,
  "lastErrorMessage"    TEXT,
  "sentAt"              TIMESTAMPTZ,
  "deliveredAt"         TIMESTAMPTZ,
  "createdAt"           TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
  "updatedAt"           TIMESTAMPTZ  NOT NULL DEFAULT NOW(),

  CONSTRAINT "event_deliveries_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "event_deliveries_tenant_idempotency_key"
    UNIQUE ("tenantId", "idempotencyKey"),
  CONSTRAINT "event_deliveries_tenantId_fkey"
    FOREIGN KEY ("tenantId") REFERENCES "tenants" ("id") ON DELETE RESTRICT,
  CONSTRAINT "event_deliveries_eventId_fkey"
    FOREIGN KEY ("eventId") REFERENCES "event_outbox" ("id") ON DELETE RESTRICT
);

-- Event bazlı kanal sorgusu
CREATE INDEX "event_deliveries_event_channel_idx"
  ON "event_deliveries" ("eventId", "channel");

-- Tenant bazlı kanal+durum sorgusu
CREATE INDEX "event_deliveries_tenant_channel_status_idx"
  ON "event_deliveries" ("tenantId", "channel", "status");

-- Retry scheduling: sonraki deneme zamanı gelmiş pending delivery'ler
CREATE INDEX "event_deliveries_status_next_attempt_idx"
  ON "event_deliveries" ("status", "nextAttemptAt");

-- ── notification_templates ───────────────────────────────────────────────────
-- Versioned, tenant-aware template deposu.
-- null tenantId = global default; tenant-specific override önceliklidir.

CREATE TABLE "notification_templates" (
  "id"              UUID    NOT NULL DEFAULT gen_random_uuid(),
  "tenantId"        UUID,   -- null = global default
  "channel"         "NotificationChannel" NOT NULL,
  "eventName"       TEXT    NOT NULL,
  "templateKey"     TEXT    NOT NULL,
  "version"         INTEGER NOT NULL DEFAULT 1,
  "locale"          TEXT    NOT NULL DEFAULT 'tr',
  "providerHint"    TEXT,
  "isActive"        BOOLEAN NOT NULL DEFAULT true,
  "subjectTemplate" TEXT,
  "bodyTemplate"    TEXT    NOT NULL,
  "variablesSchema" JSONB   NOT NULL DEFAULT '{}',
  "createdAt"       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  "updatedAt"       TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  CONSTRAINT "notification_templates_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "notification_templates_tenant_channel_event_locale_version_key"
    UNIQUE ("tenantId", "channel", "eventName", "locale", "version")
);

CREATE INDEX "notification_templates_event_channel_locale_idx"
  ON "notification_templates" ("eventName", "channel", "locale");

CREATE INDEX "notification_templates_tenant_event_idx"
  ON "notification_templates" ("tenantId", "eventName");

-- ── notification_preferences ─────────────────────────────────────────────────
-- Tenant / müşteri / personel bazlı bildirim tercihleri.

CREATE TABLE "notification_preferences" (
  "id"                    UUID    NOT NULL DEFAULT gen_random_uuid(),
  "tenantId"              UUID    NOT NULL,
  "scopeType"             "PreferenceScope" NOT NULL DEFAULT 'TENANT',
  "scopeId"               UUID    NOT NULL,
  "eventName"             TEXT    NOT NULL,
  "smsEnabled"            BOOLEAN NOT NULL DEFAULT true,
  "emailEnabled"          BOOLEAN NOT NULL DEFAULT true,
  "pushEnabled"           BOOLEAN NOT NULL DEFAULT false,
  "reminderOffsetMinutes" INTEGER NOT NULL DEFAULT 120,
  "quietHours"            JSONB,
  "createdAt"             TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  "updatedAt"             TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  CONSTRAINT "notification_preferences_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "notification_preferences_tenant_scope_event_key"
    UNIQUE ("tenantId", "scopeType", "scopeId", "eventName"),
  CONSTRAINT "notification_preferences_tenantId_fkey"
    FOREIGN KEY ("tenantId") REFERENCES "tenants" ("id") ON DELETE CASCADE
);

CREATE INDEX "notification_preferences_tenant_event_idx"
  ON "notification_preferences" ("tenantId", "eventName");

-- ── notification_usage ───────────────────────────────────────────────────────
-- Kanal bazlı kullanım ve maliyet ledger'ı.

CREATE TABLE "notification_usage" (
  "id"                 UUID    NOT NULL DEFAULT gen_random_uuid(),
  "tenantId"           UUID    NOT NULL,
  "channel"            "NotificationChannel" NOT NULL,
  "periodStart"        DATE    NOT NULL,
  "periodEnd"          DATE    NOT NULL,
  "sentCount"          INTEGER NOT NULL DEFAULT 0,
  "failedCount"        INTEGER NOT NULL DEFAULT 0,
  "estimatedCostMinor" INTEGER NOT NULL DEFAULT 0,
  "actualCostMinor"    INTEGER NOT NULL DEFAULT 0,
  "createdAt"          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  "updatedAt"          TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  CONSTRAINT "notification_usage_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "notification_usage_tenant_channel_period_key"
    UNIQUE ("tenantId", "channel", "periodStart", "periodEnd"),
  CONSTRAINT "notification_usage_tenantId_fkey"
    FOREIGN KEY ("tenantId") REFERENCES "tenants" ("id") ON DELETE CASCADE
);

CREATE INDEX "notification_usage_tenant_channel_period_idx"
  ON "notification_usage" ("tenantId", "channel", "periodStart");

-- ── Seed: Global template'ler ─────────────────────────────────────────────────
-- Tüm tenant'lara varsayılan SMS template'leri

INSERT INTO "notification_templates"
  ("id", "tenantId", "channel", "eventName", "templateKey", "version", "locale",
   "bodyTemplate", "variablesSchema", "isActive")
VALUES
  (gen_random_uuid(), NULL, 'SMS', 'booking.created', 'booking.created.sms', 1, 'tr',
   'Merhaba {{customerName}}, {{serviceName}} randevunuz {{startDate}} {{startTime}} için onaylandı. İptal: {{cancelUrl}}',
   '{"customerName":"string","serviceName":"string","startDate":"string","startTime":"string","cancelUrl":"string"}',
   true),

  (gen_random_uuid(), NULL, 'EMAIL', 'booking.created', 'booking.created.email', 1, 'tr',
   'Merhaba {{customerName}},\n\n{{serviceName}} hizmetiniz için randevunuz oluşturuldu.\n\nTarih: {{startDate}}\nSaat: {{startTime}}\nPersonel: {{staffName}}\nKonum: {{locationName}}\nRandevu Kodu: {{bookingCode}}\n\nİptal için: {{cancelUrl}}',
   '{"customerName":"string","serviceName":"string","startDate":"string","startTime":"string","staffName":"string","locationName":"string","bookingCode":"string","cancelUrl":"string"}',
   true),

  (gen_random_uuid(), NULL, 'SMS', 'booking.cancelled', 'booking.cancelled.sms', 1, 'tr',
   'Merhaba {{customerName}}, {{startDate}} {{startTime}} tarihli {{serviceName}} randevunuz iptal edildi.',
   '{"customerName":"string","serviceName":"string","startDate":"string","startTime":"string"}',
   true),

  (gen_random_uuid(), NULL, 'SMS', 'booking.reminder.due', 'booking.reminder.due.sms', 1, 'tr',
   'Hatırlatma: {{customerName}}, yarın {{startTime}} için {{serviceName}} randevunuz var. Konum: {{locationName}}',
   '{"customerName":"string","serviceName":"string","startTime":"string","locationName":"string"}',
   true),

  (gen_random_uuid(), NULL, 'SMS', 'payment.succeeded', 'payment.succeeded.sms', 1, 'tr',
   'Ödemeniz alındı. Randevu: {{serviceName}} {{startDate}} {{startTime}}. Tutar: {{amount}} TL',
   '{"serviceName":"string","startDate":"string","startTime":"string","amount":"string"}',
   true),

  (gen_random_uuid(), NULL, 'SMS', 'subscription.renewal.succeeded', 'subscription.renewal.succeeded.sms', 1, 'tr',
   'Calon aboneliğiniz yenilendi. Plan: {{planName}}, Sonraki yenileme: {{nextRenewalDate}}',
   '{"planName":"string","nextRenewalDate":"string"}',
   true),

  (gen_random_uuid(), NULL, 'SMS', 'subscription.renewal.failed', 'subscription.renewal.failed.sms', 1, 'tr',
   'Abonelik yenileme başarısız. Hesabınızı kontrol edin: {{renewalUrl}}',
   '{"renewalUrl":"string"}',
   true);
