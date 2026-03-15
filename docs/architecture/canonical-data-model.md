# Canonical Data Model — Calon OS

**Son guncelleme:** 2026-03-15 (P5-4 sonrasi — P5 TAMAM)

---

## Model Sayilari

| Kategori | Sayi |
|----------|------|
| Toplam Prisma modeli | 46 |
| Tenant-scoped (interceptor) | 26 |
| Tenant-scoped (RLS) | 26 |
| RLS'siz tenant-scoped | 0 |
| Global modeller | 21 (User, Tenant, vb.) |

---

## Tenant-Scoped Modeller (26)

Prisma interceptor (`prisma.service.ts` → `TENANT_SCOPED_MODELS`) tarafindan otomatik tenantId filtresi uygulanan modeller:

```
location, room, usertenant, staffprofile,
staffworkinghour, staffshift, servicecategory,
service, staffservice, product, stocklog,
customer, appointment, transactionledger,
commissionlog, loyaltytransaction, consentform,
refreshtoken, idempotencykey, auditlog, message,
campaigntemplate, customerphoto, referral, payment,
appointmenthold
```

Tum 26 modelde tenantId kolonu mevcut ve RLS aktif.

---

## RLS Korumali Tablolar (26)

26 tablo icin `ENABLE + FORCE ROW LEVEL SECURITY` aktif.

- **Policy:** `tenant_isolation_*` → `TO calon_app`
- **Migration:** `20260314224455_p4_restore_rls_core` (23 tablo) + `20260314235018_p5_0_schema_gap_fix` (2 tablo) + `20260315004554_p5_1_gist_constraints_and_holds_rls` (1 tablo)
- **Cast yonu:** `current_setting('app.tenant_id', true)::uuid` (index-friendly)

---

## GIST EXCLUDE Constraints (Double-Booking Hard Guard)

Migration squash sirasinda kaybolan GIST constraint'ler `20260315004554_p5_1_gist_constraints_and_holds_rls` ile restore edildi.

| Constraint | Tablo | Kapsam | Filtre |
|------------|-------|--------|--------|
| `appt_staff_overlap_excl` | appointments | tenantId + staffId + tsrange(startTime, endTime) | status NOT IN (CANCELLED, NO_SHOW, COMPLETED) AND isDeleted = false |
| `appt_room_overlap_excl` | appointments | tenantId + roomId + tsrange(startTime, endTime) | roomId IS NOT NULL AND status NOT IN (CANCELLED, NO_SHOW, COMPLETED) AND isDeleted = false |
| `hold_staff_overlap_excl` | appointment_holds | tenantId + staffId + tsrange(startTime, endTime) | status = ACTIVE |

**Triple-Layer Slot Security:**
- **L1:** Redis NX (fast-path, ~1ms)
- **L2:** Application overlap check (kullanici dostu 409)
- **L3:** PostgreSQL GIST EXCLUDE (hard guard — bu constraint'ler)

---

## Defense-in-Depth v3.0 (P5-2.1 sonrasi)

**Katman 1 — Prisma Interceptor (filter-only):**
- `$extends` query interceptor (`prisma.service.ts`)
- TENANT_SCOPED_MODELS (26 model) icin otomatik WHERE tenantId
- SOFT_DELETE_MODELS icin otomatik WHERE isDeleted: false
- $transaction/set_config YOK — race condition riski sifir
- findUnique HARIC (Prisma kisitlamasi)

**Katman 2 — PostgreSQL RLS (conditional):**
- 26 tablo ENABLE + FORCE ROW LEVEL SECURITY
- Policy pattern: NULLIF passthrough
  * set_config cagrilmamissa → tum satirlar gorunur (interceptor filtreler)
  * set_config cagrilmissa → strict tenant enforcement
- `$tenantTransaction` helper: interactive tx + set_config
  * `appointment.service.ts`: 3 kullanim
  * `public.service.ts`: 1 kullanim

**Katman 3 — GIST EXCLUDE Constraints:**
- `appt_staff_overlap_excl` (appointments — staff cift rezervasyon)
- `appt_room_overlap_excl` (appointments — oda cift rezervasyon)
- `hold_staff_overlap_excl` (appointment_holds — hold cakisma)
- tsrange half-open interval [start, end)
- btree_gist extension

**Katman 4 — TenantGuard (request level):**
- JWT → AsyncLocalStorage (enterWith)
- tenantId SADECE dogrulanmis token'dan
- @Public() bypass → runInContext()

**Akis:**
```
HTTP Request
  → TenantGuard (JWT dogrulama, tenantId cikarma)
    → tenantContext.run() (AsyncLocalStorage'a yazma)
      → Prisma interceptor (WHERE tenantId = ? enjeksiyonu)
        → [Opsiyonel] $tenantTransaction (set_config + interactive tx)
          → PostgreSQL RLS policy (DB seviyesi filtre)
            → GIST EXCLUDE constraint (slot cakisma hard guard)
```

### Test Kapsami (P5)

- 18 e2e test (booking-flow 4, double-booking 3, scheduling 4, tenant-isolation 3, concurrency onceden mevcut)
- 267 unit test
- Tumu calon_app kullanicisi ile (RLS enforced)

---

## Kritik Kurallar

1. **tenantId SADECE JWT'den alinir** — body/query'den ASLA (IDOR korumasi)
2. **findUnique otomatik filtre DISINDA** — servis katmaninda `findFirst({ where: { id, tenantId } })` kullan
3. **staff_working_hours / staff_services** — tenantId eklendi (P5-0), interceptor + RLS aktif
4. **@Public() endpoint'ler** — `runInContext(tenantId)` ile explicit context sagla
5. **Discovery endpoint'ler** — kasitli cross-tenant (marketplace), `runInContext` YOK
