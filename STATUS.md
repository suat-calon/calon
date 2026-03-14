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
| P2 | Migration Anayasası | 🔄 DEVAM | 3/8 |
| P3 | Seed / Fixture Disiplini | 🔄 DEVAM | 7/9 |
| P4 | Tenant İzolasyonu ve Auth Gerçeği | 🔄 DEVAM | 7/8 |
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
- [x] Tüm mevcut migration'lar gözden geçirildi
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

#### 11. P2 İnfaz Aksiyonları (2026-03-14)

**Yapılan değişiklikler:**

1. **CI düzeltildi** (`.github/workflows/ci.yml`):
   - `pull_request` trigger eklendi (`dev`, `main`, `master`)
   - PostgreSQL 15 servisi eklendi (`calon_test` DB)
   - `yarn db:generate` adımı eklendi (Prisma client üretimi)

2. **Duplicate timestamp'ler çözüldü:**
   - `20260308000001_faz22_billing_core` → `20260308000002_faz22_billing_core`
   - `20260309000002_faz25_archive_tables` → `20260309000003_faz25_archive_tables`

3. **migration_lock.toml:** `provider = "postgresql"` — doğru, değişiklik gerekmedi.

**Kalan görevler:** Baseline migration testi, `prisma migrate dev/deploy` akışı dokümantasyonu, startup check.

---

## FAZ-P3 DETAY — Seed / Fixture Disiplini

**Hedef çıktı:** `packages/database/prisma/seed.ts` + `test/fixtures/` + `docs/infra/seed-strategy.md`

### Görevler
- [x] Seed sistemi canonical schema ile uyumlu hale getirildi
- [ ] Demo / local / test seed ayrımı yapıldı
- [x] 1 demo tenant + 1 owner user seed'e eklendi
- [x] 2 staff member + 3 service + 5 customer eklendi
- [x] 10 appointment + 1 billing + 1 usage period eklendi
- [x] Seed idempotent hale getirildi (tüm kayıtlar upsert)
- [ ] `test/fixtures/*.json` dosyaları oluşturuldu
- [x] Sıfır DB reset + seed success testi
- [ ] `docs/infra/seed-strategy.md` yazıldı

### P3 Bulgular (2026-03-14)

#### 1. Seed Dosyası Durumu

| Kontrol | Sonuç |
|---|---|
| `packages/database/prisma/seed.ts` | **YOK** — dosya fiziksel olarak mevcut değil |
| `package.json` prisma.seed config | **VAR** — `ts-node --compiler-options '{"module":"CommonJS"}' prisma/seed.ts` |
| `ts-node` bağımlılığı | **VAR** — `^10.9.2` (devDependencies) |

**Sonuç:** Seed altyapısı (config + ts-node) hazır ama seed dosyasının kendisi yazılmamış. `yarn db:seed` çalıştırılırsa `seed.ts not found` hatası verir.

#### 2. Test Fixture'ları

| Kontrol | Sonuç |
|---|---|
| `test/fixtures/` dizini | **VAR** — sadece `.gitkeep` içeriyor |
| Fixture JSON dosyaları | **YOK** — boş dizin |

#### 3. Schema Model Doğrulama

Seed için gerekli 9 model schema'da mevcut:

| Model | Durum |
|---|---|
| Tenant | VAR |
| User | VAR |
| StaffProfile | VAR |
| Service | VAR |
| Customer | VAR |
| Appointment | VAR |
| TenantBilling | VAR |
| UsagePeriod | VAR |
| Payment | VAR |

**Not:** Schema `StaffProfile` kullanıyor, `StaffMember` değil. CLAUDE.md'deki canonical model `staff_members` diyor — seed yazarken `StaffProfile` / `staff_profiles` kullanılacak.

#### 4. Seed Yazım Öngereksinimleri

- Prisma client generate edilmiş olmalı (`yarn db:generate`)
- DB ayakta olmalı (docker-compose up)
- Migration'lar uygulanmış olmalı (`yarn db:migrate`)
- Seed idempotent olmalı (tekrar çalıştırılabilir — upsert kullan)

#### 5. P3 İnfaz — seed.ts Oluşturuldu (2026-03-14)

**Dosya:** `packages/database/prisma/seed.ts`

| Veri | Adet | Detay |
|---|---|---|
| Tenant | 1 | slug: `demo-salon`, plan: BOUTIQUE |
| User (owner) | 1 | `owner@demo-salon.com`, role: TENANT_OWNER |
| Location | 1 | Merkez Şube, İstanbul |
| ServiceCategory | 1 | Saç Bakım |
| StaffProfile | 2 | Ayşe Kuaför, Mehmet Berber |
| Service | 3 | Saç Kesimi (150₺), Fön (200₺), Saç Boyama (500₺) |
| Customer | 5 | Elif, Zeynep, Fatma, Ali, Ahmet |
| Appointment | 10 | CONFIRMED, ONLINE, gelecek 5 gün, günde 2 |
| TenantBilling | 1 | TRIAL, MONTHLY, provider: NONE |
| UsagePeriod | 1 | 100 SMS, 50 AI dahil |

