# CALON SECRETS MANAGEMENT

This document defines how sensitive credentials are handled.

Purpose: Prevent secret leakage and ensure secure configuration.

---

# SECRET TYPES

The following values are considered secrets:

JWT_SECRET
DATABASE_URL
REDIS_PASSWORD
IYZICO_API_KEY
IYZICO_SECRET_KEY
SENTRY_DSN

These values must never be committed to the repository.

---

# ENVIRONMENT SEPARATION

Secrets must differ across environments.

development
staging
production

Production secrets must never be reused in development.

---

# SECRET STORAGE

Secrets must be stored in the deployment platform.

Examples:

Cloudflare
Render
Vercel
Railway

Never inside source code.

---

# LOCAL DEVELOPMENT

Local secrets must be stored in:

.env.local

This file must not be committed.

---

# SECURITY PRINCIPLE

If a secret is leaked:

1. Revoke it immediately
2. Rotate the credential
3. Audit system access
