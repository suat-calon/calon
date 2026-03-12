# CALON SUPER ADMIN IA AND API CONTRACT

> **Kapsam:** Bu belge Super Admin panelinin ekran mimarisini (IA), route ağacını
> ve backend API response contract'larını tanımlar. Frontend geliştirici ile
> backend geliştirici arasındaki tek doğru kaynak olarak kullanılır.
>
> **Revizyon tarihi:** 2026-03-12
> **İlgili spec:** `SUPER_ADMIN_PLATFORM_SPEC.md`
> **Auth:** Tüm endpointler `x-admin-api-key` header'ı gerektirir.

---

## 1. ROUTE TREE

```
/admin
 ├── /overview            ← Platform sağlık gösterge paneli
 ├── /tenants             ← Tenant listesi (tablo, filtre, arama)
 │    └── /:tenantId      ← Tek tenant detay sayfası (sekmeli)
 ├── /billing             ← Ödeme girişimleri ve anlaşmazlık yönetimi
 ├── /support             ← Destek notları ve impersonation log'ları
 └── /alerts              ← Aktif uyarılar, past-due sayacı, anomali bildirimleri
```

---

### 1.1 `/admin/overview`

| Alan            | Değer                                                         |
|-----------------|---------------------------------------------------------------|
| **Purpose**     | Platform geneli anlık sağlık durumunu tek bakışta vermek      |
| **Primary Widgets** | Tenant sayaçları, MRR tahmini, başarısız ödeme alarmı, günlük randevu bandı |
| **Data Source** | `GET /api/v1/admin/overview`                                  |

---

### 1.2 `/admin/tenants`

| Alan            | Değer                                                         |
|-----------------|---------------------------------------------------------------|
| **Purpose**     | Tüm tenant'ları listelemek, aramak, plan/durum bazlı filtrelemek |
| **Primary Widgets** | Sayfalanmış tablo, durum etiketleri, aksiyon hızlı erişim  |
| **Data Source** | `GET /api/v1/admin/tenants?page=&limit=&status=&plan=`       |

---

### 1.3 `/admin/tenants/:tenantId`

| Alan            | Değer                                                         |
|-----------------|---------------------------------------------------------------|
| **Purpose**     | Tek tenant'ın kimlik, abonelik, ödeme ve aktivite verilerini incelemek; askıya al / aktifleştir / plan değiştir aksiyonlarını çalıştırmak |
| **Primary Widgets** | Identity kartı, Subscription kartı, Payment State kartı, sekmeler: Latest Activity · Support Notes · Risk Flags · Usage |
| **Data Source** | `GET /api/v1/admin/tenants/:tenantId`                         |

---

### 1.4 `/admin/billing`

| Alan            | Değer                                                         |
|-----------------|---------------------------------------------------------------|
| **Purpose**     | Tüm `BillingAttempt` kayıtlarını incelemek; PENDING / FAILED / SUCCEEDED filtresi |
| **Primary Widgets** | Girişim tablosu, durum rozeti, provider ödeme ID, tutar, zaman damgası |
| **Data Source** | `GET /api/v1/admin/billing-attempts` *(V2 endpointi — bu belgede contract dışı)* |

---

### 1.5 `/admin/support`

| Alan            | Değer                                                         |
|-----------------|---------------------------------------------------------------|
| **Purpose**     | Manuel destek notları eklemek ve impersonation tarihçesini görmek |
| **Primary Widgets** | Not zaman çizelgesi, impersonation log satırları             |
| **Data Source** | `GET /api/v1/admin/support/:tenantId` *(V2 — bu belgede contract dışı)* |

---

### 1.6 `/admin/alerts`

