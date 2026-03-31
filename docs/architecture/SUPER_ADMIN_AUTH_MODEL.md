# Super Admin Auth Model

> Calon super admin erişim ve yetkilendirme modeli.
> Son güncelleme: 2026-03-31

---

## 1. Auth Source of Truth

Super admin erişimi ana ürün auth akışıyla aynı temeli kullanır:

- **Login:** `POST /api/v1/auth/login` → HttpOnly cookie (calon_access + calon_refresh)
- **JWT payload:** `{ sub: userId, tenantId: null, role: 'SUPER_ADMIN' }`
- **Session:** Cookie tabanlı, `calon_access` HttpOnly cookie
- **Guard zinciri:** TenantGuard (JWT parse) → AdminGuard (role check)

Super admin kullanıcıları `tenantId` olmadan login olabilir — TenantGuard bunu `SUPER_ADMIN` rolü için tolere eder.

---

## 2. Role Modeli

| Role | Erişim |
|---|---|
| `SUPER_ADMIN` | Platform admin cockpit + tüm admin API'ler |
| `TENANT_OWNER` | Kendi salon paneli — admin erişim YOK |
| `MANAGER` / `RECEPTIONIST` / `STAFF` | Kendi salon paneli — admin erişim YOK |

Role, Prisma `UserRole` enum'unda tanımlıdır.
`UserTenant.role` alanından gelir ve JWT'ye bake edilir.

---

## 3. Route Protection

### Backend
- Tüm admin controller'lar `@UseGuards(AdminGuard)` ile korunur
- AdminGuard, `request.userRole === 'SUPER_ADMIN'` kontrolü yapar
- `@Public()` kaldırıldı — TenantGuard JWT parse'ını tetikler
- Unauthorized → 401, wrong role → 403

### Frontend
- `/admin/*` route grubu `useAuth()` hook ile kontrol edilir
- `auth.role !== 'SUPER_ADMIN'` → "Erişim Reddedildi" ekranı
- Login gerekiyorsa → login'e redirect
- sessionStorage admin key modeli **kaldırıldı**

---

## 4. Backend Guard Modeli

### AdminGuard (yeni — JWT role tabanlı)
```typescript
if (!request.userId) → 401 "Oturum bulunamadı"
if (request.userRole !== 'SUPER_ADMIN') → 403 "Yalnızca platform yöneticileri"
```

### Korunan controller'lar
- `AdminController` (`/admin/tenants/*`)
- `BillingAdminController` (`/admin/billing/*`)
- `GrowthMetricsAdminController` (`/admin/dashboard/*`)

---

## 5. Neden API-Key Modelinden Çıkıldı

Eski model (`x-admin-api-key` header):
- Browser tarafında `sessionStorage`'da key saklanıyordu — XSS riski
- Ayrı auth dünyası — ana ürün auth'undan kopuk
- ADMIN_API_KEY env'i her ortamda tanımlı olmak zorundaydı
- Key rotate için env güncellemesi + redeploy gerekiyordu
- Key'i bilen herkes admin erişimi alabiliyordu — kullanıcı kimliği yok

Yeni model:
- Gerçek kullanıcı kimliği + JWT session
- Cookie tabanlı — XSS'e karşı güvenli
- Ana ürün auth altyapısıyla aynı
- Audit log'da gerçek userId görünür
- Role-based granüler kontrol mümkün

---

## 6. Kaldırılan Legacy Parçalar

| Parça | Durum |
|---|---|
| `sessionStorage.calon_admin_key` | **Kaldırıldı** — frontend gate'de kullanılmıyor |
| `x-admin-api-key` header interceptor | **Kaldırıldı** — admin client artık apiClient (cookie auth) |
| `ADMIN_API_KEY` env dependency | **Devre dışı** — AdminGuard artık bunu okumuyor |
| Fake key input login gate | **Kaldırıldı** — useAuth() + role check ile değiştirildi |

---

## 7. SUPER_ADMIN Kullanıcı Oluşturma

Şu an SUPER_ADMIN kullanıcı doğrudan DB'den oluşturulur:

```sql
-- UserTenant'ta role SUPER_ADMIN olarak ayarla
UPDATE "UserTenant"
SET role = 'SUPER_ADMIN'
WHERE "userId" = '<user-id>';
```

Gelecek fazda: onboarding/admin panel üzerinden SUPER_ADMIN atama.
