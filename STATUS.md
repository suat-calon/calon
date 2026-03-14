# CALON — AKTİF DURUM DOSYASI

> Bu dosya Claude Code tarafından her session sonunda güncellenir.
> Strateji chat'i (claude.ai) bu dosyayı referans alır.
> Son güncelleme: ilk kurulum

---

## AKTİF FAZ

```
FAZ: P0 — Gerçeklik Tespiti / Repo Otopsisi
DURUM: BAŞLAMADI
BAŞLANGIÇ: —
```

---

## FAZ DURUMU ÖZET

| Faz | Başlık | Durum | Tamamlanan Görev |
|-----|--------|-------|-----------------|
| P0 | Gerçeklik Tespiti / Repo Otopsisi | ⬜ BEKLIYOR | 0/7 |
| P1 | Canonical Domain Model Sabitleme | ⬜ BEKLIYOR | 0/9 |
| P2 | Migration Anayasası | ⬜ BEKLIYOR | 0/8 |
| P3 | Seed / Fixture Disiplini | ⬜ BEKLIYOR | 0/9 |
| P4 | Tenant İzolasyonu ve Auth Gerçeği | ⬜ BEKLIYOR | 0/8 |
| P5 | Booking Core Tamamlama | ⬜ BEKLIYOR | 0/10 |
| P6 | Production ENV Contract | ⬜ BEKLIYOR | 0/8 |
| P7 | Docker Productionization | ⬜ BEKLIYOR | 0/9 |
| P8 | Routing / DNS / Edge Topology | ⬜ BEKLIYOR | 0/9 |
| P9 | Gözlemleme / Operasyon Minimum Paket | ⬜ BEKLIYOR | 0/10 |
| P10 | Controlled Production Launch | ⬜ BEKLIYOR | 0/8 |

**Toplam ilerleme: 0/95 görev**

---

## FAZ-P0 DETAY — Gerçeklik Tespiti / Repo Otopsisi

**Hedef çıktı:** `docs/infra/schema-gap-report.md`

### Görevler
- [ ] Mevcut Prisma schema incelendi (`packages/database/prisma/schema.prisma`)
- [ ] Migration klasörü gözden geçirildi (`packages/database/prisma/migrations/`)
- [ ] Seed dosyaları incelendi
- [ ] Docker-compose ve env örnekleri incelendi
- [ ] "Varsayılan ama DB'de olmayan" entity listesi çıkarıldı
- [ ] Zorunlu domain model ile mevcut model farkı belirlendi
- [ ] `docs/infra/schema-gap-report.md` yazıldı

### Başarısızlık Kriterleri
- staff/service/customer/appointment ilişkileri net değilse → BAŞARISIZ
- naming karmaşası (tenantId vs tenant_id) çözülmemişse → BAŞARISIZ

### Bulgular
> *(Claude Code tarafından doldurulacak)*

```
Schema'da bulunan tablolar:
- [ ] ...

Eksik / sorunlu bulunanlar:
- [ ] ...

Naming karmaşası tespiti:
- [ ] ...
```

---

## FAZ-P1 DETAY — Canonical Domain Model

**Hedef çıktı:** `prisma/schema.prisma` + `docs/domain/canonical-data-model.md`

### Görevler
- [ ] tenants modeli canonical hale getirildi
- [ ] users / staff_members ayrımı netleştirildi
- [ ] appointments tenantId taşıyor, ilişkiler net
- [ ] tenant_billing, usage_periods, payments (min) tanımlandı
- [ ] notifications placeholder veya minimum eklendi
- [ ] Soft delete stratejisi tanımlandı
- [ ] Tüm Prisma field/column mapping açık tanımlandı
- [ ] `prisma/schema.prisma` canonical hale getirildi
- [ ] `docs/domain/canonical-data-model.md` yazıldı

### Başarısızlık Kriterleri
- User ve Staff ayrımı bulanıksa → BAŞARISIZ
- Appointment ilişkileri net değilse → BAŞARISIZ
- Tenant izolasyonu field seviyesinde taşınmıyorsa → BAŞARISIZ

---

