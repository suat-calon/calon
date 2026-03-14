# Schema Gap Report — P4 Sonrasi Tespitler

**Tarih:** 2026-03-15
**Faz:** P4 → P5 gecisi oncesi
**Durum:** Aktif — P5 baslamadan once okunmali

---

## 1. [COZULDU] staff_working_hours / staff_services — tenantId Eksikligi

**Bulgu:**
`staff_working_hours` ve `staff_services` tablolarinda `tenantId` kolonu fiziksel olarak YOKTUR.

Ancak `prisma.service.ts` → `TENANT_SCOPED_MODELS` set'inde `staffworkinghour` ve `staffservice` tanimlidir.

**Etki:**
Prisma interceptor bu tablolara yapilan sorgularda `WHERE tenantId = ?` enjekte etmeye calisacaktir. Eger dogrudan (relation olmadan) sorgu atilirsa PostgreSQL `column "tenantId" does not exist` hatasi verir.

**Mimari Karar:**
Bu tablolarda izolasyon `staffId` FK uzerinden dolayli saglanmaktadir:

```
staff_working_hours.staffId → staff_profiles.id
staff_services.staffId      → staff_profiles.id
staff_profiles.tenantId     → RLS + interceptor korumali
```

**P5 Icin Kural:**
Bu tablolara sorgu atarken DAIMA `staff_profiles` uzerinden relation ile gidilecektir. Dogrudan `findMany`/`findFirst` YASAKTIR.

**Cozum Secenekleri (P5 veya sonrasi):**

| Secenek | Aciklama | Avantaj | Dezavantaj |
|---------|----------|---------|------------|
| A | Bu iki tabloya tenantId kolonu ekle (migration) + RLS policy yaz | Tam izolasyon | Migration gerekli |
| B | TENANT_SCOPED_MODELS'den cikar — interceptor filtre enjekte etmesin | Interceptor hatasi yok | Dolayli izolasyona guven |
| C | Mevcut hali koru — relation zorunlulugu dokumante et | Degisiklik yok | Dogrudan sorgu riski |

**Tercih edilen:** Secenek A (P5 baslangicinda)

**COZUM (2026-03-15):** Secenek A uygulandiI. Migration `20260314235018_p5_0_schema_gap_fix` ile tenantId eklendi, backfill yapildi, RLS aktif edildi. 23 → 25 policy.

---

## 2. RLS Durum Ozeti

| Metrik | Deger |
|--------|-------|
| RLS aktif tablo | 25 |
| FORCE ROW LEVEL SECURITY | 25 (tumu) |
| Policy pattern | `tenant_isolation_*` |
| Policy target role | `calon_app` |
| Cast yonu | `current_setting()::uuid` |
| RLS'siz tenant-scoped tablo | 0 |
| TENANT_SCOPED_MODELS sayisi | 25 (`prisma.service.ts`) |

---

## 3. findUnique Istisnasi

Prisma interceptor `findUnique` operasyonlarina tenantId filtresi ENJEKTE ETMEZ. Bu tasarim kararidir (`prisma.service.ts` satir 18).

**Sebep:** Unique where clause'a ek alan eklenemez (Prisma kisitlamasi).

**Kural:** Servis katmaninda `findUnique` yerine `findFirst({ where: { id, tenantId } })` kullanilmalidir.

**Ornek:** `customer.service.ts` satir 114 — dogru uygulama:
```typescript
const customer = await this.prisma.customer.findFirst({
  where: { id, tenantId }
});
```

---

## 4. Telefon Lookup Duzeltmesi

**Dosya:** `apps/api/src/modules/public/public.service.ts` satir 397

**Oncesi (riskli):**
```typescript
await this.prisma.customer.findFirst({ where: { phone: dto.phone } })
```

**Sonrasi (guvenli):**
```typescript
await this.prisma.customer.findFirst({ where: { phone: dto.phone, tenantId: dto.tenantId } })
```

Belt-and-suspenders: Prisma interceptor zaten tenantId enjekte ediyordu, ancak explicit filtre interceptor bypass durumunda da koruma saglar.