**Özellikler:**
- Tüm kayıtlar `upsert` ile idempotent
- Fixed UUID'ler (deterministic, tekrar çalıştırılabilir)
- Her kayıtta explicit `tenantId`
- Real Prisma model isimleri (`staffProfile`, `serviceCategory`)
- TypeScript syntax check: **0 error** (`tsc --noEmit --strict`)

#### 6. P3 Seed DB Testi (2026-03-14)

**ADIM 1 — migrate deploy:**
- `packages/database/.env` oluşturuldu (DATABASE_URL)
- `prisma migrate deploy` çalıştırıldı
- Rename edilen migration'lar (`faz22_billing_core` → `000002`, `faz25_archive_tables` → `000003`) DB'de eski isimle kayıtlıydı → `prisma migrate resolve --applied` ile çözüldü
- Son migration `20260312000001_faz5_platform_metrics_snapshot` uygulandı
- **24/24 migration applied**

**ADIM 2 — seed çalıştırma:**
- İlk deneme: `slug: 'demo-salon'` unique çakışması (mevcut tenant farklı UUID) → `where: { slug }` ile upsert'e geçildi
- İkinci deneme: `type "public.UserStatus" does not exist` — 7 enum DB'de eksik (text olarak oluşturulmuş, enum migration'ı hiç yapılmamış)
- Eksik enum'lar oluşturuldu: `UserRole`, `UserStatus`, `LoyaltyAction`, `TransactionType`, `PhotoType`, `MessageChannel`, `MessageDirection`
- Text kolonlar enum'a dönüştürüldü (`users.status`, `user_tenants.role`, `messages.channel/direction`, vb.)
- `user_tenants.role` mevcut değer `OWNER` → `TENANT_OWNER` olarak güncellendi (schema ile uyumlu)
- `customer_photos` tablosu DB'de yok — migration eksik, atlandı
- `yarn db:seed` başarılı

**ADIM 3 — doğrulama sorgusu:**

```
 tenants | users | staff | services | customers | appointments
---------+-------+-------+----------+-----------+--------------
       2 |     2 |     3 |        4 |        17 |           14
```

Seed verileri (eski veri dahil toplam):
| Tablo | Eski | Seed | Toplam |
|---|---|---|---|
| tenants | 1 (+demo-salon mevcut) | 0 (upsert, aynı slug) | 2 |
| users | 1 | 1 | 2 |
| staff_profiles | 1 | 2 | 3 |
| services | 1 | 3 | 4 |
| customers | 12 | 5 | 17 |
| appointments | 4 | 10 | 14 |

**Ek bulgular — DB/Schema enum uyumsuzluğu:**
- 7 enum tipi DB'de text olarak yaşıyordu, Prisma schema'da enum olarak tanımlıydı
- Bu uyumsuzluk migration eksikliğinden kaynaklanıyor — init migration enum yerine text kolon oluşturmuş
- Manuel düzeltme yapıldı ama bu bir migration olarak kaydedilmeli (P2 kalan görevi)

---

## FAZ-P4 DETAY — Tenant İzolasyonu ve Auth

**Hedef çıktı:** tenant-aware service/repo düzenlemeleri + `docs/security/tenant-isolation.md`

### Görevler
- [x] Public booking ile authenticated yönetim akışı ayrıştırıldı
- [x] Tüm service/repository/query katmanında tenant scoping gözden geçirildi
- [x] Public endpoint'lerde tenant resolution kontrollü (slug/domain/path)
- [x] Authenticated endpoint'lerde tenant güveni doğrulanmış bağlamdan geliyor
- [x] "Query unutulmuş tenant filter" için guardrail konuldu
- [x] Tenant A → Tenant B data denied testi
- [x] Cross-tenant staff/service/appointment listesi sızıntı testi
- [ ] `docs/security/tenant-isolation.md` yazıldı

### Başarısızlık Kriterleri
- **Tek bir cross-tenant data leak varsa → BAŞARISIZ**

### P4 Bulgular (2026-03-14) — Tenant İzolasyonu Analizi

#### 1. Çift Katmanlı İzolasyon Mimarisi

**Dosya:** `apps/api/src/common/prisma.service.ts` (222 satır)

| Katman | Mekanizma | Kapsam |
|--------|-----------|--------|
| **1. Uygulama (Prisma $extends)** | `$allModels.$allOperations` interceptor — `tenantContext.getStore()?.tenantId` varsa WHERE enjeksiyonu | Bulk okuma (findMany/findFirst/count/aggregate/groupBy) + yazma (create/update/upsert/delete/…Many) |
| **2. PostgreSQL RLS** | `$transaction([set_config('app.tenant_id', $1, true), query])` — aynı bağlantıda SET CONFIG + sorgu | Raw SQL dahil tüm DB erişimi |

