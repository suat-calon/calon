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

---

## Kanonik Stage Deploy Akisi (Oracle Cloud Backend)

### ONKOSUL

Deploy oncesi su eslesmeler dogrulanmali:
- `apps/api/.env.staging` mevcut ve dolu
- SSH erisimi calisiyor
- Hedef commit `origin/dev` uzerinde

### ADIM 1: Repo Senkronizasyonu (ZORUNLU)

```bash
ssh ubuntu@141.144.243.114
cd /home/ubuntu/calon

# KANONIK YONTEM — git pull KULLANILMAZ
git fetch origin
git reset --hard origin/dev
```

**Neden `git pull` yeterli degil:**
`dev` branch'i amend/rebase/force-push gecmisi yasayabilir.
`git pull` bu durumda merge conflict olusturur veya eski commit'te kalir.
`git fetch + reset --hard origin/dev` her zaman remote HEAD'e eslesir.

### ADIM 2: Commit Dogrulamasi (ZORUNLU)

```bash
echo "LOCAL:  $(git rev-parse HEAD)"
echo "REMOTE: $(git rev-parse origin/dev)"
```

Bu iki deger AYNI olmali. Farkli ise deploy YAPMA.

### ADIM 3: API Deploy

```bash
bash scripts/stage/deploy-api.sh
```

Bu script su adimlar:
1. `.env.staging` kontrolu
2. Docker image build
3. `prisma migrate deploy` (schema migration)
4. Container recreate
5. Health check (max 60s)

### ADIM 4: Worker Deploy

```bash
bash scripts/stage/deploy-worker.sh
```

Bu script su adimlar:
1. `.env.staging` + `BULL_PREFIX=stage` kontrolu
2. Docker image build
3. Container recreate
4. 5-saniyelik log kontrolu

### ADIM 5: Post-Deploy Dogrulama (ZORUNLU)

```bash
# Container durumu
docker ps --filter name=calon --format 'table {{.Names}}\t{{.Status}}'

# API health
curl -sf https://stage-api.calon.com.tr/api/v1/health && echo " OK"

# Worker log — ECONNRESET, crash, restart izleri kontrol et
docker logs calon_worker_stage --tail 30 2>&1 | grep -E "error|Error|ECONNRESET|ConnTrace|context started"

# Event backbone — listener bagli mi
docker logs calon_worker_stage 2>&1 | grep "ConnTrace"

# Cron akisi calisiyor mu
docker logs calon_worker_stage 2>&1 | grep "DispatcherCron\|Recovery\|PlatformMetrics" | tail -5
```

### ADIM 6: Smoke Test

```bash
bash scripts/stage/smoke-api.sh
# Sonra: docs/stage-browser-smoke.md adimlarini takip et
```

---

## Compose Dosya Zinciri (KANONIK)

Stage deploy icin her zaman su uc dosya birlikte kullanilir:

| # | Dosya | Amac |
|---|-------|------|
| 1 | `docker-compose.yml` | Base servis tanimlar |
| 2 | `docker-compose.staging.yml` | Stage override (env, profil, logging) |
| 3 | `docker-compose.staging-ports.yml` | Port override (4001:4000) |

Env dosyasi: `--env-file apps/api/.env.staging`

