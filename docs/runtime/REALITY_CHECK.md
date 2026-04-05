# CALON — TEK GERÇEKLİK BELGESİ
> Bu belge projenin mutlak durum kaynağıdır.
> Hayal, niyet, roadmap romantizmi içermez.
> Sadece repo kanıtı ve doğrulanmış altyapı gerçeği yazar.
> Son güncelleme: 2026-03-28

---

## Executive Verdict

Calon, 47 Prisma modeli, 19 API modülü, 22 controller, 7 migration, tam multi-tenant
izolasyonu ve admin/billing/finance/worker/queue/DLQ omurgası inşa edilmiş bir SaaS
platformudur. Frontend'te calendar-first operator surface, catalog CRUD, customer profile,
booking public akışı dev branch'te birleşiktir. Production API Oracle Cloud üzerinde canlı
ve 200 döndürmektedir. Stage ortamı henüz deploy edilmemiştir; P0/P1 artefaktları hazırdır.

---

## Active Repo / Branch Truth

| Madde | Gerçek |
|---|---|
| Repo | `C:\dev\calon` — tek monorepo, yarn workspaces + turborepo |
| Source of truth branch | `dev` |
| `main` | Eski production snapshot. Dev'in gerisinde. Doğrudan çalışma YASAK |
| Package manager | yarn (yarn.lock mevcut) |

---

## Verified Built Modules

### Backend (apps/api) — 19 modül, 22 controller

| Modül | Durum | Kanıt yolu |
|---|---|---|
| Auth (IAM) | VAR | modules/iam/ |
| Tenant / Multi-tenant | VAR | modules/iam/tenant.controller, common/tenant.context.ts |
| Public Booking | VAR | modules/public/ — salon, services, availability, holds, book |
| Appointments | VAR | modules/operations/appointment/ — CRUD, hold, reschedule, status machine |
| Catalog (Products) | VAR | modules/catalog/product.controller, modules/inventory/ |
| Catalog (Services) | VAR | modules/catalog/service.controller |
| Customers (CRM) | VAR | modules/crm/ — customer, consent-form, gallery |
| Staff | VAR | modules/staff/ — staff, commission |
| Onboarding | VAR | modules/onboarding/ — register, setup-wizard |
| Admin | VAR | modules/admin/admin.controller — 6 endpoint |
| Super Admin Guard | VAR | modules/admin/admin.guard.ts — x-admin-api-key, fail-closed |
| Billing Admin | VAR | modules/admin/billing.admin.controller — 10 endpoint |
| Growth Metrics | VAR | modules/admin/growth-metrics.admin.controller |
| Billing / Subscription | VAR | modules/billing/ — service, cron, entitlements, webhook |
| Finance | VAR | modules/finance/ — payment, ledger |
| Loyalty | VAR | modules/loyalty/ — redeem, history |
| Worker / Queue / DLQ | VAR | modules/worker/ — dispatcher, outbox, archive, DLQ processors |
| Event / Outbox | VAR | modules/event/ — producer, repository |
| Notification | VAR | modules/notification/ — cost-policy, preference, template |
| Delivery + Retry | VAR | modules/delivery/ — repository, retry-policy |
| Health | VAR | modules/health/ — health, ready, version |
| Correlation ID | VAR | common/logging/ — middleware, store, interceptor |
| Redis Lock | VAR | common/redis-lock.service.ts |
| Idempotency | VAR | common/idempotency.interceptor.ts |

### Frontend (apps/web) — 10 sayfa

| Ekran | Durum | Kanıt |
|---|---|---|
| Login / Register | VAR | (auth)/login, (auth)/register |
| Calendar (primary) | VAR | (dashboard)/calendar — fullscreen weekly, detail, lifecycle |
| Dashboard (secondary) | VAR | (dashboard)/dashboard — summary cards |
| Catalog | VAR | (dashboard)/catalog — services + products CRUD |
| Customers | VAR | (dashboard)/customers — list, profile, calendar link |
| Services | VAR | (dashboard)/services |
| Staff | VAR | (dashboard)/staff |
| Onboarding | VAR | onboarding/page.tsx |
| Shell | VAR | components/dashboard/sidebar.tsx, topbar.tsx |

### Frontend (apps/booking)

| Ekran | Durum |
|---|---|
| Tenant booking | VAR — booking/[tenantSlug] |
| Slug pages | VAR — [slug]/, [slug]/[service]/ |
| Booking confirmed | VAR — booking-confirmed/ |

### Database (packages/database)