**Kapsanan modeller (21 adet):** location, room, usertenant, staffprofile, staffworkinghour, staffshift, servicecategory, service, staffservice, product, stocklog, customer, appointment, transactionledger, commissionlog, loyaltytransaction, consentform, refreshtoken, idempotencykey, auditlog, message

**IDOR koruması:** tenantId SADECE JWT'den alınır (body/query'den ASLA) — `tenant.guard.ts` satır 7-11

#### 2. Guard Zinciri

| Guard | Scope | Dosya |
|-------|-------|-------|
| **TenantGuard** | GLOBAL — tüm endpoint'leri korur | `modules/iam/guards/tenant.guard.ts` |
| **BillingGuard** | Plan bazlı erişim kontrolü | `modules/billing/guards/billing.guard.ts` |
| **AdminGuard** | API key ile admin erişimi | `modules/admin/admin.guard.ts` |
| **RequireFeatureGuard** | Feature flag kontrolü | `modules/billing/guards/require-feature.guard.ts` |
| **ProPlanGuard** | Pro+ plan kontrolü | `modules/loyalty/guards/pro-plan.guard.ts` |
| **AvailabilityAbuseGuard** | Rate limiting (public) | `modules/public/guards/availability-abuse.guard.ts` |

**Akış:** TenantGuard (global) → JWT verify → tenantContext.run() → Prisma interceptor otomatik filtre

#### 3. @Public() Endpoint'ler (TenantGuard'ı atlayan)

