# Calon Stage Environment Wiring

## Isolation Rules

- Stage MUST use a **separate** Neon database (not a branch of prod)
- Stage MUST use a **separate** Cloud Redis instance (not shared with prod)
- Stage JWT_SECRET MUST differ from prod
- Stage payment keys MUST be sandbox/test keys

## API + Worker (Natro VDS)

File: `apps/api/.env.staging` (copy from `.env.staging.example`)

| Variable | Source | Notes |
|----------|--------|-------|
| `NODE_ENV` | hardcoded | `staging` |
| `PORT` | hardcoded | `4000` |
| `DATABASE_URL` | Neon dashboard | Stage project connection string with `?sslmode=require` |
| `REDIS_HOST` | Cloud Redis dashboard | Stage instance host |
| `REDIS_PORT` | Cloud Redis dashboard | Stage instance port |
| `REDIS_PASSWORD` | Cloud Redis dashboard | Stage instance password |
| `JWT_SECRET` | Generate | `openssl rand -base64 64` — unique to stage |
| `SITE_URL` | hardcoded | `https://stage.calon.com.tr` |
| `APP_URL` | hardcoded | `https://stage.calon.com.tr` |
| `BOOKING_URL` | hardcoded | `https://stage-book.calon.com.tr` |
| `API_URL` | hardcoded | `https://stage-api.calon.com.tr` |
| `CORS_ORIGIN` | hardcoded | `https://stage.calon.com.tr,https://stage-book.calon.com.tr` |
| `IYZICO_API_KEY` | Iyzico sandbox | Sandbox merchant key |
| `IYZICO_SECRET_KEY` | Iyzico sandbox | Sandbox merchant secret |
| `IYZICO_BASE_URL` | hardcoded | `https://sandbox-api.iyzipay.com` |
| `LOG_LEVEL` | hardcoded | `info` |
| `BULL_PREFIX` | hardcoded | `stage` |

## Web (Vercel)

Set via Vercel project → Settings → Environment Variables (Preview/Production):

| Variable | Value |
|----------|-------|
| `NEXT_PUBLIC_API_URL` | `https://stage-api.calon.com.tr` |
| `NEXT_PUBLIC_SITE_URL` | `https://stage.calon.com.tr` |
| `NEXT_PUBLIC_BOOKING_URL` | `https://stage-book.calon.com.tr` |

## Booking (Vercel)

Set via Vercel project → Settings → Environment Variables:

| Variable | Value |
|----------|-------|
| `NEXT_PUBLIC_API_URL` | `https://stage-api.calon.com.tr` |
| `NEXT_PUBLIC_SITE_URL` | `https://stage.calon.com.tr` |
| `NEXT_PUBLIC_BOOKING_URL` | `https://stage-book.calon.com.tr` |

## Cloudflare DNS

Set via Cloudflare dashboard → DNS:

| Record | Type | Value | Proxy |
|--------|------|-------|-------|
| `stage` | CNAME | `cname.vercel-dns.com` | DNS only (grey cloud) |
| `stage-book` | CNAME | `cname.vercel-dns.com` | DNS only (grey cloud) |
| `stage-api` | A | `<natro-vds-ip>` | Proxied (orange cloud) |

Note: Vercel requires DNS-only (no Cloudflare proxy) for custom domains.
Cloudflare proxy for API provides SSL termination + DDoS protection.

## Neon Stage Database

1. Create new Neon project: `calon-stage`
2. Copy connection string to `DATABASE_URL`
3. Run migration: `npx prisma migrate deploy`
4. Run seed: `npx prisma db seed`

**NEVER use `db push` on stage.** Only `migrate deploy`.

## Cloud Redis Stage Instance

1. Create separate Redis instance for stage
2. Copy host/port/password to env
3. Verify `BULL_PREFIX=stage` is set
4. Stage and prod queues MUST NOT share the same Redis instance

## Checklist Before First Deploy

- [ ] Neon stage project created
- [ ] Neon connection string in .env.staging
- [ ] Redis stage instance created
- [ ] Redis credentials in .env.staging
- [ ] JWT_SECRET generated (unique, not same as prod)
- [ ] Cloudflare DNS records created
- [ ] Vercel projects created with env vars
- [ ] Iyzico sandbox keys in .env.staging
- [ ] CORS_ORIGIN matches stage domains
- [ ] BULL_PREFIX=stage confirmed