| Alan            | Değer                                                         |
|-----------------|---------------------------------------------------------------|
| **Purpose**     | Kritik durumları (past-due, suspended yığını, başarısız ödeme artışı) tek ekranda görmek |
| **Primary Widgets** | Uyarı listesi, şiddet rozeti, ilgili tenant linki            |
| **Data Source** | `GET /api/v1/admin/overview` (snapshot'tan türetilir) + client-side kural motoru |

---

## 2. OVERVIEW SCREEN CONTRACT

### Kartlar

| Kart                   | Kaynak Alan         | Gösterim            |
|------------------------|---------------------|---------------------|
| Total Tenants          | `totalTenants`      | Sayı                |
| Active Tenants         | `activeTenants`     | Sayı + yeşil rozet  |
| Trial Tenants          | `trialTenants`      | Sayı + mavi rozet   |
| Suspended Tenants      | `suspendedTenants`  | Sayı + kırmızı rozet|
| Estimated MRR          | `estimatedMRR`      | Kuruş → TL (÷100)  |
| Failed Attempts (24h)  | `failedAttemptCount`| Sayı + uyarı ikonu  |
| Bookings Today         | `bookingsToday`     | Sayı                |
| Open Attempts          | `openAttemptCount`  | Sayı                |

### Endpoint

```
GET /api/v1/admin/overview
Headers: x-admin-api-key: <key>
```

### Response Contract

```jsonc
// HTTP 200
{
  "success": true,
  "data": {
    "id":                  "uuid",
    "capturedAt":          "2026-03-12T10:05:00.000Z",  // snapshot zamanı
    "totalTenants":        142,
    "activeTenants":       98,
    "trialTenants":        27,
    "pastDueTenants":      4,
    "suspendedTenants":    8,
    "canceledTenants":     5,
    "newTenantsThisMonth": 11,
    "bookingsToday":       317,
    "estimatedMRR":        8920100,  // kuruş (÷100 = 89.201 TL)
    "openAttemptCount":    3,
    "failedAttemptCount":  6,        // son 24 saat
    "planBreakdown": {
      "SOLO":       73,
      "BOUTIQUE":   51,
      "ENTERPRISE": 18
    }
  }
}
```

---

## 3. TENANTS LIST SCREEN CONTRACT

### Tablo Kolonları

| Kolon           | Alan                           | Sıralanabilir |
|-----------------|--------------------------------|---------------|
| Tenant Adı      | `name`                         | ✓             |
| Slug            | `slug`                         |               |
| Plan            | `plan`                         | ✓             |
| Billing Durumu  | `billing.status`               | ✓             |
| Döngü           | `billing.cycle`                |               |
| Son Ödeme       | `billing.lastPaymentAt`        | ✓             |
| Trial Bitiş     | `billing.trialEndsAt`          |               |
| Kayıt Tarihi    | `createdAt`                    | ✓             |
| Aksiyonlar      | suspend · activate · plan      |               |

### Filtreler

| Filtre     | Query Param | Geçerli Değerler                                    |
|------------|-------------|-----------------------------------------------------|
| Durum      | `status`    | `TRIAL` `ACTIVE` `PAST_DUE` `SUSPENDED` `CANCELED` |
| Plan       | `plan`      | `SOLO` `BOUTIQUE` `ENTERPRISE`                      |
| Sayfa      | `page`      | pozitif tamsayı (varsayılan: `1`)                   |
| Limit      | `limit`     | `1`–`100` (varsayılan: `20`)                        |

### Arama

Serbest metin araması **V2**'de eklenir (`?q=`). V1'de yalnızca `status` + `plan` filtresi desteklenir.

### Endpoint

```
GET /api/v1/admin/tenants?page=1&limit=20&status=ACTIVE&plan=PRO
Headers: x-admin-api-key: <key>
```

### Response Contract

```jsonc
// HTTP 200
{
  "success": true,
  "data": {
    "items": [
      {
        "id":        "uuid",
        "name":      "Güzellik Salonu A",
        "slug":      "guzellik-salonu-a",
        "plan":      "BOUTIQUE",
        "createdAt": "2025-11-03T08:22:00.000Z",
        "billing": {
          "status":        "ACTIVE",
          "cycle":         "MONTHLY",
          "trialEndsAt":   "2025-11-10T08:22:00.000Z",
          "graceUntil":    "2026-04-06T00:00:00.000Z",
          "lastPaymentAt": "2026-03-01T14:30:00.000Z"
        }
      }
      // …
    ],
    "total":      142,
    "page":       1,
    "limit":      20,
    "totalPages": 8
  }
}
```

---

## 4. TENANT DETAIL SCREEN CONTRACT

### Sekmeli Düzen

```
[ Identity ] [ Subscription ] [ Payment State ]
────────────────────────────────────────────────
Sekmeler:
  [ Latest Activity ] [ Support Notes* ] [ Risk Flags* ] [ Usage ]

* V2 — V1'de placeholder sekme
```

### Kartlar — V1 Alanları

#### Identity Kartı

| Alan      | Kaynak        |
|-----------|---------------|
| id        | `identity.id` |
| Ad        | `identity.name`|
| Slug      | `identity.slug`|
| Plan      | `identity.plan`|
| Kayıt     | `identity.createdAt`|

#### Subscription Kartı

| Alan            | Kaynak                    |
|-----------------|---------------------------|
| Billing Durumu  | `billing.status`          |
| Plan            | `billing.plan`            |
| Döngü           | `billing.cycle`           |
| Trial Bitiş     | `billing.trialEndsAt`     |
| Dönem Başlangıcı| `billing.currentPeriodStart`|
| Dönem Bitişi    | `billing.currentPeriodEnd`|
| İptal Planı     | `billing.cancelAtPeriodEnd`|
| Son Ödeme       | `billing.lastPaymentAt`   |

#### Payment State Kartı

| Alan            | Kaynak                                        |
|-----------------|-----------------------------------------------|
| Son 5 Girişim   | `recentAttempts[*]` — plan, cycle, status, tutar, tarih |
| Açık Girişim    | `recentAttempts` içinde `status: "PENDING"`   |

#### Latest Activity Sekmesi

| Alan        | Kaynak                                  |
|-------------|-----------------------------------------|
| Son 10 Log  | `latestActivity[*]` — entityType, action, actorRole, tarih |

#### Usage Sekmesi

| Alan            | Kaynak                              |
|-----------------|-------------------------------------|
| Dönem           | `currentUsage.periodStart` / `periodEnd` |
| SMS Kota / Kullanım | `currentUsage.smsIncluded` / `smsUsed` |
| AI Kota / Kullanım  | `currentUsage.aiIncluded` / `aiUsed`   |

### Endpoint

```
GET /api/v1/admin/tenants/:tenantId
Headers: x-admin-api-key: <key>
```

### Response Contract

```jsonc
// HTTP 200
{
  "success": true,
  "data": {
    "identity": {
      "id":        "uuid",
      "name":      "Güzellik Salonu A",
      "slug":      "guzellik-salonu-a",
      "plan":      "BOUTIQUE",
      "createdAt": "2025-11-03T08:22:00.000Z"
    },
    "billing": {
      "tenantId":              "uuid",
      "plan":                  "BOUTIQUE",
      "cycle":                 "MONTHLY",
      "status":                "ACTIVE",
      "trialEndsAt":           "2025-11-10T08:22:00.000Z",
      "graceUntil":            "2026-04-06T00:00:00.000Z",
      "currentPeriodStart":    "2026-03-01T00:00:00.000Z",
      "currentPeriodEnd":      "2026-04-01T00:00:00.000Z",
      "cancelAtPeriodEnd":     false,
      "provider":              "IYZICO",
      "providerSubscriptionId": null,
      "lastPaymentAt":         "2026-03-01T14:30:00.000Z",
      "createdAt":             "2025-11-03T08:22:00.000Z",
      "updatedAt":             "2026-03-01T14:30:00.000Z"
    },
    "recentAttempts": [
      {
        "id":                "uuid",
        "plan":              "BOUTIQUE",
        "cycle":             "MONTHLY",
        "status":            "SUCCEEDED",
        "amountCents":       99900,
        "currency":          "TRY",
        "providerPaymentId": "iyzico-payment-id",
        "createdAt":         "2026-03-01T14:28:00.000Z"
      }
    ],
    "latestActivity": [
      {
        "id":         "uuid",
        "entityType": "Tenant",
        "entityId":   "uuid",
        "action":     "ADMIN_SUSPEND",
        "actorRole":  "SUPER_ADMIN",
        "createdAt":  "2026-02-15T09:12:00.000Z"
      }
    ],
    "currentUsage": {
      "periodStart":  "2026-03-01T00:00:00.000Z",
      "periodEnd":    "2026-04-01T00:00:00.000Z",
      "smsIncluded":  500,
      "smsUsed":      312,
      "aiIncluded":   200,
      "aiUsed":       45
    }
    // currentUsage: null → aktif dönem kaydı yoksa
  }
}
```

---

## 5. ACTION CONTRACTS

Tüm mutasyon endpointleri aşağıdaki header'ı gerektirir:

```
x-admin-api-key: <key>
Content-Type: application/json
```

---

### 5.1 Tenant'ı Askıya Al

```
POST /api/v1/admin/tenants/:tenantId/suspend
Body: (boş)
```

**Response — Başarılı:**

```jsonc
// HTTP 200
{
  "success": true,
  "data": {
    "tenantId": "uuid",
    "status":   "SUSPENDED"
  }
}
```

**Yan Etkiler:**

- `TenantBilling.status` → `SUSPENDED`
- `subscription.suspended` outbox event'i yazılır
- `AuditLog` kaydı: `action: "ADMIN_SUSPEND"`, `actorRole: "SUPER_ADMIN"`

---

### 5.2 Tenant'ı Aktifleştir

```
POST /api/v1/admin/tenants/:tenantId/activate
Body: { "cycle": "MONTHLY" | "YEARLY" }   // cycle opsiyonel, default: "MONTHLY"
```

**Response — Başarılı:**

```jsonc
// HTTP 200
{
  "success": true,
  "data": {
    "tenantId": "uuid",
    "status":   "ACTIVE",
    "cycle":    "MONTHLY"
  }
}
```

**Yan Etkiler:**

- `TenantBilling.status` → `ACTIVE`
- `AuditLog` kaydı: `action: "ADMIN_ACTIVATE"`, `actorRole: "SUPER_ADMIN"`

---

### 5.3 Plan Değiştir

```
POST /api/v1/admin/tenants/:tenantId/plan
Body: { "plan": "SOLO" | "BOUTIQUE" | "ENTERPRISE" }
```

**Response — Başarılı:**

```jsonc
// HTTP 200
{
  "success": true,
  "data": {
    "tenantId": "uuid",
    "plan":     "ENTERPRISE"
  }
}
```

**Yan Etkiler:**

- `TenantBilling.plan` + `Tenant.plan` güncellenir
- `AuditLog` kaydı: `action: "ADMIN_SET_PLAN"`, `actorRole: "SUPER_ADMIN"`, `before: { plan: "BOUTIQUE" }`, `after: { plan: "ENTERPRISE" }`

---

## 6. EMPTY / ERROR STATES

### 6.1 Overview — Snapshot Yok

Sunucu ilk başlatıldığında veya cron henüz çalışmamışken `platformMetricsSnapshot` tablosu boş olabilir. Bu durumda API şunu döner:

```jsonc
// HTTP 404
{
  "statusCode": 404,
  "message":    "Henüz bir metrik snapshot mevcut değil. İlk cron çalışması bekleniyor (maks. 5 dakika).",
  "error":      "Not Found"
}
```

**Frontend davranışı:** Ekran yüklenirken skeleton gösterilir; 404 gelirse `"Veriler hazırlanıyor, lütfen bekleyin…"` mesajıyla `retry` butonu sunulur. 30 saniyede bir otomatik polling yapılır.

---

### 6.2 Tenant Bulunamadı

```jsonc
// HTTP 404
{
  "statusCode": 404,
  "message":    "Tenant bulunamadı: <tenantId>",
  "error":      "Not Found"
}
```

Tetikleyen durumlar:

- `isDeleted: true` tenant'a erişim denemesi
- Geçersiz UUID (bu durumda `ParseUUIDPipe` daha önce `400` döner)

---

### 6.3 Yetkisiz Admin İsteği

```jsonc
// HTTP 401 — ADMIN_API_KEY sunucuda tanımlı değil (fail-closed)
{
  "statusCode": 401,
  "message":    "Admin API anahtarı sunucu tarafında yapılandırılmamış.",
  "error":      "Unauthorized"
}

// HTTP 401 — Yanlış veya eksik header
{
  "statusCode": 401,
  "message":    "Geçersiz veya eksik x-admin-api-key header'ı.",
  "error":      "Unauthorized"
}
```

**Frontend davranışı:** Giriş ekranına yönlendir. API anahtarı session storage'da tutulur; 401 alınırsa temizlenir.

---

### 6.4 Geçersiz UUID

```jsonc
// HTTP 400 — ParseUUIDPipe
{
  "statusCode": 400,
  "message":    "Validation failed (uuid is expected)",
  "error":      "Bad Request"
}
```

---

### 6.5 Geçersiz Enum Değeri (plan / cycle)

```jsonc
// HTTP 400 — class-validator @IsEnum
{
  "statusCode": 400,
  "message":    ["plan must be a valid enum value"],
  "error":      "Bad Request"
}
```

---

## 7. V1 UI RULES

Aşağıdaki kurallar bu paneli geliştiren tüm frontend ekibi için bağlayıcıdır. Bu kurallar, UX tartışması gerektirmeksizin uygulanır.

---

### 7.1 Dense Admin Layout

- Varsayılan satır yüksekliği: `40 px` (not: normal kullanıcı arayüzü `56 px`).
- Tablo satır padding'i en fazla `8px` dikey.
- Kart başlıkları `12 px` uppercase, `letter-spacing: 0.08em`.
- Sidebar daima görünür (collapse yok).
- Renk paleti: sistemin marka renginden bağımsız, nötr (slate/zinc), yalnızca durum rozetlerinde aksiyon renkleri.

---

### 7.2 No Decorative Analytics

- Grafik, sparkline, progress ring kullanılmaz.
- Karşılaştırma oranı (MRR büyüme %) V1'de gösterilmez.
- Tüm sayısal değerler salt metin olarak render edilir.
- İkonlar yalnızca durum bildirimi için: ⚠️ PAST_DUE, 🔴 SUSPENDED, ✅ ACTIVE.

---

### 7.3 Information First

- Her ekran için birincil soru şu şekilde test edilir: *"İhtiyacım olan bilgiye 2 tıklama veya daha azında ulaşabiliyor muyum?"*
- Tenant listesi varsayılan sırası: `createdAt DESC`.
- Tenant detay ekranı açıldığında **Identity** kartı ve **Latest Activity** sekmesi ön planda gelir; ek sekmeye geçiş kullanıcı tercihidir.
- Boş durum metinleri operasyonel bilgi verir: *"Bu tenant henüz ödeme denemesi yapmadı"* — belirsiz *"Veri yok"* ifadesi kullanılmaz.

---

### 7.4 Destructive Actions Always Confirmed

Aşağıdaki aksiyonlar onaysız çalıştırılamaz:

| Aksiyon              | Confirm İfadesi                                               |
|----------------------|---------------------------------------------------------------|
| **Suspend Tenant**   | `"<Tenant Adı> adlı tenant'ı askıya almak istediğinize emin misiniz? Tenant tüm kritik yazma işlemlerine erişimini kaybeder."` |
| **Plan Değiştir**    | `"<Tenant Adı> planını <ESKİ PLAN> → <YENİ PLAN> olarak değiştirmek istediğinize emin misiniz?"` |

Onay mekanizması: modal dialog — "İptal" ve "Onayla" butonları. Enter tuşu varsayılan olarak "İptal" tetikler.

Activate aksiyonu için onay gerekmez (geri dönülebilir ve yan etkisi düşük).

---

### 7.5 Audit-Sensitive Actions Highlighted

- `ADMIN_SUSPEND`, `ADMIN_SET_PLAN` aksiyonları çalıştırıldıktan sonra ekranda `"AuditLog kaydı oluşturuldu"` toast bildirimi gösterilir.
- Latest Activity sekmesinde `actorRole: "SUPER_ADMIN"` olan satırlar sarı arka planla vurgulanır.
- Tüm admin mutasyon butonları `data-audit="true"` attribute'uyla işaretlenir (test erişimi için).

---

*Bu belge API contract değiştiğinde veya yeni ekran eklediğinde güncellenmelidir.*
*Son güncelleme: 2026-03-12*
