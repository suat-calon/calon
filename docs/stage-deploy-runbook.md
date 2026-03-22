# Calon Stage Deploy Runbook

## Topology

| Component | Platform | URL | Port |
|-----------|----------|-----|------|
| Web | Vercel | https://stage.calon.com.tr | — |
| Booking | Vercel | https://stage-book.calon.com.tr | — |
| API | Natro VDS / Docker | https://stage-api.calon.com.tr | 4000 (internal) |
| Worker | Natro VDS / Docker | — (no public port) | — |
| Database | Neon | — (connection string) | 5432 |
| Redis | Cloud Redis (separate instance) | — (connection string) | 6379 |
| DNS/SSL | Cloudflare | — | — |

## Domain Map (Cloudflare DNS)

| Record | Type | Value | Proxy |
|--------|------|-------|-------|
| stage.calon.com.tr | CNAME | cname.vercel-dns.com | DNS only |
| stage-book.calon.com.tr | CNAME | cname.vercel-dns.com | DNS only |
| stage-api.calon.com.tr | A | `<natro-vds-ip>` | Proxied (orange) |

Cloudflare SSL mode: **Full (strict)**

## Deploy Order

### 1. Infrastructure (one-time setup)

1. Create Neon stage database (separate project, NOT a branch of prod)
2. Create Cloud Redis stage instance (separate instance, NOT shared with prod)
3. Create Cloudflare DNS records
4. Create Vercel projects: `calon-stage-web`, `calon-stage-booking`
5. Set environment variables on all platforms

### 2. API + Worker (Natro VDS)

```bash
# SSH into Natro VDS
ssh deploy@<natro-vds-ip>

# Pull latest code
cd /opt/calon && git pull origin dev

# Deploy
./scripts/stage/deploy-api.sh
./scripts/stage/deploy-worker.sh
```

### 3. Web + Booking (Vercel)

Push to `dev` branch triggers Vercel preview deploy.
Or manually via Vercel CLI:

```bash
# Web
cd apps/web && vercel --prod --env-file=.env.staging

# Booking
cd apps/booking && vercel --prod --env-file=.env.staging
```

### 4. Post-Deploy Verification

```bash
./scripts/stage/smoke-api.sh
# Then manual browser smoke per docs/stage-browser-smoke.md
```

## Smoke Order

1. API health → login → auth/me → tenants/me → staff
2. Browser: login → calendar → booking → catalog → customers
3. Polling/realtime regression check

## Rollback

### API/Worker
```bash
# On Natro VDS
docker compose -f docker-compose.yml -f docker-compose.staging.yml down
git checkout <previous-tag>
docker compose -f docker-compose.yml -f docker-compose.staging.yml up -d --build
```

### Web/Booking (Vercel)
Use Vercel dashboard → Deployments → Promote previous deployment.

### Database
Neon supports point-in-time restore. If migration broke schema:
1. Restore Neon to pre-deploy timestamp
2. Redeploy previous API version

## Fail-Fast Rules

- If `migrate deploy` fails → STOP. Do not start API.
- If API health fails after 30s → STOP. Check logs.
- If login returns non-200 → STOP. Check env/secrets.
- If browser smoke shows auth loop → STOP. Check CORS/cookie config.
- Never proceed to next step if current step failed.
