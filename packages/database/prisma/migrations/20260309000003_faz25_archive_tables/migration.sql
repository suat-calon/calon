-- ============================================================================
-- FAZ 25 — Arşiv Tabloları (MVP-GATE-1)
-- Terminal duruma geçmiş EventOutbox / EventDelivery satırlarının
-- 30 gün sonra taşındığı cold storage tabloları.
--
-- Tasarım kararları:
--   - FK kısıtı YOK: tenant silinse bile arşiv kayıtları korunur.
--   - status sütunları STRING: enum bağımlılığı olmadan okunabilir.
--   - archivedAt: arşive taşındığı anı işaretler.
-- ============================================================================

-- ── event_outbox_archive ─────────────────────────────────────────────────────
CREATE TABLE "event_outbox_archive" (
  "id"                   UUID        NOT NULL,
  "tenantId"             UUID        NOT NULL,
  "aggregateType"        TEXT        NOT NULL,
  "aggregateId"          UUID        NOT NULL,
  "eventName"            TEXT        NOT NULL,
  "eventVersion"         INTEGER     NOT NULL DEFAULT 1,
  "occurredAt"           TIMESTAMPTZ NOT NULL,
  "scheduledFor"         TIMESTAMPTZ NOT NULL,
  "status"               TEXT        NOT NULL,
  "partitionKey"         TEXT        NOT NULL,
  "correlationId"        UUID,
  "causationId"          UUID,
  "idempotencyKey"       TEXT        NOT NULL,
  "payload"              JSONB       NOT NULL,
  "metadata"             JSONB       NOT NULL DEFAULT '{}',
  "dispatchedAt"         TIMESTAMPTZ,
  "processingStartedAt"  TIMESTAMPTZ,
  "completedAt"          TIMESTAMPTZ,
  "retryCount"           INTEGER     NOT NULL DEFAULT 0,
  "nextRetryAt"          TIMESTAMPTZ,
  "lastError"            TEXT,
  "createdAt"            TIMESTAMPTZ NOT NULL,
  "updatedAt"            TIMESTAMPTZ NOT NULL,
  "archivedAt"           TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  CONSTRAINT "event_outbox_archive_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "event_outbox_archive_tenantId_eventName_idx"
  ON "event_outbox_archive" ("tenantId", "eventName", "occurredAt" DESC);

CREATE INDEX "event_outbox_archive_archivedAt_idx"
  ON "event_outbox_archive" ("archivedAt");

-- ── event_delivery_archive ───────────────────────────────────────────────────
CREATE TABLE "event_delivery_archive" (
  "id"                  UUID        NOT NULL,
  "tenantId"            UUID        NOT NULL,
  "eventId"             UUID        NOT NULL,
  "channel"             TEXT        NOT NULL,
  "recipient"           TEXT        NOT NULL,
  "templateKey"         TEXT        NOT NULL,
  "templateVersion"     INTEGER     NOT NULL,
  "locale"              TEXT        NOT NULL DEFAULT 'tr',
  "provider"            TEXT,
  "providerMessageId"   TEXT,
  "status"              TEXT        NOT NULL,
  "idempotencyKey"      TEXT        NOT NULL,
  "payload"             JSONB       NOT NULL,
  "costEstimateMinor"   INTEGER,
  "actualCostMinor"     INTEGER,
  "attempts"            INTEGER     NOT NULL DEFAULT 0,
  "lastAttemptAt"       TIMESTAMPTZ,
  "nextAttemptAt"       TIMESTAMPTZ,
  "lastErrorCode"       TEXT,
  "lastErrorMessage"    TEXT,
  "sentAt"              TIMESTAMPTZ,
  "deliveredAt"         TIMESTAMPTZ,
  "createdAt"           TIMESTAMPTZ NOT NULL,
  "updatedAt"           TIMESTAMPTZ NOT NULL,
  "archivedAt"          TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  CONSTRAINT "event_delivery_archive_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "event_delivery_archive_tenantId_channel_idx"
  ON "event_delivery_archive" ("tenantId", "channel", "status");

CREATE INDEX "event_delivery_archive_eventId_idx"
  ON "event_delivery_archive" ("eventId");

CREATE INDEX "event_delivery_archive_archivedAt_idx"
  ON "event_delivery_archive" ("archivedAt");
