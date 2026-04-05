# Calon Stage Environment Wiring

## Provider Roles

| Provider | Role | Stage'deki gorevi |
|----------|------|-------------------|
| Oracle Cloud | Backend host | Ayni instance (141.144.243.114), ayri compose stack, port 4001 |
| Natro | Domain registrar | Sadece alan adi yonetimi. Backend host DEGIL |
| Vercel | Frontend hosting | Web + Booking stage project'leri |
| Cloudflare | DNS / SSL / WAF | Stage subdomain'leri yonetir |
| Neon | PostgreSQL | Stage = prod project uzerinde ayri branch |
| Upstash | Redis | Stage = fiziksel olarak ayri database (ayni redis YASAK) |

## Isolation Rules

- Stage DB: Neon **branch** kullanilir (ayri project degil). Prod branch'ten izole.
- Stage Redis: Upstash uzerinde **ayri database**. Prod Redis URL'i ile paylasim YASAK.
- Stage JWT_SECRET: Prod'dan FARKLI olmali.
- Stage payment keys: Iyzico sandbox/test keys kullanilmali.
- Stage API port: 4001 (prod = 4000). Ayni host, ayri stack.

Not: Redis key prefix (ornegin `BULL_PREFIX=stage`) ek isimlendirme olarak kullanilabilir
ama izolasyon mekanizmasi degildir. Gercek izolasyon ayri REDIS_HOST/PASSWORD ile saglanir.

## API + Worker (Oracle Cloud — ayni instance, ayri stack)

File: `apps/api/.env.staging` (copy from `.env.staging.example`)

| Variable | Source | Notes |
|----------|--------|-------|
| `NODE_ENV` | hardcoded | `staging` |
| `PORT` | hardcoded | `4001` (prod'dan farkli) |
| `DATABASE_URL` | Neon dashboard | Stage **branch** connection string, `?sslmode=require` |
| `REDIS_HOST` | Upstash dashboard | Upstash endpoint (ornek: XXXX.upstash.io) |
| `REDIS_PORT` | Upstash dashboard | Upstash port (genellikle 6379) |
| `REDIS_PASSWORD` | Upstash dashboard | Upstash password/token |
| `REDIS_TLS` | hardcoded | `true` — Upstash TLS zorunlu |
| `JWT_SECRET` | Generate | `openssl rand -base64 64` — prod'dan farkli olmali |
| `SITE_URL` | hardcoded | `https://stage.calon.com.tr` |
| `APP_URL` | hardcoded | `https://stage.calon.com.tr` |
| `BOOKING_URL` | hardcoded | `https://stage-book.calon.com.tr` |
| `API_URL` | hardcoded | `https://stage-api.calon.com.tr` |
| `CORS_ORIGIN` | hardcoded | `https://stage.calon.com.tr,https://stage-book.calon.com.tr` |
| `IYZICO_API_KEY` | Iyzico sandbox | Sandbox merchant key |
| `IYZICO_SECRET_KEY` | Iyzico sandbox | Sandbox merchant secret |
| `IYZICO_BASE_URL` | hardcoded | `https://sandbox-api.iyzipay.com` |
| `LOG_LEVEL` | hardcoded | `info` |
| `BULL_PREFIX` | hardcoded | `stage` (ek isimlendirme, izolasyon icin degil) |

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
| `stage-api` | A | `141.144.243.114` | Proxied (orange cloud) |

Note: Vercel requires DNS-only (no Cloudflare proxy) for custom domains.
Cloudflare proxy for API provides SSL termination + DDoS protection.
stage-api ayni IP'yi gosterir; Nginx port 4001'e yonlendirir.

## Neon Stage Database

1. Neon dashboard'dan production project uzerinde **branch** olustur (ornek ad: `stage`)
2. Branch connection string'ini `DATABASE_URL`'e kopyala
3. Run migration: `npx prisma migrate deploy`
4. Run seed: `npx prisma db seed`

**NEVER use `db push` on stage.** Only `migrate deploy`.

Neon branch avantajlari:
- Schema prod ile senkron baslar
- Ayri compute endpoint
- Ayri connection string
- Prod data'ya erisim yok (branch snapshot'i)

## Upstash Stage Redis

1. Upstash console'dan **ayri bir database** olustur (ornek ad: `calon-stage`)
2. Endpoint → REDIS_HOST, port → REDIS_PORT, password → REDIS_PASSWORD olarak env'e kopyala
3. `BULL_PREFIX=stage` ek guvenlik olarak ayarla
4. Stage ve prod ayni Upstash database'i PAYLASAMAZ

Onemli: Prefix (BULL_PREFIX) tek basina izolasyon mekanizmasi degildir.
Gercek izolasyon ayri REDIS_HOST/PASSWORD ile saglanir.
Prefix sadece key isimlendirmesinde ek netlik saglar.

## Checklist Before First Deploy

- [ ] Neon stage branch olusturuldu
- [ ] Neon branch connection string .env.staging'e girildi
- [ ] Upstash stage database olusturuldu
- [ ] Upstash stage REDIS_HOST/PORT/PASSWORD .env.staging'e girildi
- [ ] REDIS_TLS=true .env.staging'de ayarlandi
- [ ] JWT_SECRET uretildi (prod'dan farkli)
- [ ] Cloudflare DNS kayitlari olusturuldu (3 kayit)
- [ ] Oracle host'ta Nginx stage-api → port 4001 kurali eklendi
- [ ] Vercel stage project'leri olusturuldu ve env'ler girildi
- [ ] Iyzico sandbox keys .env.staging'e girildi
- [ ] CORS_ORIGIN stage domain'lere eslestirildi
- [ ] PORT=4001 stage env'de onaylandi
