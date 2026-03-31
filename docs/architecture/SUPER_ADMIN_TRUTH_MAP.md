# Super Admin Truth Map

> Source of truth for super admin / platform admin backend surface.
> Son güncelleme: 2026-03-31

---

## 1. Admin Auth Truth

| Madde | Gerçek |
|---|---|
| Guard | `AdminGuard` — `x-admin-api-key` header doğrulaması |
| Model | API key based, JWT değil. `ADMIN_API_KEY` env var |
| Fail behavior | Fail-closed: env yoksa tüm erişim reddedilir |
| Dosya | `apps/api/src/modules/admin/admin.guard.ts` |

Frontend tüketim:
- Her admin API çağrısında `x-admin-api-key` header gönderilmeli
- Key frontend'de env/config üzerinden sağlanmalı
- Salon sahibi JWT'si ile admin API'ye erişim mümkün değil

---

## 2. Tenant Visibility Truth

### Read-only endpoints

| Route | Method | Amacı |
|---|---|---|
| `GET /admin/tenants/overview` | GET | Platform özeti: toplam tenant, aktif, yeni, MRR |
| `GET /admin/tenants` | GET | Tenant listesi (filtrelenebilir) |
| `GET /admin/tenants/:tenantId` | GET | Tenant detayı |

### Mutating endpoints (S1'de YASAK)

| Route | Method | Amacı |
|---|---|---|
| `POST /admin/tenants/:tenantId/suspend` | POST | Tenant askıya al |
| `POST /admin/tenants/:tenantId/activate` | POST | Tenant aktifleştir |
| `POST /admin/tenants/:tenantId/plan` | POST | Plan değiştir |

---

## 3. Billing/Finance Visibility Truth

### Read-only endpoints

| Route | Method | Amacı |
|---|---|---|
| `GET /admin/billing/tenants` | GET | Billing tenant listesi |
| `GET /admin/billing/tenants/:id` | GET | Billing tenant detayı |
| `GET /admin/billing/metrics` | GET | Billing metrikleri |

### Mutating endpoints (S1'de YASAK)

| Route | Method | Amacı |
|---|---|---|
| `POST /admin/billing/tenants/:id/activate` | POST | Billing aktifleştir |
| `POST /admin/billing/tenants/:id/suspend` | POST | Billing askıya al |
| `POST /admin/billing/tenants/:id/set-plan` | POST | Plan override |
| `POST /admin/billing/tenants/:id/mark-past-due` | POST | Gecikmiş işaretle |
| `POST /admin/billing/cron/run-now` | POST | Manuel cron tetikle |
| `POST /admin/billing/tenants/:id/invalidate-cache` | POST | Cache temizle |

---

## 4. Platform Health / Queue / Worker Truth

### Read-only endpoints

| Route | Method | Amacı |
|---|---|---|
| `GET /health` | GET | API sağlık kontrolü |
| `GET /health/ready` | GET | DB + Redis readiness |
| `GET /health/version` | GET | Version / commit / nodeVersion |
| `GET /metrics` | GET | Prometheus metrikleri (queue, worker, lock) |
| `GET /admin/dashboard/metrics` | GET | Platform growth metrikleri |

Queue/worker gözlem:
- Prometheus `/metrics` endpoint'i queue_jobs_active, redis_lock_failures, archive_worker_batches sayaçlarını expose ediyor
- BackpressureService.getQueueStats() internal — doğrudan HTTP endpoint yok
- Worker loglari Docker logs ile erişilebilir

---

## 5. Growth / Metrics Truth

`GET /admin/dashboard/metrics` şu verileri döndürür:
- totalSalons (toplam tenant)
- activeSalons (aktif tenant)
- newSalonsThisMonth (bu ayki yeni)
- bookingsToday (bugünkü randevu)
- activeBillings (ödeme yapan)
- planDistribution (plan dağılımı)
- monthlyRecurringRevenue (tahmini MRR)

Bu veriler gerçek DB sorgularına dayanır — mock değil.

---

## 6. Do Not Rebuild

Aşağıdakiler zaten inşa edilmiş:
- AdminGuard (x-admin-api-key)
- AdminController (6 endpoint)
- BillingAdminController (10 endpoint)
- GrowthMetricsAdminController (1 endpoint)
- PrometheusController (1 endpoint)
- HealthController (3 endpoint)
- AdminService (listTenants, getTenantDetail, getOverview, suspend, activate, setPlan, audit)

Hiçbiri tekrar kurulmayacak.

---

## 7. S1 Scope Contract

### S1'de açılacak (READ-ONLY)

| Yüzey | Endpoint | Notlar |
|---|---|---|
| Overview | `GET /admin/tenants/overview` + `GET /admin/dashboard/metrics` | Platform özeti |
| Tenants list | `GET /admin/tenants` | Filtrelenebilir liste |
| Tenant detail | `GET /admin/tenants/:tenantId` | Read-only profil |
| Billing overview | `GET /admin/billing/tenants` + `GET /admin/billing/metrics` | Read-only görünüm |
| Billing detail | `GET /admin/billing/tenants/:id` | Read-only detay |
| Ops / Health | `GET /health` + `GET /health/ready` + `GET /health/version` | Platform sağlık |
| Metrics | `GET /metrics` | Prometheus ham metrikleri |

### S1'de YASAK

- suspend / activate / set-plan / mark-past-due
- cron/run-now
- cache/invalidate
- herhangi bir POST/PATCH/DELETE admin aksiyonu
