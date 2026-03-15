# CALON — CONTEXT BRIEF
> Yeni sohbet açıldığında bu dosyayı ilk mesaj olarak yapıştır.
> Son güncelleme: P5 aktif (P5-3 sıradaki), P0-P4 + P5-0/1/2/2.1 tamamlandı.

---

## 1. KİM / NE

**Proje:** Calon OS — çok kiracılı kuaför/güzellik salonu yönetim SaaS platformu  
**Şirket:** Orion Technology  
**Ekip:** Suat Gökçe (Project Owner + Head Orchestrator), Cansever Aslan, Hüseyin Karabulut  
**Hedef:** MVP-Exit-Gate — ilk ödeme yapan production müşteri  
**Süreç:** Suat strateji/mimari kararları bu chat'te alır. Kod infazı Claude Code (terminal) ile yapılır. Opus modeli strateji chat'te, Opus 4.6 Claude Code'da kullanılıyor.

---

## 2. ARAÇ SETİ (DEĞİŞTİRİLEMEZ)

| Katman | Araç |
|--------|------|
| DB (production) | Neon (PostgreSQL) |
| Cache (production) | Cloud Redis |
| API/Worker host | Natro (Docker container) |
| Frontend host | Vercel |
| Edge/DNS | Cloudflare |
| DB (local dev) | docker-compose calon_postgres |
| Cache (local dev) | docker-compose calon_redis |
| ORM | Prisma |
| Backend | NestJS |
| Queue | BullMQ |
| Monorepo | Turborepo (yarn workspaces) |

---

## 3. REPO DURUMU

