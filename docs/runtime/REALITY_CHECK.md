# REALITY CHECK — CALON
> Son güncelleme: P10.4 — Demo Tenant Activation

---

## DEMO TENANT

| Alan | Değer |
|---|---|
| slug | `demo-salon` |
| name | Demo Salon |
| status | ACTIVE |
| timezone | Europe/Istanbul |
| currency | TRY |
| Booking URL | `/booking/demo-salon` |

---

## SEED VERİ SETİ

| Tablo | Kayıt |
|---|---|
| tenant | 1 (demo-salon, ACTIVE) |
| location | 1 (Merkez Şube, İstanbul) |
| staff | 2 (Ayşe Kuaför, Mehmet Berber) |
| service | 3 (Saç Kesimi 30dk, Fön 45dk, Saç Boyama 90dk) |
| staff_services | 6 (her personel her hizmeti verebilir) |
| staff_working_hours | 14 (2 personel × 7 gün; Pzt–Cmt 09:00–18:00, Paz kapalı) |
| customers | 5 |
| appointments | 10 (CONFIRMED, sonraki 5 gün) |

**Seed komutu:**
```bash
cd packages/database && npx prisma db seed
```

---

## ÇALIŞAN FLOWLAR

- [x] `GET /booking/demo-salon` → sayfa render oluyor
- [x] `GET /public/salon/:slug` → salon bilgisi dönüyor
- [x] `GET /public/services?slug=demo-salon` → 3 hizmet listesi
- [x] `GET /public/staff?slug=demo-salon` → 2 personel + serviceIds
- [x] `GET /public/availability?slug=demo-salon&staffId=...&date=...` → slotlar (working hours gerekli, seed'de var)
- [x] `POST /public/book` → randevu oluşturma (API contract confirmed)

---

## ÇALIŞAN BACKEND ENDPOINT'LER

```
GET  /appointments
GET  /appointments/:id
PATCH   /products/:id
DELETE  /products/:id
PATCH   /services/:id
DELETE  /services/:id
GET  /tenants/me
```

---

## PUBLIC API DURUMU (P10.3.1 / P10.3.2 sonrası)

| Endpoint | Durum |
|---|---|
| `GET /public/salon/:slug` | ✅ çalışıyor |
| `GET /public/services?slug=` | ✅ slug-first |
| `GET /public/staff?slug=` | ✅ slug-first |
| `GET /public/availability?slug=` | ✅ slug-first |
| `DELETE /public/holds/:id?slug=` | ✅ slug-first |
| `POST /public/book { slug }` | ✅ slug-first |
| `POST /public/holds { slug }` | ✅ slug-first |

**Contract:** tenantId hiçbir public endpoint'te görünmez — backend slug'dan çözer.

---

## DOĞRULANMAYANLAR

- [ ] Gerçek rezervasyon e2e testi (API up + DB bağlı ortamda)
- [ ] `@IsPhoneNumber('TR')` libphonenumber edge case'leri
- [ ] Ödeme / İyzico akışı
- [ ] Production deploy (Vercel + Neon)
- [ ] SMS bildirim akışı

---

## BİLİNEN DURUMLAR

- slug-first contract P10.3.1'de tamamlandı ✅
- tenantId leak P10.3.1'de çözüldü ✅
- StaffWorkingHour P10.4 seed'e eklendi ✅
- StaffService relation P10.4 seed'e eklendi ✅

---

## INFRA

- local: Docker (Postgres + Redis)
- production: Vercel + Neon (eu-central-1) + Upstash Redis (Frankfurt)
- DNS: Cloudflare → calon.com.tr / book.calon.com.tr
