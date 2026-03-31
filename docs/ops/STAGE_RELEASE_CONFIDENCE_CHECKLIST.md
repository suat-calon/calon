# Stage Release Confidence Checklist

> Her stage deploy ve release oncesi bu listeyi calistir.
> "Muhtemelen calisir" YASAK. Her madde kanit gerektirir.

---

## Pre-Deploy

- [ ] `dev` branch guncel ve push edilmis
- [ ] `git status` clean
- [ ] `apps/api/.env.staging` mevcut ve dogru
- [ ] Docker Desktop / compose engine aktif
- [ ] Dogru compose zinciri: `--env-file apps/api/.env.staging -f docker-compose.yml -f docker-compose.staging.yml -f docker-compose.staging-ports.yml`

## Deploy

- [ ] `docker compose ... up -d --build --force-recreate api worker`
- [ ] Build basarili (0 error)
- [ ] `docker ps` — `calon_api_stage` running, healthy
- [ ] `docker ps` — `calon_worker_stage` running, healthy
- [ ] RestartCount = 0

## Infrastructure Health

- [ ] `curl -sk https://stage-api.calon.com.tr/api/v1/health` → 200
- [ ] `curl -sk https://stage-api.calon.com.tr/api/v1/health/ready` → DB up + Redis up
- [ ] API port yalnizca 4001:4000 (4000:4000 sizmamis)

## Auth Smoke

- [ ] POST `/auth/login` → 200, `expiresIn`
- [ ] GET `/auth/me` → 200, `TENANT_OWNER`
- [ ] GET `/tenants/me` → 200, tenant bilgisi

## Core Operator Smoke

- [ ] GET `/appointments` → randevu listesi
- [ ] Lifecycle: en az bir PENDING → CONFIRMED gecisi
- [ ] GET `/services` → hizmet listesi
- [ ] POST `/services` → yeni hizmet olusturma
- [ ] GET `/staff` → personel listesi
- [ ] GET `/customers` → musteri listesi

## Booking Smoke

- [ ] GET `/public/salon/<slug>` → 200
- [ ] GET `/public/availability?slug=...&staffId=...&date=...` → slot listesi (bos degilse)
- [ ] POST `/public/book` → 201, appointment olusur

## Settings Smoke

- [ ] PATCH `/tenants/me` → 200, update gecerli
- [ ] GET `/tenants/me` → read-back dogru

## Worker Sanity

- [ ] `docker logs calon_worker_stage --tail 30` → boot mesajlari temiz
- [ ] ECONNRESET spam yok (structured warn olabilir)
- [ ] 42883 / Only 0th database hatasi yok
- [ ] OutboxListener LISTEN hazir

## Env Precedence Guard

- [ ] Root `.env` stage deploy'da kullanilmiyor
- [ ] `--env-file apps/api/.env.staging` her compose cagrisinda var
- [ ] REDIS_HOST stage Upstash'e isaret ediyor
- [ ] DATABASE_URL stage Neon branch'e isaret ediyor

## Vercel Binding ve Preview Env Kontrolu

- [ ] `stage.calon.com.tr` dogru web preview deployment'a bagli (dev branch)
- [ ] `stage-book.calon.com.tr` dogru booking preview deployment'a bagli (dev branch)
- [ ] Web preview env: `NEXT_PUBLIC_API_URL=https://stage-api.calon.com.tr`
- [ ] Web preview env: `NEXT_PUBLIC_SITE_URL=https://stage.calon.com.tr`
- [ ] Web preview env: `NEXT_PUBLIC_BOOKING_URL=https://stage-book.calon.com.tr`
- [ ] Booking preview env: `NEXT_PUBLIC_API_URL=https://stage-api.calon.com.tr`
- [ ] Booking preview env: `NEXT_PUBLIC_BOOKING_URL=https://stage-book.calon.com.tr`
- [ ] `NEXT_PUBLIC_*` env degisikligi varsa yeni preview build tetiklenmis
- [ ] Aktif deployment yeni build (eski cache degil)
- [ ] Preview protection / Vercel Authentication stage smoke'u bloklamiyor

## Browser Smoke (Manuel)

- [ ] `stage.calon.com.tr/login` aciliyor
- [ ] Login submit 502 vermiyor — 200 donuyor
- [ ] Dashboard tenant verisiyle yukleniyor
- [ ] Calendar/appointments gercek veriyle aciliyor
- [ ] `stage-book.calon.com.tr/booking/<slug>` aciliyor
- [ ] Booking yüzeyi stage API'den gercek veri cekiyor
- [ ] Stage web yanlistikla production API'ye gitmiyor
- [ ] Stage booking localhost fallback kullanmiyor

## Post-Deploy

- [ ] 10-15 dk worker log temiz
- [ ] Health/ready hala 200
- [ ] RestartCount hala 0

---

**KURAL: Stage Vercel env degisikligi, yeni Preview build alinmadan uygulanmis sayilmaz.**
**KURAL: Browser smoke (login + dashboard + booking) yapilmadan stage sağlikli sayilmaz.**