## FAZ-P2 DETAY — Migration Anayasası

**Hedef çıktı:** `docs/infra/migration-discipline.md` + temiz migration klasörü

### Görevler
- [ ] Tüm mevcut migration'lar gözden geçirildi
- [ ] Temiz baseline migration üretildi (gerekirse)
- [ ] Local: `prisma migrate dev` akışı yazıldı
- [ ] Production: `prisma migrate deploy` akışı yazıldı
- [ ] Startup öncesi migration check mantığı tanımlandı
- [ ] Boş local DB'de sıfırdan migration success testi
- [ ] Production benzeri ortamda migration deploy testi
- [ ] `docs/infra/migration-discipline.md` yazıldı

### Başarısızlık Kriterleri
- Yeni DB sıfırdan ayağa kalkmıyorsa → BAŞARISIZ
- staff_members migration sonrası hala yoksa → BAŞARISIZ
- Migration sırası deterministik değilse → BAŞARISIZ

### P2 Bulgular (2026-03-14)

#### 1. Migration Klasörü Tam Liste (24 migration + lock)

| # | Timestamp | Adı | Not |
|---|---|---|---|
| 1 | 20260228000000 | `init_steel_core` | Baseline |
| 2 | 20260301000000 | `audit_log_partitioning` | |
| 3 | 20260302000000 | `loyalty_idempotency_key` | |
| 4 | 20260303000000 | `billing_plan_engine` | |
| 5 | 20260304000001 | `faz14_appointment_consistency` | |
| 6 | 20260304000002 | `faz14_1_constraint_hotfix` | |
| 7 | 20260304000003 | `faz15_onboarding` | |
| 8 | 20260304000004 | `faz17_discovery_rls_policies` | |
| 9 | 20260304000005 | `faz18_viral_growth_engine` | |
| 10 | 20260304000006 | `faz18_1_rls_as_code` | |
| 11 | 20260304000007 | `faz18_5_rls_hotfix` | |
| 12 | 20260305000001 | `faz19_iyzico_payment_engine` | |
| 13 | 20260307000001 | `faz21_is_test_booking` | |
| 14 | 20260308000001 | `faz215_db_ownership_and_extensions` | **DUPLICATE TS** |
| 15 | 20260308000001 | `faz22_billing_core` | **DUPLICATE TS** |
| 16 | 20260308000003 | `faz225_billing_ledger` | |
| 17 | 20260308000004 | `faz23_scheduling_engine` | |
| 18 | 20260308000006 | `faz24_event_notification_backbone` | |
| 19 | 20260309000001 | `faz245_outbox_notify_trigger` | |
| 20 | 20260309000002 | `faz24_hardening_delivery_unique` | **DUPLICATE TS** |
| 21 | 20260309000002 | `faz25_archive_tables` | **DUPLICATE TS** |
| 22 | 20260310000001 | `mvp_preflight_hotfixes` | |
| 23 | 20260310000002 | `mvp_exit_core_constraints` | |
| 24 | 20260312000001 | `faz5_platform_metrics_snapshot` | |

#### 2. migration_lock.toml

```toml
provider = "postgresql"
```

**Durum:** VAR ve doğru. Prisma migration altyapısı bu repo'da aktif.

#### 3. SQL Dosya Kontrolü (son 4 migration)

| Migration | `migration.sql` | Durum |
|---|---|---|
| `faz25_archive_tables` | VAR | OK |
| `mvp_preflight_hotfixes` | VAR | OK |
| `mvp_exit_core_constraints` | VAR | OK |
| `faz5_platform_metrics_snapshot` | VAR | OK |

Tüm migration klasörlerinde `migration.sql` mevcut.

#### 4. Startup Migration Check

