# Calon Stage Deploy Runbook

## Provider Roles

| Provider | Role |
|----------|------|
| Oracle Cloud | Backend host (API + Worker). Ayni production instance (141.144.243.114), ayri compose stack |
| Natro | Domain registrar. Backend host DEGIL |
| Vercel | Web + Booking frontend hosting |
| Cloudflare | DNS otoritesi, SSL proxy, WAF |
| Neon | PostgreSQL. Stage = Neon branch (ayri project degil) |
| Upstash | Redis. Stage = ayri Upstash database (ayni instance degil, fiziksel izolasyon) |

## Topology

| Component | Platform | URL | Notes |
|-----------|----------|-----|-------|
| Web | Vercel | https://stage.calon.com.tr | Ayri Vercel project veya preview |
| Booking | Vercel | https://stage-book.calon.com.tr | Ayri Vercel project veya preview |
| API | Oracle Cloud / Docker | https://stage-api.calon.com.tr | Ayni host, ayri stack, port 4001 |
| Worker | Oracle Cloud / Docker | — (no public port) | Ayni host, ayri stack |
| Database | Neon (branch) | — (connection string) | Prod Neon project'in stage branch'i |
| Redis | Upstash (ayri database) | — (connection string) | Prod Upstash ile AYNI OLMAYACAK |
| DNS/SSL | Cloudflare | — | — |

### Stage API/Worker Izolasyon Modeli

Stage, production ile ayni Oracle Cloud instance (141.144.243.114) uzerinde calisir.
Izolasyon su sekilde saglanir:

- Ayri Docker Compose stack (docker-compose.staging.yml override)
- Ayri port: Stage API = 4001 (prod = 4000)
- Ayri Docker network: `calon_network_stage` (prod = `calon_network`)
- Ayri container adlari: `calon_stage_api`, `calon_stage_worker`
- Ayri .env.staging dosyasi

Bu yaklasimda ayri Oracle instance gerekli DEGILDIR.

## Domain Map (Cloudflare DNS)

| Record | Type | Value | Proxy |
|--------|------|-------|-------|
| stage.calon.com.tr | CNAME | cname.vercel-dns.com | DNS only |
| stage-book.calon.com.tr | CNAME | cname.vercel-dns.com | DNS only |
| stage-api.calon.com.tr | A | 141.144.243.114 | Proxied (orange) |

Cloudflare SSL mode: **Full (strict)**

Not: stage-api ayni IP'yi gosterir cunku ayni host uzerinde calisir.
Nginx/reverse-proxy stage-api subdomain'ini port 4001'e yonlendirir.

## Deploy Order

### 1. Infrastructure (one-time setup)

1. Neon dashboard'dan production project uzerinde stage branch olustur
2. Upstash dashboard'dan ayri bir Redis database olustur (fiziksel izolasyon)
3. Cloudflare'de DNS kayitlarini olustur (yukaridaki domain map)
4. Oracle host uzerinde Nginx'e stage-api reverse proxy kuralini ekle (port 4001)
5. Vercel'de stage project'leri olustur: `calon-stage-web`, `calon-stage-booking`
6. Tum platformlarda environment degiskenlerini ayarla

### 2. API + Worker (Oracle Cloud)

```bash
# SSH into Oracle Cloud
ssh ubuntu@141.144.243.114

# Pull latest code
cd /opt/calon && git pull origin dev

# Deploy stage stack (ayri compose override, port 4001)
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
# On Oracle Cloud (141.144.243.114)
docker compose -f docker-compose.yml -f docker-compose.staging.yml down
git checkout <previous-tag>
docker compose -f docker-compose.yml -f docker-compose.staging.yml up -d --build
```

### Web/Booking (Vercel)
Use Vercel dashboard → Deployments → Promote previous deployment.

### Database
Neon branch destekliyse: branch'i sil ve yeniden olustur.
Alternatif: Neon point-in-time restore.

## Vercel Stage Binding Rules (ZORUNLU)

### Domain binding
- `stage.calon.com.tr` → `calon` projesi → **Preview** environment → `dev` branch
- `stage-book.calon.com.tr` → `calon-booking` projesi → **Preview** environment → `dev` branch
- Stage domainler **Production** deployment'a baglanmayacak

### Preview environment variables

**Web (`calon`) — Preview only:**
- `NEXT_PUBLIC_API_URL=https://stage-api.calon.com.tr`
- `NEXT_PUBLIC_SITE_URL=https://stage.calon.com.tr`
- `NEXT_PUBLIC_BOOKING_URL=https://stage-book.calon.com.tr`

**Booking (`calon-booking`) — Preview only:**
- `NEXT_PUBLIC_API_URL=https://stage-api.calon.com.tr`
- `NEXT_PUBLIC_SITE_URL=https://stage.calon.com.tr`
- `NEXT_PUBLIC_BOOKING_URL=https://stage-book.calon.com.tr`

**Production env ayri tutulacak.** Preview env'ler Production'a sizmayacak.

### Build-time bake kurali
`NEXT_PUBLIC_*` degiskenleri **build time'da** Next.js'e bake edilir.
Env degisikligi sonrasi **yeni Preview build / redeploy ZORUNLUDUR**.
Sadece env degistirmek yeterli degildir — yeni build tetiklenmeli:
- Vercel dashboard → Deployments → Redeploy
- veya `git push origin dev` ile yeni commit

### Browser dogrulama (deploy sonrasi zorunlu)
- `stage.calon.com.tr/login` acilir
- login submit basarili olur (502 degil, 200)
- dashboard tenant verisiyle yuklenir
- `stage-book.calon.com.tr/booking/{slug}` acilir
- booking yüzeyi stage API'den gercek veri ceker

### Yasaklar
- stage domain'i production'a baglamak YASAK
- localhost fallback ile birakmak YASAK
- env degistirip redeploy almadan testi tamamlandi saymak YASAK
- Vercel Authentication preview deploy'lari blokluyorsa kapatilmali

## Fail-Fast Rules

- If `migrate deploy` fails → STOP. Do not start API.
- If API health fails after 30s → STOP. Check logs.
- If login returns non-200 → STOP. Check env/secrets.
- If browser smoke shows auth loop → STOP. Check CORS/cookie config.
- If stage web login returns 502 → STOP. Check Vercel env + rebuild.
- Never proceed to next step if current step failed.