| Madde | Durum |
|---|---|
| Prisma schema | 47 model |
| Migrations | 7 |
| ORM boundary | packages/database/src/index.ts |
| Money / DbTransaction | VAR |

---

## Verified Infra Reality

| Madde | Durum | Kanıt |
|---|---|---|
| Production API | CANLI | https://api.calon.com.tr/api/v1/health → 200 |
| Host | Oracle Cloud | IP 141.144.243.114, ARM64, Ubuntu 24.04 |
| DB | Neon | eu-central-1, PostgreSQL 16 |
| Redis | Upstash | Serverless, Frankfurt, TLS |
| Web | Vercel | calon.com.tr → 307 |
| Booking | Vercel | book.calon.com.tr (404 — deploy durumu belirsiz) |
| DNS | Cloudflare | Proxy aktif, SSL Full |
| Natro | Domain registrar | Backend host DEĞİL |

### Stage infra — İnsan tarafından doğrulanmış (2026-03-28)

| Madde | Durum | Detay |
|---|---|---|
| Stage artefaktlar | VAR | compose, scripts, runbooks, env example |
| Stage Neon branch | VAR | Branch adı: `stage` |
| Stage Upstash DB | VAR | DB adı: `calon-stage-redis`, TLS açık |
| Stage Oracle host | AYNI | 141.144.243.114, dış port 4001 |
| Stage container'lar | BELİRLENDİ | `calon_api_stage`, `calon_worker_stage` |
| Stage DNS (Cloudflare) | BELİRLENDİ | stage-api → Oracle, stage/stage-book → Vercel |
| Stage Vercel projects | BELİRLENDİ | stage.calon.com.tr (web), stage-book.calon.com.tr (booking) |
| Stage .env.staging | KULLANICI TARAFINDA HAZIR | Gerçek secret repo içinde yazılmayacak |
| Stage Nginx kuralı | DOĞRULANAMADI | Port 4001 yönlendirmesi henüz doğrulanmadı |
| Stage deploy | YAPILMAMIŞ | Altyapı provizyon tamamlandıktan sonra denenecek |

---

## Active Phase

Stage foundation artefaktları hazır (P0 compose + P1 scripts/runbooks).
Frontend core pilot-ready seviyede (calendar, catalog, customers).
Sonraki adım: stage altyapısının (DNS/DB/Redis/Nginx) insan tarafından kurulması.

---

## Already Built — Do Not Rebuild

Aşağıdaki yapılar inşa edilmiş ve doğrulanmıştır.
Yeniden kurulmaları gereksiz kaynak israfıdır:

- Calendar core + lifecycle + detail sheet
- Dashboard summary secondary surface
- Catalog CRUD (services + products) + category UX
- Customers core (list + profile + calendar linkage)
- Customer ↔ calendar iki yönlü navigasyon
- Public booking flow (salon → services → slots → book → confirm)
- Admin / super-admin backend (guard + controller + service)
- Billing backend (controller + cron + entitlements + webhook)
- Finance backend (payment + ledger)
- Worker / queue / DLQ (dispatcher + outbox + archive + processors)
- Event / outbox pattern
- Notification engine (cost-policy + preference + template)
- Correlation ID / logging / metrics
- Redis lock / idempotency
- Production Docker compose (docker-compose.production.yml)
- Stage P0/P1 artefaktları (compose + scripts + runbooks)
- Onboarding flow (backend + frontend)
- Design tokens / brand wiring

---

## Unverified / Needs Human Confirmation

| Madde | Neden |
|---|---|
| Stage Nginx port 4001 kuralı | Oracle host'ta reverse proxy kuralı doğrulanmadı |
| Stage DNS kayıtları oluşturulmuş mu | Cloudflare'de 3 kayıt girilmiş mi canlı doğrulama yok |
| Stage Vercel project'ler oluşturulmuş mu | Vercel dashboard'dan doğrulama yok |
| book.calon.com.tr 404 durumu | Booking production deploy durumu belirsiz |
| Stage deploy denenmemiş | Tüm bileşenler hazır görünüyor ama henüz koşturulmadı |

---

## Current Critical Blockers

1. Stage Nginx kuralı (Oracle host'ta port 4001 yönlendirmesi) doğrulanmadı.
2. Stage DNS kayıtları (Cloudflare) canlı doğrulanmadı.
3. Stage Vercel project'leri (web + booking) canlı doğrulanmadı.
4. İlk stage deploy henüz denenmedi.
5. Bu blocker'lar kod sorunu değil, altyapı provizyon/doğrulama sorunudur.