**Aktif repo:** `C:\dev\calon` — GitHub: `https://github.com/suat-calon/calon`  
**Aktif branch:** `dev`  
**Arşiv repo:** `C:\dev\calon-os` — dokunulmayacak  
**CI:** GitHub Actions — şu an YEŞİL (#20) — 267/267 test PASS  

**Monorepo yapısı:**
```
apps/api/          → NestJS backend (Natro Docker)
apps/booking/      → Public booking app (Vercel)
apps/web/          → Admin web app (Vercel)
packages/database/ → Prisma schema & client (canonical kaynak)
docker/            → Production Dockerfile'lar
test/fixtures/     → Seed/fixture JSON'lar
CLAUDE.md          → Claude Code session anayasası
STATUS.md          → Aktif faz takibi
tracker.html       → Local MVP-Exit-Gate tracker (localStorage, repoya commit edilmez)
CONTEXT_BRIEF.md   → Yeni sohbet context özeti (bu dosya)
docs/security/tenant-isolation.md → P4 güvenlik dokümantasyonu
```

---

## 4. KRİTİK MİMARİ KARARLAR (ALINAN)

### 4a. Migration Squash — Temel Karar
24 eski migration → tek clean baseline migration.  
**Dosya:** `packages/database/prisma/migrations/20260314204129_init_clean_baseline/migration.sql`  
**İçerik:** 1368 satır, 46 model, sıfır drift  
**CI ilk kez yeşil:** commit `745ab17`

### 4b. Tenant İzolasyonu — Üçlü Katman (Triple-Layer)
**Katman 1 — Prisma interceptor v3.0:**
- 25 model TENANT_SCOPED_MODELS (payments dahil)
- findUnique artık da tenantId filtresi taşıyor (v3.0 ile eklendi)
- $allOperations interceptor

**Katman 2 — PostgreSQL RLS (P4'te restore edildi):**
- 25 tablo ENABLE + FORCE ROW LEVEL SECURITY
- `calon_app` rolüne policy: `"tenantId" = current_setting('app.tenant_id', true)::uuid`
- appointment_holds da RLS kapsamında
- Cast yönü: `::uuid` (sütun değil, current_setting cast ediliyor — index korunuyor)

**Katman 3 — PostgreSQL GIST EXCLUDE (P5-1'de restore edildi):**
- `appt_staff_overlap_excl` — appointments tablosu
- `appt_room_overlap_excl` — room çakışması
- `hold_staff_overlap_excl` — appointment_holds tablosu
- btree_gist extension aktif
- tsrange kullanılıyor (tstzrange değil — Prisma DateTime uyumlu)

### 4c. Model İsimlendirme
- `StaffProfile` / `staff_profiles` — `staff_members` DEĞİL
- `UserTenant` — junction table
- Toplam 46 Prisma modeli

### 4d. Seed Sistemi
- `packages/database/prisma/seed.ts` — idempotent, upsert tabanlı
- Sıfır DB'de doğrulandı: 1 tenant / 1 user / 2 staff / 3 service / 5 customer / 10 appointment

---

## 5. KIRMIZI ÇİZGİLER (ASLA YAPILMAYACAK)

```
❌ Production'da db push
❌ Production'da manuel tablo/kolon açma
❌ Mevcut migration dosyalarını düzenleme veya silme (append-only)
❌ Migration sırasını değiştirme
❌ Production compose'a Postgres veya Redis servisi ekleme
❌ API ve Worker'ı farklı image versiyonlarıyla deploy etme
❌ Schema drift varken feature yazmak
❌ Tenant izolasyonu bypass eden sorgu yazmak
❌ MVP-Exit-Gate öncesi UI/cosmetic iş
```

### Locked Bileşenler (Değiştirilemez)
```
🔒 BullMQ          → queue sistemi
🔒 Outbox Pattern  → event_outbox + event_deliveries
🔒 Booking FSM     → XState v5, PENDING→CONFIRMED→CHECKED_IN→IN_SERVICE→COMPLETED
🔒 GIST EXCLUDE    → double-booking önleme DB katmanı
🔒 Webhook idempotency → payment doğrulama mantığı
🔒 Hold Service    → Redis NX + DB-backed FSM, 10dk TTL, Lua CAS unlock
```

---

## 6. FAZ DURUMU

| Faz | Başlık | Durum | Notlar |
|-----|--------|-------|--------|
| P0 | Repo Otopsisi | ✅ TAMAM | calon aktif repo tespit edildi |
| P1 | Canonical Domain Model | ✅ TAMAM | 46 model haritalandı |
| P2 | Migration Anayasası | ✅ TAMAM | Clean baseline, CI yeşil |
| P3 | Seed Disiplini | ✅ TAMAM | Idempotent seed, sıfır DB doğrulandı |
| P4 | Tenant İzolasyonu | ✅ TAMAM | RLS restore + docs yazıldı |
| P5 | Booking Core | 🔄 AKTİF | P5-3 sırada |
| P6 | Production ENV Contract | ⬜ | |
| P7 | Docker Productionization | ⬜ | |
| P8 | Routing / DNS / Edge | ⬜ | |
| P9 | Gözlemleme / Observability | ⬜ | |
| P10 | Controlled Launch | ⬜ | |

### P5 Alt Faz Detayı
| Alt Faz | İş | Durum | CI |
|---------|---|-------|-----|
| P5-0 | Schema gap fix (tenantId ekleme) | ✅ | ✅ |
| P5-1 | GIST EXCLUDE + appointment_holds RLS | ✅ | ✅ #17 |
| P5-2 | Booking flow e2e (4/4 test) | ✅ | ✅ #18 |
| P5-2.1 | RLS race condition fix + interceptor v3.0 | ✅ | ✅ #20 |
| P5-3 | Double-booking stress test (GIST doğrulama) | ⬜ | |
| P5-4 | Scheduling cron + availability cache e2e | ⬜ | |

### P5-3 İçin Hazır Talimat (Claude Code'a ver)
```
C:\dev\calon klasöründe çalış. CLAUDE.md oku.

P5-3 — DOUBLE-BOOKING STRESS TEST

ADIM 0 — Ön kontrol:
cat apps/api/test/appointment-concurrency.e2e-spec.ts | head -50
docker exec calon_postgres psql -U postgres -d calon_dev -c "
SELECT conname FROM pg_constraint
WHERE conname IN (
  'appt_staff_overlap_excl',
  'appt_room_overlap_excl', 
  'hold_staff_overlap_excl'
);"

ADIM 1 — Test dosyası oluştur:
apps/api/test/double-booking-stress.e2e-spec.ts

3 senaryo:
1. 5 eşzamanlı hold isteği → 1 başarılı, 4 × 409
2. Dolu slota book isteği → 409
3. Doğrudan DB insert → GIST violation (23P01)

ADIM 2 — Çalıştır:
yarn workspace @calon/api jest --config jest-e2e.config.js \
  --testPathPattern=double-booking-stress --forceExit

ADIM 3 — STATUS.md güncelle, commit + push
```

---

## 7. CI DURUMU

**CI pipeline:** `yarn install` → `prisma generate` → `yarn build` → `yarn test`  
**PostgreSQL servisi:** CI'a eklendi  
**Son başarılı CI:** #20 — 267/267 test PASS  
**Bilinen not:** Turbo cache local'de clean build'i gizleyebilir, CI --force ile kontrol eder  
**Dual queue:** `bull` (eski) + `bullmq` (yeni) — temizlik P6'da

---

## 8. BİLİNÇLİ SİLİNEN DOSYALAR (GERİ GETİRİLMEYECEK)

```
❌ AI_EXECUTION_RULES.md          → Eski ChatGPT protokolü, CLAUDE.md ile çakışıyordu
❌ ARCHITECTURE_LOCK.md           → Eski ChatGPT protokolü
❌ CALON_ENGINEERING_CONSTITUTION.md → Eski ChatGPT protokolü  
❌ PROJECT_PROTOCOL.md            → Eski ChatGPT protokolü
```
CLAUDE.md tek yetkili kaynak.

---

## 9. ÇALIŞMA YÖNTEMİ

```
Bu chat (Opus):   Strateji, mimari karar, faz geçişi, dokümantasyon üretimi
Claude Code:      Kod yazımı ve infaz (C:\dev\calon klasöründe, Opus 4.6)
NotebookLM:       Geçmiş context sorgulama, teknik düzeltme kontrolü
CLAUDE.md:        Claude Code session anayasası (repo kökünde)
STATUS.md:        Aktif faz takibi (her session sonrası güncellenir)
tracker.html:     Local takip arayüzü (C:\dev\calon\tracker.html, çift tıkla)
```

**Onay kuralları:**
- `grep/cat/ls/find/git log/docker exec psql` → hep onay ver
- `git add/commit`, `prisma generate`, `tsc --noEmit` → hep onay ver
- `prisma migrate deploy/git push/docker compose down -v` → onay ver
- Mimari karar / yeni migration / locked bileşen / faz geçişi → önce bu chat

---

## 10. ÖNEMLİ COMMIT'LER

| Commit | Açıklama |
|--------|----------|
| `745ab17` | Clean baseline migration — CI ilk yeşil |
| `03ca931` | seed.ts oluşturuldu |
| `8ac9215` | docs/security/tenant-isolation.md |
| P4 commit | RLS restore — 25 tablo FORCE ROW LEVEL SECURITY |
| P5-1 commit | GIST EXCLUDE constraints restore (btree_gist) |
| P5-2 commit | Booking flow e2e 4/4 |
| `3e0344a` | Interceptor v3.0 + worktree temizliği |

---

## 11. LOCAL TRACKER

```
tracker.html — C:\dev\calon\tracker.html
Tarayıcıda çift tıkla, çevrimdışı çalışır, localStorage'a kaydeder.
Repoya commit edilmez (P10 sonrası silinecek).
Bu chat faz geçişlerinde tracker için güncel HTML üretir.
```

---

## 12. P10 SONRASI — ERTELENENLER

**Post-MVP Süreç Yönetimi:**
- Versiyonlama stratejisi (semver: v1.0 → v1.1 → v2.0)
- Hotfix / patch süreci ve deployment kanalı
- Feature flag yönetimi (kademeli açılış)

**Güvenlik Döngüsü:**
- Periyodik güvenlik taraması (dependency audit, OWASP)
- Penetration test planı
- CVE takip ve patch politikası

**Incident Yönetimi:**
- On-call rotasyonu ve escalation planı
- Incident severity seviyeleri (P0-P3)
- Post-mortem süreci

**Monitoring ve Alerting:**
- SLA tanımları (uptime, response time)
- Alert eşikleri ve bildirim kanalları
- Dashboard ve raporlama

**Müşteri Geri Bildirim Döngüsü:**
- Bug report süreci
- Feature request yönetimi
- Müşteri başarı metrikleri

**Büyüme Sonrası (Scope Dışı):**
- Gelişmiş BI/analytics, AI özellikleri
- Marketplace, referral, loyalty expansion
- Çok katmanlı marketing automations
