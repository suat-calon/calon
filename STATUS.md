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