Kanonik compose komutu (deploy script'lerinde sakli):

```bash
docker compose \
  --env-file apps/api/.env.staging \
  -f docker-compose.yml \
  -f docker-compose.staging.yml \
  -f docker-compose.staging-ports.yml \
  <komut>
```

---

## Basarili Deploy Tanimi

Asagidaki TUM kriterlerin karsilanmasi gerekir:

| # | Kriter | Dogrulama |
|---|--------|-----------|
| 1 | Server checkout = remote HEAD | `git rev-parse HEAD` = `git rev-parse origin/dev` |
| 2 | API container healthy | `docker ps` → Up, healthy |
| 3 | Worker container healthy | `docker ps` → Up, healthy, restart=0 |
| 4 | API health endpoint | `curl .../health` → 200 |
| 5 | Migration temiz | deploy-api.sh ciktisinda `Migration complete` |
| 6 | Worker log temiz | ECONNRESET yagmuru yok, ConnTrace hata yok |
| 7 | Event backbone | `[ConnTrace][OutboxListener] LISTEN ... hazir` gorunuyor |
| 8 | Cron akisi | DispatcherCron + Recovery + PlatformMetrics loglari var |

Bu kriterlerden HERHANGI BIRI eksikse deploy BASARISIZDIR.

---

## Yasaklar (Anti-Patterns)

| # | YASAK | Neden |
|---|-------|-------|
| 1 | `git pull` ile force-push gecmisini cozmek | Merge conflict veya eski commit'te kalir |
| 2 | Yalniz `docker-compose.staging.yml` ile deploy | Base servisleri iceremez, port override eksik |
| 3 | `--env-file` olmadan compose calistirmak | Root `.env` zehirler (yanlis DATABASE_URL) |
| 4 | Container up = deploy tamam sanmak | Container up olabilir ama icinde eski kod calisir |
| 5 | Health bakmadan isi bitmis saymak | Sessiz crash veya baslangic hatasi gizli kalir |
| 6 | Worker log gormeden event backbone saglikli demek | Listener sessiz olum, ECONNRESET yagmuru gizli kalir |
| 7 | Migration drift varken deploy'a devam etmek | Schema uyumsuzlugu runtime'da patlar |
| 8 | Deploy script yerine elle compose komutu yazmak | Zincir eksik/yanlis olma riski yuksek |
| 9 | `docker-compose` (v1) kullanmak | Compose v2 (`docker compose`) zorunlu |

---

## Hizli Dogrulama Blogu (Copy-Paste)

Deploy sonrasi Oracle host uzerinde calistir:

```bash
# 1. Repo sync dogrula
echo "HEAD: $(git rev-parse --short HEAD)"
echo "REMOTE: $(git rev-parse --short origin/dev)"

# 2. Container durumu
docker ps --filter name=calon --format 'table {{.Names}}\t{{.Status}}\t{{.Ports}}'

# 3. API health
curl -sf https://stage-api.calon.com.tr/api/v1/health && echo " OK" || echo " FAIL"

# 4. Worker sinyalleri
docker logs calon_worker_stage 2>&1 | grep -E "ConnTrace|context started|ECONNRESET|DispatcherCron" | tail -10

# 5. ECONNRESET sayisi (0 olmali)
echo "ECONNRESET count: $(docker logs calon_worker_stage 2>&1 | grep -c ECONNRESET)"

# 6. Container restart sayisi (0 olmali)
docker inspect calon_worker_stage --format 'restartCount={{.RestartCount}}'
docker inspect calon_api_stage --format 'restartCount={{.RestartCount}}'
```

---

## Operasyonel Gerceklik Notu

- `dev` branch ortak truth branch'tir. Amend / rebase / force-push yasanabilir.
  Her deploy oncesi `git fetch + reset --hard origin/dev` zorunludur.
- Deploy basarisi "komut calisti" degil, "runtime dogrulandi" demektir.
- `[ConnTrace]` prefix'li loglar baglanti lifecycle izlemesi icin eklenmistir.
  `ConnTrace...error` veya `ConnTrace...reconnect` gorulmesi baglanti sorununa isaret eder.
- Worker'da `[DispatcherCron]`, `[Recovery]`, `[PlatformMetrics]` loglarinin
  duzenli olarak gorunmesi cron akisinin saglikli oldugunu kanitlar.
- `[OutboxListener] LISTEN ... hazir` logu event backbone'un aktif oldugunu gosterir.
  Bu log yoksa veya reconnect dongusu goruluyorsa listener'da sorun var demektir.

---

## Web + Booking (Vercel)

Push to `dev` branch triggers Vercel preview deploy.

### Vercel Stage Binding Rules (ZORUNLU)

**Domain binding:**
- `stage.calon.com.tr` → `calon` projesi → **Preview** environment → `dev` branch
- `stage-book.calon.com.tr` → `calon-booking` projesi → **Preview** environment → `dev` branch
- Stage domainler **Production** deployment'a baglanmayacak

**Preview environment variables:**

Web (`calon`) — Preview only:
- `NEXT_PUBLIC_API_URL=https://stage-api.calon.com.tr`
- `NEXT_PUBLIC_SITE_URL=https://stage.calon.com.tr`
- `NEXT_PUBLIC_BOOKING_URL=https://stage-book.calon.com.tr`

Booking (`calon-booking`) — Preview only:
- `NEXT_PUBLIC_API_URL=https://stage-api.calon.com.tr`
- `NEXT_PUBLIC_SITE_URL=https://stage.calon.com.tr`
- `NEXT_PUBLIC_BOOKING_URL=https://stage-book.calon.com.tr`

**Production env ayri tutulacak.** Preview env'ler Production'a sizmayacak.

**Build-time bake kurali:**
`NEXT_PUBLIC_*` degiskenleri **build time'da** Next.js'e bake edilir.
Env degisikligi sonrasi **yeni Preview build / redeploy ZORUNLUDUR**.

**Browser dogrulama (deploy sonrasi zorunlu):**
- `stage.calon.com.tr/login` acilir
- login submit basarili olur (502 degil, 200)
- dashboard tenant verisiyle yuklenir
- `stage-book.calon.com.tr/{slug}` acilir
- booking yüzeyi stage API'den gercek veri ceker

**Yasaklar:**
- stage domain'i production'a baglamak YASAK
- localhost fallback ile birakmak YASAK
- env degistirip redeploy almadan testi tamamlandi saymak YASAK

---

## Rollback

### API/Worker
```bash
# On Oracle Cloud (141.144.243.114)
cd /home/ubuntu/calon
git fetch origin
git reset --hard <onceki-commit-hash>
bash scripts/stage/deploy-api.sh
bash scripts/stage/deploy-worker.sh
```

### Web/Booking (Vercel)
Use Vercel dashboard → Deployments → Promote previous deployment.

### Database
Neon branch destekliyse: branch'i sil ve yeniden olustur.
Alternatif: Neon point-in-time restore.

---

## Fail-Fast Rules

- If `migrate deploy` fails → STOP. Do not start API.
- If API health fails after 30s → STOP. Check logs.
- If login returns non-200 → STOP. Check env/secrets.
- If browser smoke shows auth loop → STOP. Check CORS/cookie config.
- If stage web login returns 502 → STOP. Check Vercel env + rebuild.
- If worker shows ECONNRESET flood → STOP. Check DATABASE_DIRECT_URL.
- Never proceed to next step if current step failed.
