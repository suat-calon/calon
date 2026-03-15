# Canonical Data Model — Calon OS

**Son guncelleme:** 2026-03-15 (P5-1 sonrasi)

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

## Defense-in-Depth Katmanlari

| Katman | Mekanizma | Konum |
|--------|-----------|-------|
| 1 | Prisma `$extends` interceptor | `prisma.service.ts` — uygulama seviyesi WHERE enjeksiyonu |
| 2 | PostgreSQL RLS | `set_config('app.tenant_id', ...)` — DB seviyesi |
| 3 | TenantGuard | `tenant.guard.ts` — JWT → AsyncLocalStorage |

**Akis:**
```
HTTP Request
  → TenantGuard (JWT dogrulama, tenantId cikarma)
    → tenantContext.run() (AsyncLocalStorage'a yazma)
      → Prisma interceptor (WHERE tenantId = ? enjeksiyonu)
        → $transaction([set_config, query]) (RLS aktivasyonu)
          → PostgreSQL RLS policy (DB seviyesi filtre)
```

---

## Kritik Kurallar

1. **tenantId SADECE JWT'den alinir** — body/query'den ASLA (IDOR korumasi)
2. **findUnique otomatik filtre DISINDA** — servis katmaninda `findFirst({ where: { id, tenantId } })` kullan
3. **staff_working_hours / staff_services** — tenantId eklendi (P5-0), interceptor + RLS aktif
4. **@Public() endpoint'ler** — `runInContext(tenantId)` ile explicit context sagla
5. **Discovery endpoint'ler** — kasitli cross-tenant (marketplace), `runInContext` YOK