| Kontrol | Sonuç |
|---|---|
| `main.ts` içinde `migrate` referansı | **YOK** |
| `apps/api/src/` içinde `prisma migrate` referansı | **YOK** |
| `onModuleInit` / `onApplicationBootstrap` | **YOK** (main.ts ve app.module.ts'de) |

**Sonuç:** Uygulama başlarken migration kontrolü veya otomatik migration çalıştırma mekanizması **YOK**. Migration tamamen manuel süreç.

#### 5. Duplicate Timestamp Sorunu (2 çift)

| Timestamp | Migration A | Migration B | Risk |
|---|---|---|---|
| `20260308000001` | `faz215_db_ownership_and_extensions` | `faz22_billing_core` | Sıralama belirsiz (alfabetik: faz215 önce) |
| `20260309000002` | `faz24_hardening_delivery_unique` | `faz25_archive_tables` | Sıralama belirsiz (alfabetik: faz24 önce) |

**Risk:** Prisma string sıralamasına göre çalıştırır. Aynı timestamp'te bağımlılık varsa hata üretir. Yeni DB'de `prisma migrate deploy` patlarsa bu aday #1.

#### 6. Faz Numaralama Anomalileri

- **Faz 16 yok** — 15 → 17 atlanmış
- **Faz 20 yok** — 19 → 21 atlanmış
- **`faz5_platform_metrics_snapshot`** — timestamp `20260312` (en son) ama faz numarası "5". Geriye dönük platform metrik tablosu eklenmiş.

#### 7. Özet Değerlendirme

| Kriter | Durum |
|---|---|
| Migration dosyaları tam mı? | **EVET** — 24 migration, hepsi `migration.sql` içeriyor |
| `migration_lock.toml` var mı? | **EVET** — `provider = "postgresql"` |
| Timestamp'ler benzersiz mi? | **HAYIR** — 2 duplicate çift var |
| Sıralama deterministik mi? | **RİSKLİ** — duplicate timestamp'ler nedeniyle |
| Startup migration check var mı? | **HAYIR** — tamamen manuel |
| Sıfırdan DB ayağa kalkar mı? | **TEST EDİLMEDİ** — duplicate timestamp riski nedeniyle belirsiz |

#### 8. Duplicate Timestamp İçerik Analizi

**Çift 1: `20260308000001`**

| Migration | İçerik | Bağımlılık |
|---|---|---|
| `faz215_db_ownership_and_extensions` | `CREATE EXTENSION btree_gist` + tablo sahipliği postgres → calon_app transfer | Hiçbir tabloya bağımlı değil, altyapı işlemi |
| `faz22_billing_core` | `CREATE TYPE "BillingAttemptStatus"` + `CREATE TABLE "billing_attempts"` + `CREATE TABLE "webhook_events"` | Yeni tablo oluşturma, mevcut tablolara bağımlı değil |

**Sonuç:** Bu çift tehlikesiz — birbirine bağımlılık yok. Alfabetik sıra (faz215 → faz22) doğru çalışır. Ama faz215'in önce çalışması mantıklı (extension + ownership önce olmalı).

**Çift 2: `20260309000002`** — İçerik analizi ayrıca yapılmalı (bu session'da head -20 yapılmadı).

#### 9. CI Pipeline Durumu

**Dosya:** `.github/workflows/ci.yml`

```yaml
name: CI
on:
  push:
    branches: [main, dev]
jobs:
  build:
    runs-on: ubuntu-latest
    steps:
      - Checkout (actions/checkout@v4)
      - Setup Node 20 (actions/setup-node@v4)
      - yarn install
      - yarn build
      - yarn test
```

**Sorunlar:**
- **PR trigger yok** — sadece `push` to `main`/`dev`. PR'lar CI'dan geçmiyor.
- **DB servisi yok** — PostgreSQL/Redis servisi tanımlı değil. `yarn test` DB gerektiren testlerde patlar.
- **`prisma generate` yok** — build öncesi `db:generate` çağrılmıyor. Prisma client oluşturulmadan build patlar.
- **Migration check yok** — `prisma migrate deploy` veya `prisma migrate status` yok.
- **Lint adımı ayrı değil** — `yarn lint` çağrılmıyor.
- **Cache yok** — `node_modules` cache'lenmemiyor, her run tam install.

#### 10. Script Haritası

**Root `package.json` (Turborepo):**

| Script | Komut | Not |
|---|---|---|
| `build` | `turbo run build` | Tüm workspace'leri build eder |
| `dev` | `turbo run dev --parallel` | Paralel dev server |
| `lint` | `turbo run lint` | |
| `test` | `turbo run test` | |
| `db:generate` | `yarn workspace @calon/database prisma generate` | Prisma client üretimi |
| `db:migrate` | `yarn workspace @calon/database prisma migrate dev` | **Dev only** — production'da `migrate deploy` kullanılmalı |
| `db:studio` | `yarn workspace @calon/database prisma studio` | |
| `db:seed` | `yarn workspace @calon/database prisma db seed` | Seed script tanımlı ama seed.ts dosyası olup olmadığı kontrol edilmeli |

**`apps/api/package.json`:**

| Script | Komut | Not |
|---|---|---|
| `build` | `nest build` | |
| `dev` | `nest start --watch` | |
| `start` | `node dist/main` | Production start |
| `test` | `jest` | |
| `test:e2e` | `jest --config jest-e2e.config.js --runInBand --forceExit` | E2E ayrı config |

**Dikkat:** `apps/api` hem `bull` (^4.16.5) hem `bullmq` (^5.34.9) paketine bağımlı. Dual queue dependency — hangisi kullanılıyor?

---

## FAZ-P3 DETAY — Seed / Fixture Disiplini

**Hedef çıktı:** `packages/database/prisma/seed.ts` + `test/fixtures/` + `docs/infra/seed-strategy.md`

### Görevler
- [ ] Seed sistemi canonical schema ile uyumlu hale getirildi
- [ ] Demo / local / test seed ayrımı yapıldı
- [ ] 1 demo tenant + 1 owner user seed'e eklendi
- [ ] 2 staff member + 3 service + 5 customer eklendi
- [ ] 10 appointment + 1 billing + 1 usage period eklendi
- [ ] Seed idempotent hale getirildi
- [ ] `test/fixtures/*.json` dosyaları oluşturuldu
- [ ] Sıfır DB reset + seed success testi
- [ ] `docs/infra/seed-strategy.md` yazıldı

---

## FAZ-P4 DETAY — Tenant İzolasyonu ve Auth

**Hedef çıktı:** tenant-aware service/repo düzenlemeleri + `docs/security/tenant-isolation.md`

### Görevler
- [ ] Public booking ile authenticated yönetim akışı ayrıştırıldı
- [ ] Tüm service/repository/query katmanında tenant scoping gözden geçirildi
- [ ] Public endpoint'lerde tenant resolution kontrollü (slug/domain/path)
- [ ] Authenticated endpoint'lerde tenant güveni doğrulanmış bağlamdan geliyor
- [ ] "Query unutulmuş tenant filter" için guardrail konuldu
- [ ] Tenant A → Tenant B data denied testi
- [ ] Cross-tenant staff/service/appointment listesi sızıntı testi
- [ ] `docs/security/tenant-isolation.md` yazıldı

### Başarısızlık Kriterleri
- **Tek bir cross-tenant data leak varsa → BAŞARISIZ**

---

## FAZ-P5 DETAY — Booking Core Tamamlama

**Hedef çıktı:** stabil public booking API + `docs/api/public-booking-contract.md`

### Görevler
- [ ] Service listing endpoint stabil
- [ ] Staff listing endpoint stabil
- [ ] Slot availability endpoint stabil
- [ ] Booking create canonical response üretiyor
- [ ] Payment-required / non-payment akışı ayrıştırıldı
- [ ] Appointment state machine başlangıç mantığı doğru
- [ ] Public response contract stabilize edildi
- [ ] get/staff/slots/create booking testleri geçti
- [ ] Invalid tenant/service/staff için doğru hata testi
- [ ] `docs/api/public-booking-contract.md` yazıldı

---

## FAZ-P6 DETAY — Production ENV Contract

**Hedef çıktı:** `.env.example` dosyaları + `docs/infra/env-contract.md`

### Görevler
- [ ] API env'leri tanımlandı (DATABASE_URL, REDIS_URL, JWT_SECRET, vb.)
- [ ] Worker env'leri tanımlandı
- [ ] Web/Booking env'leri tanımlandı (NEXT_PUBLIC_* vb.)
- [ ] Hangi env Vercel'de / Natro'da / local'de dokümante edildi
- [ ] `.env.example` dosyaları güncel
- [ ] Eksik env ile app fail-fast veriyor testi
- [ ] Invalid env ile startup reddediliyor testi
- [ ] `docs/infra/env-contract.md` yazıldı

---

## FAZ-P7 DETAY — Docker Productionization

**Hedef çıktı:** `docker/Dockerfile.api` + `docker/Dockerfile.worker` + `docker/docker-compose.production.yml` + `docs/deploy/natro-runtime.md`

### Görevler
- [ ] `docker/Dockerfile.api` yazıldı
- [ ] `docker/Dockerfile.worker` veya tek image + ayrı command
- [ ] `docker/docker-compose.production.yml` — Postgres/Redis servisi YOK
- [ ] Healthcheck tanımlandı
- [ ] Restart policy tanımlandı
- [ ] Log akışı erişilebilir
- [ ] API container boot success testi
- [ ] Worker container Redis bağlantı testi
- [ ] `docs/deploy/natro-runtime.md` yazıldı

---

## FAZ-P8 DETAY — Routing / DNS / Edge Topology

**Hedef çıktı:** `docs/infra/routing-topology.md`

### Görevler
- [ ] calon.com.tr → web Vercel routing doğrulandı
- [ ] book.calon.com.tr → booking routing doğrulandı
- [ ] api.calon.com.tr → Natro API routing doğrulandı
- [ ] SSL/TLS doğrulandı, HTTPS zorlanıyor
- [ ] WAF temel kuralları açıldı
- [ ] API cache hataları engellendi
- [ ] CORS origin listesi gerçek topology'ye göre düzeltildi
- [ ] Webhook/passthrough endpoint'leri özel ele alındı
- [ ] `docs/infra/routing-topology.md` yazıldı

---

## FAZ-P9 DETAY — Gözlemleme / Operasyon Minimum Paket

**Hedef çıktı:** `docs/ops/minimum-observability.md`

### Görevler
- [ ] `/health` endpoint aktif
- [ ] `/ready` endpoint gerçek bağımlılık kontrolü yapıyor
- [ ] `/version` endpoint commit/build bilgisi veriyor
- [ ] Structured logs yapılandırıldı
- [ ] requestId / correlationId her request'te mevcut
- [ ] Worker log context tanımlandı
- [ ] Failed job log'da ayırt edilebiliyor
- [ ] Startup config validation aktif
- [ ] Migration version görünürlüğü mevcut
- [ ] `docs/ops/minimum-observability.md` yazıldı

---

## FAZ-P10 DETAY — Controlled Production Launch

**Hedef çıktı:** `docs/deploy/controlled-launch-checklist.md` + `docs/deploy/rollback-playbook.md`

### Görevler
- [ ] Internal test tenant kuruldu
- [ ] Staging benzeri production smoke testi tamamlandı
- [ ] 1 pilot tenant canlıya alındı
- [ ] End-to-end booking success testi
- [ ] Auth, billing basic, queue basic testleri geçti
- [ ] Rollback dry-run success
- [ ] `docs/deploy/controlled-launch-checklist.md` yazıldı
- [ ] `docs/deploy/rollback-playbook.md` yazıldı

---

## AÇIK KARAR GEREKTİREN KONULAR

> *(Claude Code tarafından doldurulur, Suat ile çözülür)*

```
[KARAR GEREKLİ]: —
```

---

## BLOCKER / SORUNLAR

> *(Claude Code tarafından doldurulur)*

```
Aktif blocker: —
```

---

## SESSION GEÇMİŞİ

| Tarih | Faz | Yapılan | Kalan |
|-------|-----|---------|-------|
| Kurulum | — | CLAUDE.md + STATUS.md oluşturuldu | P0 başlamadı |

---

*Bu dosyayı her session sonunda güncelle ve commit et.*
*Format: `git commit -m "[STATUS] Faz-PX güncellendi"`*
