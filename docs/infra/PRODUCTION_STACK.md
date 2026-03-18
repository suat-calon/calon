# Production Architecture — Calon OS

**Son güncelleme:** 2026-03-18 (P10)  
**Durum:** LIVE  
**Ortam:** Production

---

## 🎯 Tek Gerçek Stack

Bu doküman Calon OS'un production deployment mimarisinin **tek ve resmi kaynağıdır**. Başka hiçbir dokümandaki infra referansı bu dosyadan daha güncel değildir.

---

## 🏗️ Production Altyapısı

### 1. Backend (API + Worker)

| Bileşen | Sağlayıcı | Detay |
|---------|-----------|-------|
| Platform | **Oracle Cloud Free Tier** | Always Free ARM instance |
| IP | `141.144.243.114` | Sabit public IP |
| OS | Ubuntu 24.04 LTS | ARM64 architecture |
| Runtime | Docker Compose | API + Worker container |
| Reverse Proxy | Nginx | Port 80/443 → Docker 4000 |
| SSL | Let's Encrypt | Certbot otomatik yenileme |
| Domain | api.calon.com.tr | Cloudflare proxy üzerinden |

**Container yapısı:**
```
- calon-api (node:20-alpine)    → Port 4000, HTTP server
- calon-worker (node:20-alpine) → BullMQ processor, HTTP yok
```

**Deployment yöntemi:**
```bash
docker-compose -f docker-compose.yml \
  -f docker-compose.production.yml up -d
```

---

### 2. Database

| Bileşen | Sağlayıcı | Detay |
|---------|-----------|-------|
| Platform | **Neon** | Serverless Postgres |
| Bölge | eu-central-1 | Frankfurt |
| Versiyon | PostgreSQL 16 | btree_gist extension aktif |
| Connection | Pooled | Neon built-in pooler |
| Kullanıcı | `calon_app` | RLS + normal privileges (NOT superuser) |
| Connection string | `DATABASE_URL` | Env var üzerinden inject |

**Extensions:**
- `btree_gist` → EXCLUDE USING GIST constraint'ler için
- `pg_trgm` → Full-text search (gelecek fazlar)

**Connection limit:**
- Development: 5
- Production: 10
- PgBouncer mode: 1

---

### 3. Cache & Queue

| Bileşen | Sağlayıcı | Detay |
|---------|-----------|-------|
| Platform | **Upstash Redis** | Serverless Redis |
| Bölge | Frankfurt | EU compliance |
| TLS | Aktif | TLS 1.2+ zorunlu |
| Password | Required | `REDIS_PASSWORD` env var |
| Port | 6379 | Standard Redis port |

