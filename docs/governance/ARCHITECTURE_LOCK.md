# CALON ARCHITECTURE LOCK

This document defines the locked architecture of the Calon platform.

These components are considered **core system invariants**.

They must not be replaced or redesigned without explicit architectural approval.

---

# CORE ARCHITECTURE

Backend Framework  
NestJS

Database  
PostgreSQL

ORM  
Prisma

Queue System  
BullMQ

Cache  
Redis

---

# EVENT BACKBONE

The system uses an **Outbox Pattern Event Architecture**.

Core tables:

event_outbox  
event_deliveries

Workers:

dispatcher  
notification worker  
recovery worker  
archive worker

---

# BOOKING ENGINE

Booking system guarantees:

- slot hold using Redis
- DB conflict prevention
- PostgreSQL EXCLUDE constraint
- FSM state transitions

Double booking prevention is enforced at the database level.

---

# PAYMENT FLOW

Payment architecture:

create payment → checkout → webhook → FSM update

Webhook processing is idempotent.

Payment confirmation must only occur through verified webhook events.

---

# MULTI TENANCY

Tenant isolation is mandatory.

Isolation is enforced by:

- database level constraints
- application level guards
- authenticated tenant context

Agents must not introduce cross-tenant data access.

---

# EVENT DELIVERY GUARANTEES

Event delivery guarantees:

- at-least-once delivery
- retry mechanism
- dead-letter queue
- recovery worker

Event processing must remain deterministic.

---

# OPERATIONAL REQUIREMENTS

The system must provide:

- deterministic behavior
- event traceability
- observability for failures
- operational recovery paths
