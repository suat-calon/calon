# CALON PROJECT EXECUTION PROTOCOL v1

This document defines the **operational execution protocol** for the Calon platform.

Purpose:
Maintain architectural stability, prevent uncontrolled changes, and guide the system safely to the first production customer.

---

# COMMAND STRUCTURE

Project command hierarchy:

1. **Project Owner**
   - Suat Gökçe
   - Product Owner
   - Final architectural authority

2. **System Architecture Supervisor**
   - ChatGPT
   - Architecture reviewer
   - Context engineer
   - Execution advisor

3. **Execution Agents**
   - Claude
   - Codex
   - Antigravity
   - CI pipelines
   - Terminal automation

Execution agents **DO NOT make architectural decisions**.

They only execute instructions.

---

# PROJECT PHASE MODEL

The project progresses through the following locked phases:

FAZ0   GO-LIVE FREEZE
FAZ1   SECURITY & CONFIG
FAZ2   DEPLOYABILITY
FAZ3   CI/CD HARDENING
FAZ4   PAYMENT CERTIFICATION
FAZ5   NOTIFICATION PROVIDERS
FAZ6   OBSERVABILITY
FAZ7   STAGING PILOT
FAZ8   FIRST CUSTOMER

Rules:

- Phases must be completed sequentially.
- No skipping phases.
- No feature additions outside phase scope.
- Refactors outside phase scope are forbidden.

---

# EXECUTION PRINCIPLES

All engineering actions must follow:

1. Determinism
2. Reproducibility
3. Minimal change surface
4. Migration safety
5. Operational observability

---

# AI EXECUTION REPORT FORMAT

When execution agents return output, it must be delivered as raw data.

Format:

talimat çıktısıdır.
mesaj başı--------------------
<AI output / terminal / logs>
mesaj sonu--------------------

No modification is allowed inside the block.

---

# REFACTOR POLICY

Refactoring is only allowed when:

- It is necessary for a phase objective
- It does not change system architecture
- It does not modify public contracts

Forbidden refactors include:

- Architecture rewrites
- Schema redesign
- Queue architecture changes
- Event system redesign
- Booking FSM modifications

---

# OPERATIONAL GOAL

The primary project objective is:

**Reach the first paying production customer with a stable platform.**

Not feature expansion.

---

# GOVERNANCE PRINCIPLE

Stability > Speed
Determinism > Flexibility
Observability > Assumptions
