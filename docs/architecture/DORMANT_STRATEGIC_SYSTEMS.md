# Dormant Strategic Systems

> Son guncelleme: 2026-03-31
> Bu belge aktif product surface'e baglanmamis ama stratejik degeri olan katmanlari siniflandirir.
> "Import edilmiyor = olu" varsayimi YASAKTIR. Siniflandirma 5 kanit eksenine dayanir.

---

## Siniflandirma Sistemi

| Sinif | Anlam |
|---|---|
| ACTIVE CORE SUPPORT | Dogrudan product surface tasimasa da calisma cekirdegini destekler |
| DORMANT STRATEGIC | Testli, planli, gelecek faz yatirimi — korunacak |
| EARLY BUT VALUABLE | Zamanlama erken ama mimari degeri var — dondurulacak |
| TRUE DEAD | Ne aktif, ne testli, ne planli — temizlenebilir |

---

## 1. Decision Engine + Memory (DORMANT STRATEGIC)

**Dosyalar:**
- `apps/web/lib/decision-engine.ts`
- `apps/web/lib/decision-engine-failsafe.ts`
- `apps/web/lib/decision-memory.ts`
- `apps/web/lib/decision-memory-adapter.ts`
- `apps/web/lib/decision-rate-limiter.ts`

**Testler:**
- `decision-engine.test.ts` (kapsamli)
- `__tests__/decision-memory.test.ts` (kapsamli)

**Amac:** Akilli salon yonetimi — grouping, conflict resolution, confidence scoring, closed learning loop.
**Neden aktif degil:** Cekirdek operasyon yuzeyinde oncelik takvim/booking/lifecycle idi.
**Faz:** UI-11.1 / UI-11.3
**Kural:** Silme YASAK. Sonraki intelligent dashboard fazinda aktive edilecek.

---

## 2. Dashboard Data Source + Mock (DORMANT STRATEGIC)

**Dosyalar:**
- `apps/web/lib/dashboard-data-source.ts`
- `apps/web/lib/dashboard-mock.ts`

**Testler:** chaos-tests.test.ts, system-stabilization.test.ts kapsamli kullaniyor

**Amac:** api -> hybrid -> mock fallback zinciri. Data guvenlik katmani.
**Neden aktif degil:** Dashboard artik dogrudan useAppointments/useTenant hook'lari ile beslenyor.
**Faz:** UI-13.1
**Kural:** Silme YASAK. Decision engine + ops dashboard aktive edildiginde veri kaynagi olarak kullanilacak.

---

## 3. Telemetry V2 (DORMANT STRATEGIC)

**Dosya:** `apps/web/lib/telemetry.ts`

**Testler:** chaos-tests.test.ts, system-stabilization.test.ts

**Amac:** Buffer + batch + flush + dedup observability layer.
**Neden aktif degil:** Production observability henuz aktive edilmedi.
**Faz:** UI-13.1 TASK 5-6
**Kural:** Silme YASAK. Production log/observability fazinda aktive edilecek.

---

## 4. Safe Fetch (DORMANT STRATEGIC)

**Dosya:** `apps/web/lib/safe-fetch.ts`

**Testler:** chaos-tests.test.ts

**Amac:** Defensive HTTP wrapper — timeout, try/catch, invalid JSON safe fail.
**Kural:** Korunacak. Herhangi bir HTTP fetch katmani icin yeniden kullanilabilir.

---

## 5. Realtime Dashboard Hook v5 (DORMANT STRATEGIC)

**Dosya:** `apps/web/lib/use-realtime-dashboard.ts`

**Testler:** `__tests__/realtime-hook-chaos.test.ts`

**Amac:** Production-grade smart polling — visibility API, single-flight, stale drop, adaptive interval.
**Neden aktif degil:** Dashboard su an dogrudan React Query ile calisiyor.
**Faz:** UI-REALTIME-01.3 (v5)
**Kural:** Silme YASAK. Real-time dashboard aktive edildiginde dogrudan kullanilacak.

---

## 6. Chaos + Debug (EARLY BUT VALUABLE)

**Dosyalar:**
- `apps/web/lib/chaos.ts`
- `apps/web/lib/decision-debug.ts`

**Testler:** chaos-tests.test.ts

**Amac:** Dev/debug/stress testing tooling.
**Kural:** Silinemez — test zincirini kirar. Ama aktive edilmeyecek.

---

## 7. Dashboard Presentational Components (EARLY BUT VALUABLE)

**Dosyalar:** 22 component (sidebar/topbar haric):
action-card, alert-bar, appointment-row, appointment-sheet, capacity-panel,
decision-card, decision-panel, growth-action-card, hint-card, inline-edit,
lifecycle-hint, operations-strip, retention-card, revenue-card, safe-block,
section-header, segment-card, service-performance, staff-ops-card,
staff-performance, stat-card, status-action-group, timeline

**Testler:** Dogrudan test edilmiyor ama dashboard-mock tiplemeye bagli.
**Amac:** Gelecek ops dashboard yuzeyinin presentational katmani.
**Kural:** Silinmeyecek ama aktive edilmeyecek. Sonraki ops dashboard fazinda gerçek API'ye baglanacak.

---

## 8. dev-debug-overlay (TRUE DEAD)

**Dosya:** `apps/web/components/dashboard/dev-debug-overlay.tsx`

**Testler:** Yok
**Import:** Hicbir yerde kullanilmiyor (0 reference)
**Amac:** Dev-only debug overlay
**Kural:** Temizlenebilir.

---

## 9. Backend Test Altyapisi (ACTIVE CORE SUPPORT)

**Dosyalar:** 29 spec dosyasi, ~7700 satir
**Amac:** Worker/queue/DLQ/payment/delivery/appointment guvenlik korumasi
**Kural:** Kesinlikle korunacak. Tekrar kurdurma YASAK.

---

## 10. Frontend Lib Tests (DORMANT STRATEGIC)

**Dosyalar:**
- `__tests__/chaos-tests.test.ts`
- `__tests__/decision-memory.test.ts`
- `__tests__/realtime-hook-chaos.test.ts`
- `__tests__/system-stabilization.test.ts`
- `decision-engine.test.ts`

**Amac:** Dormant katmanlarin test korumasi.
**Kural:** Dormant katmanlar korundugu surece testler de korunacak.
