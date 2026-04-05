# Production ENV Contract — Calon OS

**Son guncelleme:** 2026-03-23 (infra/provider drift duzeltmesi)
**Validation:** `apps/api/src/config/env.validation.ts` (Joi schema)
**Template:** `apps/api/.env.example`

---

## ENV Degiskenleri

### Core

| Env Var | Tip | Zorunlu | Default | Kullanim |
|---------|-----|---------|---------|----------|
| `NODE_ENV` | enum (development, staging, production) | ✅ | — | Global (dev-exception filter, logging, Swagger) |
| `PORT` | number | — | 4000 | `main.ts` — API dinleme portu |

### Database

| Env Var | Tip | Zorunlu | Default | Kullanim |
|---------|-----|---------|---------|----------|
| `DATABASE_URL` | uri | ✅ | — | Prisma client, outbox-listener |

**Not:** `calon_app` rolu kullan, `postgres` superuser degil. connection_limit: dev=5, prod=10, pgbouncer=1.

### Redis

| Env Var | Tip | Zorunlu | Default | Kullanim |
|---------|-----|---------|---------|----------|
| `REDIS_HOST` | string | — | localhost | redis.module.ts (ioredis + BullMQ) |
| `REDIS_PORT` | number | — | 6379 | redis.module.ts |
| `REDIS_PASSWORD` | string | — | (bos) | redis.module.ts — production'da zorunlu |

### Auth

| Env Var | Tip | Zorunlu | Default | Kullanim |
|---------|-----|---------|---------|----------|
| `JWT_SECRET` | string (min 32) | ✅ | — | app.module.ts (JwtModule) |

**Not:** `openssl rand -base64 64` ile uret. Access token TTL: 15 dk.

### Odeme (Iyzico)

| Env Var | Tip | Zorunlu | Default | Kullanim |
|---------|-----|---------|---------|----------|
| `IYZICO_API_KEY` | string (min 10) | ✅ | — | iyzico.service.ts |
| `IYZICO_SECRET_KEY` | string (min 10) | ✅ | — | iyzico.service.ts |
| `IYZICO_BASE_URL` | uri | — | `https://sandbox-api.iyzipay.com` | iyzico.service.ts — prod: `https://api.iyzipay.com` |
| `IYZICO_CALLBACK_URL` | uri | — | — | iyzico.service.ts (opsiyonel webhook URL) |

### Platform URL'leri

| Env Var | Tip | Zorunlu | Default (dev) | Production Degeri |
|---------|-----|---------|---------------|-------------------|
| `SITE_URL` | uri | — | `http://localhost:3000` | `https://calon.com.tr` |
| `APP_URL` | uri | — | `http://localhost:3000` | `https://app.calon.com.tr` |
| `BOOKING_URL` | uri | — | `http://localhost:3001` | `https://book.calon.com.tr` |
| `API_URL` | uri | — | `http://localhost:4000` | `https://api.calon.com.tr` |

**Kullanim:** `platform.ts` (link uretimi), `billing.controller.ts` (Iyzico callback URL).

### CORS

| Env Var | Tip | Zorunlu | Default (dev) | Kullanim |
|---------|-----|---------|---------------|----------|
| `CORS_ORIGIN` | string | — | `http://localhost:3000,http://localhost:3001` | main.ts — virgulle ayrilmis origin listesi |

### Observability

| Env Var | Tip | Zorunlu | Default | Kullanim |
|---------|-----|---------|---------|----------|
| `LOG_LEVEL` | enum (debug, info, warn, error) | — | info | logging.module.ts |
| `SENTRY_DSN` | string | — | — | Sentry error tracking (production) |
| `ADMIN_API_KEY` | string (min 32) | — | — | admin.guard.ts — yoksa 401 doner |

### Rate Limiting

| Env Var | Tip | Zorunlu | Default | Kullanim |
|---------|-----|---------|---------|----------|
| `PUBLIC_RATE_TTL_MS` | number | — | 60000 | public.controller.ts — rate limit penceresi |
| `PUBLIC_HOLDS_LIMIT` | number | — | 10 | public.controller.ts — hold istegi limiti |
| `PUBLIC_BOOK_LIMIT` | number | — | 5 | public.controller.ts — booking istegi limiti |

### Archive

| Env Var | Tip | Zorunlu | Default | Kullanim |
|---------|-----|---------|---------|----------|
| `ARCHIVE_RETENTION_DAYS` | number | — | 90 | archive.service.ts — arsiv saklama suresi |

---

## Production Deployment Checklist

```
[ ] NODE_ENV=production
[ ] DATABASE_URL → Neon production connection string (calon_app rolu)
[ ] REDIS_HOST → Upstash Redis production host
[ ] REDIS_PASSWORD → Upstash Redis sifre
[ ] JWT_SECRET → minimum 32 karakter, random (openssl rand -base64 64)
[ ] IYZICO_API_KEY → gercek merchant key
[ ] IYZICO_SECRET_KEY → gercek merchant secret
[ ] IYZICO_BASE_URL=https://api.iyzipay.com (sandbox DEGIL)
[ ] SITE_URL=https://calon.com.tr
[ ] APP_URL=https://app.calon.com.tr
[ ] BOOKING_URL=https://book.calon.com.tr
[ ] API_URL=https://api.calon.com.tr
[ ] CORS_ORIGIN → production domain'ler (virgul ayrimli)
[ ] SENTRY_DSN → production Sentry projesi
[ ] ADMIN_API_KEY → guclu random key (opsiyonel ama onerilen)
[ ] LOG_LEVEL=info (veya warn)
```

---

## Ortam Farklari

| Degisken | Development | Staging | Production |
|----------|-------------|---------|------------|
| `NODE_ENV` | development | staging | production |
| `DATABASE_URL` | localhost calon_dev | Neon staging | Neon production |
| `REDIS_HOST` | localhost | Upstash staging | Upstash production |
| `IYZICO_BASE_URL` | sandbox-api | sandbox-api | api.iyzipay.com |
| `CORS_ORIGIN` | localhost:3000,3001 | staging domain | production domain'ler |
| `LOG_LEVEL` | debug | info | info/warn |

---

## Fail-Fast Davranisi

Joi validation `ConfigModule.forRoot()` icinde calisir. Eksik veya hatali env var'da uygulama **baslamaz** ve hatali degiskeni raporlar:

```
Error: Config validation error: "JWT_SECRET" is required
```

Bu, production'da yanlis konfigurasyonla calismayi onler.
