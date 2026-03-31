# Do Not Rebuild & Freeze Registry

> Son guncelleme: 2026-03-31
> Bu belge sonraki gelistiricilerin ve AI ajanlarinin tekrar kurdurma veya yanlis temizlik yapmasini onler.

---

## A. DO NOT REBUILD

Asagidaki yapilar insa edilmis, kanitlanmis ve tekrar kurulmayacaktir:

| Alan | Kanit | Risk |
|---|---|---|
| Calendar core + lifecycle + detail | 612 satir, weekly grid, E2E kanitli | COK YUKSEK |
| Public booking engine | 2x bagimsiz E2E hard gate | COK YUKSEK |
| Booking-ready provisioning guard | Deterministic 2x kanitli | YUKSEK |
| Appointment lifecycle state machine | PENDING->CONFIRMED->...->COMPLETED | COK YUKSEK |
| Auth / multi-tenant / session | JWT + HttpOnly cookie + tenant context | YUKSEK |
| Catalog CRUD (services + products) | Tam CRUD, runtime kanitli | YUKSEK |
| Customers core + profile | List, search, profile, calendar link | YUKSEK |
| Admin / super-admin backend | 4 controller, guard, 16+ endpoint | COK YUKSEK |
| Billing / finance backend | 8+ dosya, cron, entitlements, webhook | COK YUKSEK |
| Worker / queue / DLQ / outbox | Dispatcher, archive, 10+ processor, 13 spec | COK YUKSEK |
| Event / outbox pattern | Producer, repository | YUKSEK |
| Notification / delivery | Cost-policy, preference, template | ORTA |
| Observability (correlation, prometheus) | Middleware, store, interceptor, metrics | YUKSEK |
| Stage deploy / compose / env guard | Deterministik 3-katmanli zincir | YUKSEK |
| Onboarding flow | Backend + frontend, booking-ready guard | YUKSEK |
| Settings / tenant profile PATCH | Controller + frontend | ORTA |

---

## B. FREEZE AND DOCUMENT

Asagidaki katmanlar su an aktif degildir ama stratejik deger tasidiginden korunacaktir:

| Alan | Dosya Sayisi | Kural |
|---|---|---|
| Decision engine + memory | 5 lib + 2 test | Silme YASAK, sonraki intelligent ops fazinda aktive edilecek |
| Dashboard data-source + mock | 2 lib | Silme YASAK, decision engine ile birlikte aktive edilecek |
| Telemetry V2 | 1 lib | Silme YASAK, production observability fazinda aktive edilecek |
| Safe-fetch | 1 lib | Silme YASAK, yeniden kullanilabilir |
| Realtime dashboard hook v5 | 1 lib + 1 test | Silme YASAK, v5 bug fix gecmisi var |
| Chaos + debug | 2 lib | Silme YASAK, test zincirini kirar |
| 22 dashboard presentational component | 22 dosya | Silme YASAK, ops dashboard aktive edildiginde kullanilacak |
| Frontend lib tests (5 dosya) | 5 test | Dormant katmanlarla birlikte korunacak |

Toplam freeze: ~39 dosya

---

## C. CLEANUP CANDIDATE

Yalnizca su dosya gercek atil yuk olarak tespit edilmistir:

| Dosya | Neden | Risk |
|---|---|---|
| `apps/web/components/dashboard/dev-debug-overlay.tsx` | 0 import, test yok, sadece debug overlay | DUSUK |

---

## Kurallar

1. DO NOT REBUILD listesindeki alanlara yeni mimari kurmak YASAK
2. FREEZE listesindeki dosyalari silmek YASAK
3. CLEANUP yapilacaksa sadece bu belgede "CLEANUP CANDIDATE" olarak isaretlenmis dosyalar icin
4. Yeni dosya FREEZE'e eklenmeden once DORMANT_STRATEGIC_SYSTEMS.md guncellenmeli
5. AI ajani bu belgeyi source-of-truth olarak kabul edecek
