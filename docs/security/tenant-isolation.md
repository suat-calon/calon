# Tenant İzolasyonu — Güvenlik Dokümanı

**Proje:** Calon OS  
**Faz:** P4 — Tenant İzolasyonu ve Auth Gerçeği  
**Durum:** Analiz tamamlandı, testler yazılacak  

---

## 1. Mimari Özet

Calon çift katmanlı tenant izolasyonu kullanır:

**Katman 1 — Uygulama Katmanı (Prisma `$extends`)**  
21 model için otomatik `tenantId` filtresi. Her `findMany`, `findFirst`, `findUnique`, `create`, `update`, `delete` çağrısında tenant bağlamı otomatik enjekte edilir. Manuel filter eklemeyi unutmak mümkün değildir.

**Katman 2 — Veritabanı Katmanı (PostgreSQL RLS)**  
`set_config('app.tenant_id', ...)` ile session bazlı tenant context. Uygulama katmanı bypass edilse bile RLS devreye girer.

Bu iki katmanın aynı anda çalışması defense-in-depth sağlar.

---

## 2. Guard Yapısı

```
JwtAuthGuard       → JWT token doğrulama
TenantGuard        → Global guard — her authenticated endpoint'te çalışır
RolesGuard         → Rol tabanlı yetkilendirme
PermissionsGuard   → İzin tabanlı yetkilendirme
SubscriptionGuard  → Abonelik durumu kontrolü
SuperAdminGuard    → Süper admin endpoint koruması
```

`TenantGuard` global olarak tanımlı — yeni endpoint eklendiğinde otomatik devreye girer.

---

## 3. Public Endpoint Politikası

`@Public` dekoratörü ile işaretlenen endpoint'ler JWT gerektirmez. Bu endpoint'ler iki kategoriye ayrılır:

**A) Tenant-scoped public (güvenli):**
Tenant kimliği URL parametresi veya slug üzerinden resolve edilir. `runInContext(tenantId)` ile Prisma interceptor aktif kalır.

```
GET /public/salon/:slug
GET /public/services?tenantId=...
GET /public/staff?tenantId=...
GET /public/availability?tenantId=...
POST /public/book
POST /public/payments/create
```

**B) Cross-tenant public (kasıtlı):**
Webhook ve sistem endpoint'leri. Tenant bağlamı dışında çalışması tasarım gereğidir.

```
POST /webhooks/iyzico    → Payment provider callback
GET  /health             → Sistem sağlık kontrolü
```

---

## 4. Prisma Interceptor Mekanizması

```typescript
// Tüm sorgularda otomatik tenant filtresi
prisma.$extends({
  query: {
    $allModels: {
      async findMany({ args, query }) {
        args.where = { ...args.where, tenantId: currentTenantId() }
        return query(args)
      }
    }
  }
})
```

**Kapsanan modeller (21 adet):**
Tenant, User, StaffProfile, Service, Customer, Appointment, TenantBilling, UsagePeriod, Payment, BillingAttempt, EventOutbox, EventDelivery, NotificationTemplate, NotificationPreference, Message, ConsentForm, CustomerPhoto, RefreshToken, AuditLog, Referral, WebhookEvent

---

## 5. Bilinen Riskler

### Orta Risk — Telefon Lookup
Müşteri oluşturma sırasında telefon numarasına göre mevcut müşteri arama sorgusu tenantId filtresi taşımıyor olabilir. Middleware koruması devredeyse güvenli, ancak explicit filter eklenmesi önerilir.

```typescript
// Mevcut (riskli):
await prisma.customer.findFirst({ where: { phone } })

// Önerilen:
await prisma.customer.findFirst({ where: { phone, tenantId } })
```

### Düşük Risk — Super Admin Endpoint'leri
`/super-admin/*` endpoint'leri kasıtlı olarak cross-tenant erişime sahip. `SuperAdminGuard` ile korumalı. Bu endpoint'lere erişim audit log'a yazılmalı.

---

## 6. Test Gereksinimleri

Aşağıdaki testler yazılmalı ve CI'da çalıştırılmalı:

### 6.1 Cross-Tenant Data Leak Testi
```typescript
describe('Tenant İzolasyonu', () => {
  it('Tenant A kullanıcısı Tenant B müşterilerini göremez', async () => {
    // Tenant A token ile Tenant B müşteri listesi isteği
    // 200 OK ama boş liste beklenir — 403 değil
    const response = await request(app)
      .get('/customers')
      .set('Authorization', `Bearer ${tenantAToken}`)
    
    const ids = response.body.map(c => c.id)
    expect(ids).not.toContain(tenantBCustomerId)
  })

  it('Tenant A randevusu Tenant B token ile görüntülenemez', async () => {
    const response = await request(app)
      .get(`/appointments/${tenantAAppointmentId}`)
      .set('Authorization', `Bearer ${tenantBToken}`)
    
    expect(response.status).toBe(404) // 403 değil — varlığını ifşa etme
  })
})
```

### 6.2 Public Booking Tenant Scoping Testi
```typescript
it('Public booking sadece hedef tenant bağlamında çalışır', async () => {
  const response = await request(app)
    .get('/public/services')
    .query({ tenantId: tenantAId })
  
  const tenantIds = response.body.map(s => s.tenantId)
  expect(tenantIds.every(id => id === tenantAId)).toBe(true)
})
```

### 6.3 Telefon Lookup İzolasyon Testi
```typescript
it('Telefon lookup cross-tenant müşteri döndürmez', async () => {
  // Tenant B'de aynı telefon numarasıyla müşteri oluştur
  // Tenant A üzerinden booking yap — Tenant B müşterisi match etmemeli
})
```

---

## 7. Guardrail Önerisi

Tenant filter eksikliğini derleme zamanında yakalamak için ESLint kuralı:

```javascript
// .eslintrc'ye eklenecek kural
'no-restricted-syntax': [
  'warn',
  {
    selector: 'CallExpression[callee.property.name="findMany"]:not(:has([key.name="tenantId"]))',
    message: 'findMany çağrısında tenantId filter eksik olabilir. Prisma interceptor kontrol edin.'
  }
]
```

---

## 8. Kabul Kriterleri

Bu faz şu şartlar sağlanmadan tamamlanmış sayılmaz:

- [ ] Cross-tenant data leak testi yazıldı ve geçiyor
- [ ] Public booking tenant scoping testi yazıldı ve geçiyor
- [ ] Telefon lookup izolasyon testi yazıldı ve geçiyor
- [ ] Telefon lookup'ta explicit tenantId filtresi eklendi
- [ ] Tüm testler CI'da çalışıyor

---

## 9. Referanslar

- `apps/api/src/common/guards/` — Guard implementasyonları
- `packages/database/src/prisma.service.ts` — Prisma $extends interceptor
- `apps/api/src/public/` — Public endpoint'ler
- `apps/api/src/auth/` — JWT ve auth mekanizmaları

---

*Oluşturulma: P4 faz analizi sonrası*  
*Sorumlu: Suat Gökçe (Project Owner)*  
*Gözden geçirme: Her production deploy öncesi*
