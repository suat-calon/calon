# CALON DATABASE MIGRATION POLICY

This document defines the migration safety rules for the Calon platform.

Purpose: Prevent schema drift and migration corruption.

---

# MIGRATION PRINCIPLE

Database migrations follow a strict **append-only model**.

Existing migrations must never be:

- modified
- deleted
- reordered

---

# SCHEMA CHANGE PROCESS

If a schema change is required:

1. Update schema.prisma
2. Generate a new migration

Example:

prisma migrate dev --name add_new_field

Never edit an existing migration file.

---

# MIGRATION HISTORY

The migration history folder represents the chronological evolution of the database schema.

Changing old migrations breaks:

- database reproducibility
- staging environment consistency
- production rollback safety

---

# MIGRATION DRIFT

Schema drift occurs when:

- the database schema differs from migration history
- local schema differs from repository schema

This situation must be prevented.

---

# CI VALIDATION (PLANNED)

In CI pipeline the following checks will be enforced:

prisma migrate status
prisma validate

These checks will ensure migration parity.

---

# PRODUCTION RULE

Production database migrations must only run through controlled deployment pipelines.

Manual migration execution is discouraged.
