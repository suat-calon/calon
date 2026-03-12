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

REDIS_URL

Redis connection string used by:

- BullMQ
- rate limiting
- distributed locks

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
