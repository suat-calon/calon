# CALON APPLICATION RUNTIME CONTRACT

This document defines the production runtime model for the Calon platform.

Purpose: Clarify how API and Worker services operate, start, scale, and fail in production.

---

# RUNTIME COMPONENTS

## API Service

Role: Serves all HTTP business logic — authentication, booking, billing, CRM, payments, and public endpoints.

Process type: Long-running HTTP server. Stateless. Horizontally scalable.

Startup dependency:
- PostgreSQL must be healthy
- Redis must be healthy

Failure effect:
All client-facing operations stop. Worker continues processing queued jobs independently.

---

## Worker Service

Role: Processes background jobs — event dispatch, notification delivery, loyalty earning, stock deduction, and outbox recovery.

Process type: Long-running queue consumer. Stateful only through Redis and PostgreSQL. Must be restart-safe.

Startup dependency:
- PostgreSQL must be healthy
- Redis must be healthy

Failure effect:
Async job processing halts. No data is lost — outbox entries remain in PostgreSQL and BullMQ jobs persist in Redis. Processing resumes automatically on restart.

---

## PostgreSQL

Role: Single source of truth for all business data.

Process type: Managed database server.

Startup dependency: None. First in startup order.

Failure effect: Total system outage. API and Worker cannot function.

---

## Redis

Role: Queue backend, distributed lock storage, and rate limiting counter store.

Process type: In-memory data store with AOF persistence.

Startup dependency: None. Starts in parallel with PostgreSQL.

Failure effect: BullMQ queues halt. Booking slot locks cannot be acquired. Rate limiting may fail open.

---

# API SERVICE MODEL

The API service must follow these rules:

**Stateless**
The API process holds no local state. All state lives in PostgreSQL and Redis. Any number of API instances can run simultaneously without coordination.

**HTTP only**
The API accepts HTTP requests and returns HTTP responses. It does not process background queues directly.

**No migration execution**
The API must not run database migrations on startup. Migrations are a deployment step, not a runtime step. Running migrations from every API instance on boot causes race conditions in multi-instance environments.

**No background queue processing**
The API must not start BullMQ processors or outbox polling loops. These responsibilities belong exclusively to the Worker service.

**Health endpoint required**
The API must expose a health check endpoint.

Recommended path: `/api/v1/health`

The endpoint must return HTTP 200 when the service is ready to handle traffic. Container orchestrators and load balancers use this endpoint to determine readiness.

---

# WORKER SERVICE MODEL

The Worker service must follow these rules:

**Queue and outbox processing**
The Worker runs BullMQ processors for:
- event dispatch
- notification delivery (SMS, email, push)
- loyalty point calculation
- stock deduction
- dead-letter queue (DLQ) processing
- outbox recovery

**No HTTP traffic required**
The Worker does not need to expose an HTTP port. It communicates exclusively through PostgreSQL and Redis.

**Separate process from API**
The Worker must run as an independent process. It must not share a process with the API service. Separating them allows independent scaling, restarts, and failure isolation.

**Restart-safe**
On restart the Worker must:
- reconnect to Redis and PostgreSQL
- resume processing in-progress jobs without duplicating results
- not lose queued jobs (BullMQ persistence guarantees this via Redis)

---

# STARTUP ORDER

Services must start in the following order:

```
1. PostgreSQL   → wait until healthy (pg_isready)
2. Redis        → wait until healthy (redis-cli ping)
3. API          → start after PostgreSQL and Redis are healthy
4. Worker       → start after PostgreSQL and Redis are healthy
```

API and Worker may start in parallel once infrastructure services are healthy.

Container orchestration must enforce this order using health check dependencies.

Docker Compose example:

```
depends_on:
  postgres:
    condition: service_healthy
  redis:
    condition: service_healthy
```

---

# SCALING PRINCIPLES

## API

The API service is horizontally scalable.

Multiple API instances can run simultaneously behind a load balancer. Because the API is stateless, no session sharing or instance coordination is required.

## Worker

The Worker service must be scaled with care.

Multiple Worker instances increase throughput but require that job processing is idempotent. BullMQ provides job locking to prevent duplicate processing, but concurrent workers must be validated before scaling.

Recommended approach: start with a single Worker instance. Scale only after verifying idempotency guarantees under load.

## PostgreSQL

PostgreSQL remains the single source of truth.

Database connections are pooled. Horizontal API scaling increases connection demand. A connection pooler (such as PgBouncer) should be introduced when connection count becomes a bottleneck.

---

# FORBIDDEN RUNTIME PATTERNS

The following patterns are explicitly forbidden in production:

**API and Worker in the same process**
Running both HTTP server and queue processors in a single process couples their failure modes, prevents independent scaling, and complicates observability.

**Automatic schema mutation on every boot**
Running `prisma migrate deploy` or any schema-altering command automatically on API startup is forbidden. Schema changes must be applied as a controlled deployment step before the application boots.

**Secrets in image**
Container images must not contain secrets, credentials, or environment-specific configuration. All secrets are injected at runtime through environment variables from the deployment platform.

**Mutable container filesystem dependency**
The application must not rely on writing to or reading from the container's local filesystem for persistent data. All persistence must use PostgreSQL or Redis. Container filesystems are ephemeral and are lost on restart.

---

# DEPLOYMENT GOAL

The Calon runtime is designed to be:

**Repeatable**
The same image, with the same environment variables, produces the same runtime behavior every time.

**Deterministic**
Startup order is defined. Health checks gate readiness. No race conditions between services.

**Restart-safe**
Any service can be restarted at any time without data loss. PostgreSQL and Redis persist state. BullMQ jobs survive Worker restarts. Outbox entries survive API restarts.
