# CALON — CONTEXT BRIEF
> Yeni sohbet açıldığında bu dosyayı ilk mesaj olarak yapıştır.
> Son güncelleme: 2026-03-23 — Infra/branch gerçeği hizalandı.
> Source of truth: docs/runtime/REALITY_CHECK.md

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
| Cache (production) | Upstash Redis |
| API/Worker host | Oracle Cloud (Docker container) |
| Frontend host | Vercel (web + booking) |
| Edge/DNS | Cloudflare |
| Domain registrar | Natro (backend host DEĞİL) |
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
apps/api/          → NestJS backend (Oracle Cloud Docker)
apps/booking/      → Public booking app (Vercel)
apps/web/          → Admin web app (Vercel)
packages/database/ → Prisma schema & client (canonical kaynak)
docker/            → Production Dockerfile'lar
test/fixtures/     → Seed/fixture JSON'lar
CLAUDE.md          → Claude Code session anayasası
docs/runtime/REALITY_CHECK.md → Tek mutlak durum belgesi (STATUS.md ve tracker.html arşivlendi)
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
**Katman 1 — Prisma interceptor v3.0 (filter-only):**
- 26 model TENANT_SCOPED_MODELS (appointmenthold dahil)
- SADECE WHERE filtre — $transaction/set_config YOK (race condition riski sıfır)
- findUnique HARİÇ (Prisma kısıtlaması)
- SOFT_DELETE_MODELS için otomatik isDeleted: false

**Katman 2 — PostgreSQL RLS (NULLIF passthrough):**
- 26 tablo ENABLE + FORCE ROW LEVEL SECURITY
- Policy pattern: NULLIF passthrough (set_config yoksa crash etmez, interceptor filtreler)
- `$tenantTransaction` helper: interactive tx + set_config (4 kullanım)
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
| P5 | Booking Core | ✅ TAMAM | 18 e2e test, GIST+RLS+interceptor v3.0 |
| P6 | Production ENV Contract | ✅ TAMAM | env-contract, .env.example |
| P7 | Docker Productionization | ✅ TAMAM | compose, Dockerfile, production override |
| P8 | Routing / DNS / Edge | ✅ TAMAM | Oracle Cloud, Cloudflare, Vercel, SSL |
| P9 | Gözlemleme / Observability | ✅ TAMAM | correlation-id, logging, metrics |
| P10 | Controlled Launch | KISMİ | Frontend core + stage P0/P1 hazır, stage deploy bekleniyor |

### P5 Alt Faz Detayı (TAMAM)
| Alt Faz | İş | Durum | CI |
|---------|---|-------|-----|
| P5-0 | Schema gap fix (tenantId ekleme) | ✅ | ✅ |
| P5-1 | GIST EXCLUDE + appointment_holds RLS | ✅ | ✅ #17 |
| P5-2 | Booking flow e2e (4/4 test) | ✅ | ✅ #18 |
| P5-2.1 | RLS race condition fix + interceptor v3.0 | ✅ | ✅ #20 |
| P5-3 | Double-booking stress test (3/3 PASSED) | ✅ | ✅ #22 |
| P5-4 | Scheduling cron + availability cache (4/4 PASSED) | ✅ | ✅ |

### P5 Tamamlanma Özeti

- **Interceptor v3.0:** filter-only, race condition yapısal olarak imkansız
- **RLS:** 26 tablo NULLIF passthrough, $tenantTransaction 4 kullanım
- **GIST:** 3 EXCLUDE constraint (staff overlap, room overlap, hold overlap)
- **Triple-Layer Slot Security:** Redis NX → App overlap check → GIST hard guard
- **Hold FSM:** ACTIVE → CONSUMED/RELEASED/EXPIRED, 10dk TTL, Lua CAS unlock
- **Availability Cache:** 60s Redis TTL, invalidation on create/cancel/reschedule
- **E2E testler:** 18 test (booking-flow 4, double-booking 3, scheduling 4, tenant-isolation 3, concurrency mevcut)
- **Sıradaki:** P6 — Production ENV Contract

---

## 7. CI DURUMU

**CI pipeline:** `yarn install` → `prisma generate` → `yarn build` → `yarn test`  
**PostgreSQL servisi:** CI'a eklendi  
**Son başarılı CI:** #22 — 267/267 unit + 18 e2e test PASS  
**Bilinen not:** Turbo cache local'de clean build'i gizleyebilir, CI --force ile kontrol eder  
**Dual queue:** `bull` (eski) + `bullmq` (yeni) — temizlik P6'da

---

## 8. GOVERNANCE BELGELERİ

Aşağıdaki belgeler `docs/governance/` altında mevcuttur:
- AI_EXECUTION_RULES.md
- ARCHITECTURE_LOCK.md
- CALON_ENGINEERING_CONSTITUTION.md
- GIT_STRATEGY.md
- PROJECT_PROTOCOL.md

**Kanonik AI ajan protokolü:** `docs/runtime/EXECUTION_AGENT_STRICT_MODE.md`
**Kanonik branch politikası:** `docs/runtime/BRANCH_POLICY.md`

Governance belgeleri destekleyici referanstır. Runtime belgeleri baskındır.

---

## 9. ÇALIŞMA YÖNTEMİ

```
Bu chat (Opus):   Strateji, mimari karar, faz geçişi, dokümantasyon üretimi
Claude Code:      Kod yazımı ve infaz (C:\dev\calon klasöründe, Opus 4.6)
NotebookLM:       Geçmiş context sorgulama, teknik düzeltme kontrolü
CLAUDE.md:        Claude Code session anayasası (repo kökünde)
REALITY_CHECK.md: Tek mutlak durum belgesi (docs/runtime/)
STRICT_MODE.md:   AI ajan infaz protokolü (docs/runtime/)
BRANCH_POLICY.md: Branch stratejisi (docs/runtime/)
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
| `ef137cf` | P5-3: double-booking stress test 3/3 |
| `0d89ee8` | P5-4: scheduling cron + availability 4/4 — P5 TAMAM |

---

## 11. DURUM TAKİBİ

```
tracker.html ve STATUS.md arşivlenmiştir (docs/archive/).
Aktif durum belgesi: docs/runtime/REALITY_CHECK.md
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
