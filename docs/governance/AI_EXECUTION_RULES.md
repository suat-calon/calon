# CALON AI EXECUTION RULES

This document defines rules for AI execution agents interacting with the repository.

Agents include:

- Claude
- Codex
- Cursor
- Antigravity
- Any automated coding assistant

---

# AGENT PERMISSION MODEL

AI agents may:

- Implement tasks
- Write code
- Fix bugs
- Add missing implementations
- Follow explicit instructions

AI agents may NOT:

- Redesign architecture
- Change infrastructure topology
- Rewrite core system modules
- Replace major dependencies
- Rewrite migration history

---

# MIGRATION POLICY

Database migrations are **append-only**.

Agents must NEVER:

- modify existing migrations
- reorder migrations
- delete migrations

If schema changes are required:

Create a **new migration only**.

---

# DEPENDENCY POLICY

Major dependency upgrades are forbidden unless explicitly approved.

Forbidden examples:

- NestJS major upgrade
- Prisma major upgrade
- BullMQ replacement
- PostgreSQL replacement

---

# INFRASTRUCTURE RULES

The infrastructure stack is fixed:

Backend: NestJS  
Database: PostgreSQL  
ORM: Prisma  
Queue: BullMQ  
Cache: Redis  
Event system: Outbox pattern

AI agents must not change these components.

---

# EVENT SYSTEM RULES

The following systems are locked:

- event_outbox
- event_deliveries
- dispatcher worker
- retry system
- DLQ mechanism

Agents may extend functionality but cannot redesign the architecture.

---

# BOOKING SYSTEM RULES

Booking system invariants:

- Redis hold lock
- PostgreSQL conflict prevention
- EXCLUDE constraint
- FSM based appointment lifecycle

These mechanisms must not be replaced.

---

# PAYMENT SYSTEM RULES

Payment system guarantees:

- webhook idempotency
- deterministic FSM state transition
- audit-safe payment confirmation

Agents may not bypass webhook validation logic.

---

# SECURITY RULES

Agents must not:

- weaken authentication
- bypass webhook verification
- disable tenant isolation

---

# DEFAULT AGENT BEHAVIOR

When uncertain:

- Do nothing
- Ask for clarification
