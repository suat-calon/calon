# CALON INFRASTRUCTURE CONTRACT

This document defines the production infrastructure requirements for the Calon platform.

Purpose: Ensure operational stability and define failure boundaries.

---

# CORE SERVICES

## PostgreSQL

Role: Primary relational database.

Why required:
All business data is stored in PostgreSQL. Appointments, payments, customers, staff, billing subscriptions, event outbox, and audit records are all persisted here.

Failure impact:
Total system outage. No bookings, no payments, no data access. API returns 503.

---

## Redis

Role: Distributed cache, queue backend, distributed lock storage.

Why required:
- BullMQ queues depend on Redis for job persistence
- Booking slot holds use Redis distributed locks (SETNX)
- Rate limiting counters are stored in Redis
- ThrottlerGuard uses Redis for per-IP counters

Failure impact:
- New bookings cannot acquire slot locks
- Queue processing halts
- Rate limiting falls back or fails open

---

## API Server

Role: Core NestJS application serving all business logic.

Why required:
Handles all HTTP requests, authentication, business logic, and event production.

Failure impact:
All client-facing operations stop. Frontend cannot function.

---

## Worker

Role: Background job processor.

Why required:
Processes event dispatch, notification delivery, loyalty earning, stock deduction, and recovery jobs asynchronously.

Failure impact:
Notifications stop. Events accumulate in outbox. Recovery does not run. No data loss due to outbox durability, but delivery is delayed.

---

## Event Outbox

Role: Durable event backbone.

Why required:
Guarantees at-least-once event delivery. Events are written to PostgreSQL inside the same transaction as business operations, ensuring no event is lost on crash.

Failure impact:
If outbox processor stops, events queue up in the database. No data is lost. Delivery resumes when worker recovers.

---

## Queue (BullMQ)

Role: Async job queue backed by Redis.

Why required:
Decouples notification sending, inventory updates, and loyalty processing from synchronous request handling.

Failure impact:
Async operations are delayed. Sync API operations remain unaffected. Jobs are retried automatically when Redis recovers.

---

## Object Storage (Optional)

Role: File storage for gallery images and consent form uploads.

Why required:
Required only for CRM gallery and consent document features.

Failure impact:
Image upload and document download fail. Core booking and payment flows are unaffected.

---

# EXTERNAL SERVICES

## Iyzico

Role: Payment infrastructure.

Integration: Payment creation, checkout form, and webhook confirmation.

Failure impact:
New payments cannot be initiated. Existing confirmed bookings are unaffected. Webhook retries will resume delivery when service recovers.

---

## Cloudflare

Role: DNS, reverse proxy, DDoS protection, and edge caching.

Integration: All public traffic routes through Cloudflare before reaching the API.

Failure impact:
Public traffic cannot reach the platform. Direct IP access may remain functional if configured.

---

## Vercel

Role: Frontend hosting for the customer-facing booking page and management panel.

Integration: Static and server-rendered Next.js applications deployed via Vercel.

Failure impact:
Frontend unavailable. API remains operational. Direct API access is unaffected.

---

# NETWORK TOPOLOGY

Production request flow:

```
Client
  ↓
Cloudflare  (DNS / DDoS / proxy)
  ↓
Frontend  (Vercel — Next.js)
  ↓
API Server  (NestJS — port 4000)
  ↓
  ├── PostgreSQL  (primary data store)
  └── Redis       (queues / locks / rate limiting)
```

Worker process runs alongside the API and connects to the same PostgreSQL and Redis instances.

```
Worker (BullMQ processors)
  ↓
  ├── PostgreSQL  (event_outbox, event_deliveries)
  └── Redis       (job queues)
        ↓
     Provider Adapters  (SMS / Email / Push)
```

---

# MINIMUM PRODUCTION REQUIREMENTS

## API Server

CPU: 1 vCPU minimum, 2 vCPU recommended
RAM: 512 MB minimum, 1 GB recommended

## Worker

CPU: 1 vCPU
RAM: 512 MB

## PostgreSQL

CPU: 1 vCPU minimum
RAM: 1 GB minimum
Disk: 20 GB minimum, SSD required

## Redis

RAM: 256 MB minimum
Persistence: AOF enabled recommended

---

# FAILURE SCENARIOS

## PostgreSQL Down

Impact:
- API cannot serve any data
- All write operations fail
- Worker cannot read or write outbox
- Booking engine is fully unavailable

Recovery:
Restore from backup or failover to replica. No data loss if within backup window.

---

## Redis Down

Impact:
- BullMQ queues are unavailable
- Slot lock acquisition fails — new bookings blocked
- Rate limiting may fail open
- Worker job processing halts

Recovery:
Redis restart is typically fast. Jobs in BullMQ are persisted and resume automatically. Distributed locks expire naturally via TTL.

---

## Iyzico Down

Impact:
- New payment creation fails
- Checkout form cannot be generated
- Webhook delivery from Iyzico stops

Recovery:
Existing bookings are unaffected. Payment retries resume when Iyzico recovers. Webhook idempotency prevents duplicate processing.

---

# DEPLOYMENT PRINCIPLES

## Stateless API

The API server holds no local state.
All state lives in PostgreSQL and Redis.
Multiple API instances can run behind a load balancer without coordination.

## Immutable Database Migrations

Migrations are append-only.
Existing migration files are never modified.
Schema changes always create a new migration.

## Environment Validation

The application validates all required environment variables at startup.
Missing or invalid configuration causes the process to exit immediately.
Silent defaults are forbidden in production.

## Secrets Never in Code

All secrets are stored in the deployment platform environment configuration.
No credentials are committed to the repository.
`.env.local` is gitignored and never pushed.