**Kullanım:**
- BullMQ job queue (11 kuyruk)
- Session cache (gelecek)
- Rate limiting (public endpoint'ler)
- Idempotency key store

---

### 4. Frontend

| Uygulama | Sağlayıcı | Domain | Framework | Build |
|----------|-----------|--------|-----------|-------|
| **Web App** | Vercel | calon.com.tr | Next.js 15 | apps/web |
| **Booking Widget** | Vercel | book.calon.com.tr | Next.js 15 | apps/booking |

**Deployment:**
- Git push → main branch
- Vercel otomatik deploy
- Preview deployments: PR başına 1 URL

**Environment variables:**
- `NEXT_PUBLIC_API_URL=https://api.calon.com.tr`
- `NEXT_PUBLIC_BOOKING_URL=https://book.calon.com.tr`

---

### 5. DNS & CDN

| Bileşen | Sağlayıcı | Detay |
|---------|-----------|-------|
| Platform | **Cloudflare** | DNS + Proxy + SSL |
| Nameservers | `dane.ns.cloudflare.com`, `eve.ns.cloudflare.com` | Domain: calon.com.tr |
| Proxy | Aktif | Turuncu bulut (CDN + DDoS protection) |
| SSL/TLS | Full (Strict) | Origin certificate + Let's Encrypt |

**DNS Kayıtları:**
```
calon.com.tr           → CNAME → cname.vercel-dns.com (proxied)
book.calon.com.tr      → CNAME → cname.vercel-dns.com (proxied)
api.calon.com.tr       → A     → 141.144.243.114 (proxied)
```

---

## 🔄 Deployment Akışı

### Backend Deployment (API + Worker)

```bash
# 1. Local'de build test
npm run build

# 2. Git push
git push origin main

# 3. Oracle Cloud sunucusunda
ssh ubuntu@141.144.243.114
cd /opt/calon
git pull origin main
docker-compose -f docker-compose.yml \
  -f docker-compose.production.yml up -d --build

# 4. Health check
curl https://api.calon.com.tr/api/v1/health
```

**Zero-downtime stratejisi (gelecek):**
- Rolling update: Worker → API sırasıyla
- Health check bazlı readiness probe
- Graceful shutdown (SIGTERM handling)

### Frontend Deployment

```bash
# 1. Git push
git push origin main

# 2. Vercel otomatik deploy eder
# Deployment URL: Slack/email bildirimi

# 3. Smoke test
curl https://calon.com.tr
curl https://book.calon.com.tr
```

---

## 📊 Maliyet Yapısı

| Bileşen | Plan | Aylık Maliyet |
|---------|------|---------------|
| Oracle Cloud | Always Free ARM | $0 |
| Neon | Free Tier | $0 (ilk proje) |
| Upstash Redis | Free Tier | $0 (10K komut/gün) |
| Vercel | Hobby | $0 |
| Cloudflare | Free | $0 |
| Domain (calon.com.tr) | — | ₺150/yıl |
| **TOPLAM** | — | **~₺12/ay** |

**Upgrade tetikleyicileri:**
- Neon: 3GB storage aşımı → $19/ay
- Upstash: 10K komut/gün aşımı → $10/ay
- Vercel: 100GB bandwidth aşımı → $20/ay

---

## 🚫 KULLANILMAYAN PLATFORMLAR

### ❌ Natro Hosting
- **Durum:** Değerlendirildi ancak tercih edilmedi
- **Neden:** Oracle Cloud Free Tier daha ekonomik ve güçlü
- **Tarihçe:** P7-P8 arasında VPS planları incelendi, Oracle Cloud seçildi
- **Mevcut kullanım:** YOK

### ❌ Railway / Render / Fly.io
- **Durum:** Alternatif olarak değerlendirildi
- **Neden:** Free tier kısıtlı, Oracle Cloud Always Free daha avantajlı
- **Mevcut kullanım:** YOK

---

## 🔐 Güvenlik Katmanları

| Katman | Yöntem | Detay |
|--------|--------|-------|
| Network | Cloudflare Proxy | DDoS protection, rate limiting |
| SSL/TLS | Full (Strict) | Origin + Edge certificate |
| Database | RLS Policies | Tenant izolasyon, PostgreSQL native |
| Application | Multi-layer | JWT + Tenant Guard + Prisma middleware |
| Secrets | Environment vars | Oracle Cloud user data, Vercel env settings |

---

## 📈 Monitoring & Observability

### Aktif
- `/api/v1/health` → API + DB + Redis check
- Docker healthcheck → Container auto-restart
- Uptime monitoring → (manuel curl, gelecekte UptimeRobot)

### Planlanan
- Sentry (error tracking)
- Prometheus + Grafana (metrics)
- Loki (log aggregation)
- OpenTelemetry (distributed tracing)

---

## 🛠️ Bakım & Operasyon

### Günlük
- Health endpoint kontrolü
- Docker container durumu: `docker ps`

### Haftalık
- Disk kullanımı: `df -h`
- Docker log boyutu: `docker system df`

### Aylık
- Security updates: `apt update && apt upgrade`
- SSL certificate yenileme: Certbot otomatik
- Database backup: Neon otomatik (7 gün retention)

### Yıllık
- Domain yenileme: calon.com.tr

---

## 📞 Sorun Giderme

### API Erişilemiyor
```bash
# 1. Container durumu
docker ps | grep calon

# 2. Container log
docker logs calon-api --tail 100

# 3. Nginx durumu
sudo systemctl status nginx

# 4. Cloudflare proxy durumu
curl -I https://api.calon.com.tr
```

### Database Bağlantı Hatası
```bash
# 1. Neon dashboard kontrol
https://console.neon.tech

# 2. Connection string test
psql $DATABASE_URL -c "SELECT 1"

# 3. Connection pool durumu
# API loglarında "Prisma Client" hata kontrolü
```

### Redis Bağlantı Hatası
```bash
# 1. Upstash console kontrol
https://console.upstash.com

# 2. Redis ping test
redis-cli -h <REDIS_HOST> -p 6379 -a <REDIS_PASSWORD> ping
```

---

## 🔄 Rollback Prosedürü

### Backend
```bash
# 1. Önceki Docker image'a dön
docker-compose down
git checkout <previous-commit>
docker-compose -f docker-compose.yml \
  -f docker-compose.production.yml up -d

# 2. Health check
curl https://api.calon.com.tr/api/v1/health
```

### Frontend
```bash
# Vercel dashboard → Deployments → Previous deployment → Promote
```

---

## 📝 Referans Dokümanlar

- Docker yapısı: `docs/infra/docker-strategy.md`
- ENV contract: `docs/infra/env-contract.md`
- Migration stratejisi: `packages/database/README.md` (gelecek)
- API documentation: `https://api.calon.com.tr/api` (Swagger)

---

## ✅ Production Checklist

Yeni deployment öncesi:
- [ ] `NODE_ENV=production`
- [ ] Database migration applied
- [ ] ENV variables validated
- [ ] Docker image built & tested
- [ ] Health endpoint responds
- [ ] SSL certificate valid
- [ ] DNS propagated
- [ ] Smoke test passed
- [ ] Rollback plan ready

---

**SON GÜNCELLEME:** 2026-03-18  
**GÜNCELLEYEN:** Suat Gökçe — Teknoloji ve Bilgi Sistemleri Departman Lideri  
**DURUM:** Production Active ✅
