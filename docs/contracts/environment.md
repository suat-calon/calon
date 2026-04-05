# CALON ENVIRONMENT CONTRACT

This document defines all required environment variables for the Calon platform.

Purpose: Ensure deterministic configuration across environments.

---

# DATABASE

DATABASE_URL

PostgreSQL connection string.

Example:

postgresql://user:password@host:5432/calon

---

# REDIS

REDIS_HOST

Upstash (or compatible) Redis endpoint hostname.

REDIS_PORT

Redis port. Default: 6379.

REDIS_PASSWORD

Redis authentication password/token. Required in staging and production.

REDIS_TLS

Set to `true` to enable TLS. Required for Upstash (TLS mandatory).

Used by:

- BullMQ (job queue)
- rate limiting
- distributed locks
- idempotency key store

---

# JWT

JWT_SECRET

Secret used to sign authentication tokens.

Must be a strong random value.

---

# WEBHOOK SECURITY

IYZICO_WEBHOOK_SECRET

Secret used to verify iyzico webhook signature.

Webhook events must never be trusted without verification.

---

# SERVER

PORT

API server port.

Default:

3000

---

# NODE ENVIRONMENT

NODE_ENV

Allowed values:

development
staging
production

---

# LOGGING

LOG_LEVEL

Example values:

info
debug
warn
error

---

# OPTIONAL SERVICES

SENTRY_DSN

Error monitoring.

Optional but recommended in production.

---

# CONFIG PRINCIPLE

The system must fail fast if required environment variables are missing.

Silent defaults are forbidden in production.