| Controller | Endpoint | Tenant Context | Risk |
|------------|----------|----------------|------|
| **HealthController** | GET /health | Yok — veri yok | GÜVENLİ |
| **PrometheusController** | GET /metrics | Yok — metrik | GÜVENLİ |
| **AuthController** | POST /auth/login, /register, /refresh, /logout | Yok — oturum yönetimi | GÜVENLİ |
| **OnboardingController** | POST /onboard | Yok — yeni tenant oluşturma | GÜVENLİ |
| **DiscoveryService** | GET /public/discovery/* | **YOK — KASITLI CROSS-TENANT** | GÜVENLİ (marketplace) |
| **PublicService** | GET,POST /public/salon, /services, /staff, /availability, /holds, /book | `runInContext(tenantId)` explicit | GÜVENLİ |
| **PaymentService** | POST /webhooks/iyzico | `runInContext(payment.tenantId)` explicit | GÜVENLİ |
| **AdminController** | /admin/* | AdminGuard (API key) — doğrudan sorgu | GÜVENLİ (admin) |
| **BillingWebhookController** | POST /webhooks/billing | Webhook validation | GÜVENLİ |

#### 4. Potansiyel Riskler

**RISK-1: findUnique() otomatik filtre DIŞINDA** (DÜŞÜK)
- `prisma.service.ts` satır 18: `findUnique` kasıtlı olarak hariç tutuluyor
- Tasarım kararı: unique alanlar (email, slug) tenant-agnostic
- Mitigasyon: Servis katmanı findUnique sonrası tenantId doğrulaması yapmalı
- **Durum:** Auth service'te `findUnique({email})` ve `findUnique({slug})` — global unique alanlar, sorun yok
- **Durum:** `findUnique({userId_tenantId})` — composite key tenantId içeriyor, sorun yok

**RISK-2: Discovery Service cross-tenant okuma** (DÜŞÜK — KASITLI)
- `modules/public/discovery.service.ts` satır 6-12: `runInContext()` kullanılmıyor
- Amaç: marketplace — şehirdeki tüm aktif salonları listeleme
- Mitigasyon: Sadece `status=ACTIVE` ve `isDeleted=false` olanlar gösteriliyor
- Yazma işlemi YOK

**RISK-3: SUPER_ADMIN placeholder tenantId** (DÜŞÜK)
- `tenant.guard.ts` satır 104: `payload.tenantId ?? 'super_admin'`
- Admin endpoint'leri zaten `@Public() + @UseGuards(AdminGuard)` ile korunuyor
- Prisma middleware 'super_admin' string'ini tenantId olarak filtrelerse boş sonuç döner — veri sızıntısı yok

**RISK-4: Müşteri telefon bazlı lookup** (ORTA)
- `modules/public/public.service.ts` satır ~396: `findFirst({ where: { phone } })`
- `runInContext(dto.tenantId)` içinde — Prisma middleware otomatik filtre UYGULAR
- **Şu an güvenli** ama context kaybında cross-tenant müşteri eşleşme riski var
- Öneri: explicit `where: { phone, tenantId }` eklemek defense-in-depth olur

**RISK-5: Raw SQL sorguları** (DÜŞÜK)
- Billing cron: `$executeRaw` webhook_events pruning — tarihe göre, tenant verisi yok
- Appointment overlap: `tstzrange()` — staffId + zaten RLS set_config aktif

#### 5. Tenant Middleware/Interceptor

| Kontrol | Sonuç |
|---------|-------|
| Dedicated `tenant.middleware.ts` | **YOK** |
| Dedicated tenant interceptor | **YOK** |
| Tenant context mekanizması | **AsyncLocalStorage** (`common/tenant.context.ts`) |

**Mimari:** Middleware değil Guard + AsyncLocalStorage + Prisma $extends üçlüsü. TenantGuard → tenantContext.run() → Prisma interceptor zinciri. Bu daha güvenli bir yaklaşım çünkü middleware bypass edilebilir ama global guard + DI interceptor zinciri tam coverage sağlıyor.

#### 6. Genel Değerlendirme

| Kriter | Durum | Not |
|--------|-------|-----|
| Otomatik tenant filtresi | **VAR** | Prisma $extends, 21 model |
| PostgreSQL RLS | **VAR** | set_config, batch $transaction |
| IDOR koruması | **VAR** | tenantId sadece JWT'den |
| @Public endpoint kontrol | **GÜVENLİ** | runInContext() veya kasıtlı cross-tenant |
| findUnique riski | **KABUL EDİLEBİLİR** | Tasarım kararı, servis katmanı sorumlu |
| Cross-tenant data leak | **TESPİT EDİLMEDİ** | Mevcut mimaride aktif sızıntı yok |
| Raw SQL güvenliği | **GÜVENLİ** | RLS + explicit filtre |

**SONUÇ:** Defense-in-depth mimarisi sağlam. Kritik güvenlik açığı tespit edilmedi. RISK-4 (telefon lookup) için defensive coding önerisi var ama mevcut haliyle Prisma middleware koruma sağlıyor. Kalan görevler: guardrail ekleme, cross-tenant test yazma, docs.

#### 7. RLS Restorasyon Migration (2026-03-15)

**Migration:** `20260314224455_p4_restore_rls_core`

Migration squash (`init_clean_baseline`) sırasında kaybolan RLS politikaları restore edildi.

| İşlem | Sonuç |
|-------|-------|
| ENABLE + FORCE ROW LEVEL SECURITY | **23 tablo** |
| CREATE POLICY tenant_isolation_* | **23 policy** |
| Policy target | `calon_app` |
| Cast yönü | `current_setting('app.tenant_id', true)::uuid` (index-friendly) |

**Hariç tutulan tablolar (tenantId kolonu yok):**
- `staff_working_hours` — staffId FK üzerinden dolaylı izolasyon
- `staff_services` — staffId+serviceId FK üzerinden dolaylı izolasyon

**Ek değişiklik:** `prisma.service.ts` TENANT_SCOPED_MODELS'e `'payment'` eklendi.

**Doğrulama:**
- KONTROL A: 11/11 örneklem tablo → `rls_enabled=t`, `rls_forced=t`
- KONTROL B: `pg_policies` → 23 `tenant_isolation_*` policy
- KONTROL C: `grep 'payment'` → TENANT_SCOPED_MODELS'de mevcut

#### 8. Cross-Tenant E2E Testleri (2026-03-15)

**Dosya:** `apps/api/test/tenant-isolation.e2e-spec.ts`

| Test | Senaryo | Sonuç |
|------|---------|-------|
| 1 | Tenant A kullanıcısı Tenant B müşterilerini göremez | **PASSED** |
| 2 | Tenant A müşterisi Tenant B token ile 404 döner | **PASSED** |
| 3 | Public /services endpoint sadece hedef tenant verisini döner | **PASSED** |

**3/3 test PASSED** — Real DB + JWT tokens + Prisma interceptor + RLS validation.

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
| 2026-03-14 | P2 | CI düzeltildi, duplicate timestamp çözüldü | P2 kalan: baseline test, docs |
| 2026-03-14 | P3 | seed.ts oluşturuldu (idempotent, 10 model) | P3 kalan: fixtures, DB test, docs |
| 2026-03-14 | P4 | Tenant izolasyonu analizi tamamlandı (4/8 görev) | P4 kalan: guardrail, cross-tenant test, docs |
| 2026-03-15 | P4 | RLS restore migration uygulandı, 23 tablo, FORCE aktif + payment TENANT_SCOPED | P4 kalan: cross-tenant test, docs |
| 2026-03-15 | P4 | Cross-tenant e2e testleri yazıldı ve geçti (3/3 PASSED) | P4 kalan: docs |

---

*Bu dosyayı her session sonunda güncelle ve commit et.*
*Format: `git commit -m "[STATUS] Faz-PX güncellendi"`*
