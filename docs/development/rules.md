# CALON DEVELOPMENT RULES

This document defines the repository development rules for the Calon platform.

Purpose:
Prevent uncontrolled changes while preparing the system for production.

---

# REPOSITORY STATE

The project is currently in **production preparation mode**.

Feature development is temporarily frozen.

Only the following types of changes are allowed:

- bug fixes
- infrastructure preparation
- security improvements
- observability improvements
- provider integrations
- deployment readiness work

---

# FORBIDDEN CHANGES

During this phase the following changes are forbidden:

- adding new product features
- architectural refactors
- dependency major upgrades
- redesign of core modules

---

# DATABASE SAFETY

Database migrations must follow **append-only policy**.

Existing migrations must never be modified.

If a schema change is required:

Create a new migration.

---

# BRANCH RULES

Branches:

main → production candidate
dev → development branch

No direct commits to main.

All changes must go through dev.

---

# ENGINEERING GOAL

The current goal of the project is:

**Prepare the platform for production deployment and first paying customer.**

Feature expansion is not part of the current objective.

---

# STABILITY PRINCIPLE

System stability is prioritized over development speed.

Breaking the architecture or data safety rules is unacceptable.
