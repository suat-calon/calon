# SALON ONBOARDING SYSTEM SPEC

> **Kapsam:** Yeni bir salonun hiçbir insan desteği olmadan platforma kayıt olup
> ilk rezervasyon linkini oluşturmasını sağlayan self-serve onboarding akışının
> teknik ve işlevsel tanımı.
>
> **Revizyon tarihi:** 2026-03-13
> **İlgili spec:** `SUPER_ADMIN_PLATFORM_SPEC.md`
> **Prensip:** En hızlı ilk rezervasyon. Her adım bu prensipten sapar mı diye test edilir.

---

## 1. ONBOARDING HEDEFİ

### Birincil Hedef

> **"Salon 5 dakika içinde ilk rezervasyon linkini alabilmeli."**

Bu hedef ölçülebilirdir:

- Ölçüm başlangıcı: kullanıcı signup formunu açtığı an (`onboardingStartedAt`)
- Ölçüm bitişi: booking linkin frontend'e teslim edildiği an (`bookingActivatedAt`)
- Kabul eşiği: `bookingActivatedAt - onboardingStartedAt ≤ 300 saniye`

---

### Kavram Sözlüğü

| Kavram                    | Tanım                                                                      |
|---------------------------|----------------------------------------------------------------------------|
| **Signup**                | E-posta + şifre (veya Google OAuth) ile hesap oluşturma. Bu noktada henüz tenant yoktur. |
| **Tenant Creation**       | Salon adı ve slug girildiğinde backend'de `Tenant` + `TenantBilling` kayıtlarının otomatik oluşturulması. Aynı anda 7 günlük TRIAL başlar. |
| **First Service**         | Salonun sunduğu en az 1 adet hizmetin (`Service`) sisteme eklenmesi. Başlangıç için yalnızca ad, süre ve fiyat zorunludur. |
| **First Staff**           | En az 1 personelin (`Staff`) sisteme eklenmesi ve bu personelin birinci hizmete atanması. |
| **Booking Link Activation** | Wizard'ın son adımı tamamlandığında üretilen `https://<slug>.calon.com.tr` veya `https://calon.com.tr/<slug>` adresinin aktif hale getirilmesi. Bu adres dışarıdan erişilebilir olur. |

---

### Milestone Zinciri

```
[Signup] ──► [Tenant Creation] ──► [First Service] ──► [First Staff] ──► [Booking Link Activation]
     │               │                    │                   │                    │
 Hesap oluşur    Tenant + Trial       1 hizmet            1 personel          Link canlı
                  başlar               eklendi             + atama             ve paylaşılabilir
```

---

## 2. WIZARD FLOW

Wizard 5 adımdan oluşur. Her adım bağımsız kaydedilir;
kullanıcı bir önceki adıma dönebilir ancak ileriye atlayamaz.

```
┌─────────────────────────────────────────────────────┐
│  1   2   3   4   5                                  │
│  ●───○───○───○───○   Adım 1 / 5                    │
└─────────────────────────────────────────────────────┘
```

---

### Step 1 — Salon Bilgileri

**Amaç:** Tenant kaydını oluşturmak.

| Alan            | Tip      | Zorunlu | Kural                                              |
|-----------------|----------|---------|----------------------------------------------------|
| `salonName`     | string   | ✓       | 2–80 karakter                                      |
| `slug`          | string   | ✓       | 3–30 karakter, yalnızca `[a-z0-9-]`, benzersiz    |
| `timezone`      | enum     | ✓       | IANA timezone (varsayılan: `Europe/Istanbul`)       |
| `currency`      | enum     | ✓       | `TRY` / `EUR` / `USD` (varsayılan: `TRY`)         |
| `phone`         | string   | ✗       | E.164 formatı önerilen                             |
| `brandColor`    | string   | ✗       | hex renk kodu (varsayılan: `#6366f1`)              |

**Backend aksiyonu:** `POST /onboarding/create-tenant`
**Sonuç:** `Tenant` + `TenantBilling(TRIAL)` oluşur; `wizardStep` → `2`.

**Slug çakışma:** Gerçek zamanlı benzersizlik kontrolü — kullanıcı yazarken debounced `GET /onboarding/check-slug?slug=` ile doğrulanır.

---

### Step 2 — Hizmet Ekleme

**Amaç:** En az 1 `Service` kaydı oluşturmak.

| Alan            | Tip      | Zorunlu | Kural                                       |
|-----------------|----------|---------|---------------------------------------------|
| `name`          | string   | ✓       | 2–80 karakter                               |
| `durationMin`   | int      | ✓       | 15–480 dakika, 15'in katları                |
| `price`         | decimal  | ✓       | ≥ 0 (ücretsiz hizmet desteklenir)           |
| `description`   | string   | ✗       | maks. 500 karakter                          |

**UI özelliği:** "Hızlı şablonlar" — sektör tipine göre önceden doldurulmuş hizmet önerileri (Saç Kesimi 30dk, Manikür 60dk, vb.). Şablonlar seçilince form otomatik dolar; kullanıcı düzenleyebilir.

**Backend aksiyonu:** `POST /onboarding/services`
**Sonuç:** `Service` kaydı oluşur; `wizardStep` → `3`.

**Kural:** Birden fazla hizmet eklenebilir ama en az 1 zorunludur. "Atla" butonu yoktur.

---

### Step 3 — Personel Ekleme

**Amaç:** En az 1 `Staff` kaydı oluşturmak ve hizmetle eşleştirmek.

| Alan            | Tip      | Zorunlu | Kural                                          |
|-----------------|----------|---------|------------------------------------------------|
| `fullName`      | string   | ✓       | 2–80 karakter                                  |
| `email`         | string   | ✗       | benzersiz, personele davet e-postası gönderilir|
| `phone`         | string   | ✗       | E.164 formatı                                  |
| `serviceIds`    | uuid[]   | ✓       | Adım 2'de eklenen hizmetlerden en az 1 seçim   |
| `colorCode`     | string   | ✗       | takvim rengi (hex), varsayılan sistem atar      |

**Backend aksiyonu:** `POST /onboarding/staff`
**Sonuç:** `Staff` + `StaffService` bağlantıları oluşur; `wizardStep` → `4`.

---

### Step 4 — Çalışma Saatleri

**Amaç:** Salonun haftalık çalışma planını (`WorkSchedule`) oluşturmak.

| Alan            | Tip      | Zorunlu | Kural                                             |
|-----------------|----------|---------|---------------------------------------------------|
| `weekdays`      | object[] | ✓       | 7 gün için açık/kapalı + başlangıç/bitiş saati    |
| `breakStart`    | time     | ✗       | öğle molası başlangıcı (opsiyonel)                |
| `breakEnd`      | time     | ✗       | öğle molası bitişi                                |

**UI özelliği:** Varsayılan şablon Pzt–Cmt 09:00–19:00 olarak gelir; kullanıcı tek geçişle değiştirir.

**Atlanabilir mi?** Evet — bu adım atlanabilir. Varsayılan çalışma takvimi otomatik uygulanır:
`Pzt–Cmt 09:00–19:00`, Pazar kapalı.

**Backend aksiyonu:** `PATCH /onboarding/schedule` *(mevcut varsayılan üzerine yazar)*
**Sonuç:** `WorkSchedule` güncellenir; `wizardStep` → `5`.

---

### Step 5 — Booking Link Oluşturma

**Amaç:** Onboarding'i tamamlamak ve rezervasyon linkini aktive etmek.

**Bu adımda kullanıcı görür:**

```
┌────────────────────────────────────────────────────┐
│  🎉 Salon hazır!                                   │
│                                                    │
│  Rezervasyon linkiniz:                             │
│  https://calon.com.tr/guzellik-salonu-a            │
│                                                    │
│  [ Linki Kopyala ]  [ WhatsApp'ta Paylaş ]         │
│                                                    │
│  Sonraki adımlar (opsiyonel):                      │
│  • Logo yükle                                      │
│  • Personel davet et                               │
│  • Ödeme yöntemini bağla                           │
└────────────────────────────────────────────────────┘
```

**Backend aksiyonu:** `POST /onboarding/activate-booking`
**Sonuç:** `Tenant.onboardingStatus` → `COMPLETED`; `bookingActivatedAt` kaydedilir.
Sistem bu andan itibaren dışarıdan gelen rezervasyon isteklerini kabul eder.

---

## 3. API ENDPOINTLERİ

Tüm onboarding endpointleri JWT korumalıdır. Token signup/login'den alınır ve
wizard boyunca `Authorization: Bearer <token>` header'ıyla taşınır.

---

### `POST /onboarding/signup`

Yeni kullanıcı hesabı oluşturur. Tenant bu adımda **oluşmaz**.

**Request:**

```jsonc
{
  "email":    "owner@salon.com",
  "password": "min8karakter",     // bcrypt hash'lenir
  "fullName": "Ayşe Kaya"
}
```

**Response — 201:**

```jsonc
{
  "success": true,
  "data": {
    "userId":      "uuid",
    "email":       "owner@salon.com",
    "accessToken": "eyJhbGciOiJIUzI1NiIsInR...",
    "wizardStep":  1,
    "onboardingStatus": "PENDING"
  }
}
```

**Hata durumları:**

| HTTP | Durum                         |
|------|-------------------------------|
| 409  | E-posta zaten kayıtlı         |
| 400  | Şifre min. 8 karakter değil   |
| 400  | E-posta formatı geçersiz      |

---

### `POST /onboarding/create-tenant`

Salon bilgilerini kaydeder ve Tenant + TenantBilling oluşturur.

**Request:**

```jsonc
{
  "salonName":  "Güzellik Salonu A",
  "slug":       "guzellik-salonu-a",
  "timezone":   "Europe/Istanbul",
  "currency":   "TRY",
  "phone":      "+905321234567",    // opsiyonel
  "brandColor": "#6366f1"          // opsiyonel
}
```

**Response — 201:**

```jsonc
{
  "success": true,
  "data": {
    "tenantId":    "uuid",
    "slug":        "guzellik-salonu-a",
    "bookingUrl":  "https://calon.com.tr/guzellik-salonu-a",
    "trialEndsAt": "2026-03-20T00:00:00.000Z",
    "wizardStep":  2,
    "onboardingStatus": "IN_PROGRESS"
  }
}
```

**Hata durumları:**

| HTTP | Durum                                      |
|------|--------------------------------------------|
| 409  | Slug zaten alınmış                         |
| 400  | Slug geçersiz karakter içeriyor            |
| 403  | Bu kullanıcıya ait zaten bir tenant var    |

---

### `POST /onboarding/services`

Bir veya daha fazla hizmet ekler.

**Request:**

```jsonc
{
  "services": [
    {
      "name":        "Saç Kesimi",
      "durationMin": 30,
      "price":       250.00,
      "description": "Yıkama dahil"   // opsiyonel
    },
    {
      "name":        "Manikür",
      "durationMin": 60,
      "price":       180.00
    }
  ]
}
```

**Response — 201:**

```jsonc
{
  "success": true,
  "data": {
    "created": [
      { "id": "uuid-1", "name": "Saç Kesimi", "durationMin": 30, "price": 250.00 },
      { "id": "uuid-2", "name": "Manikür",    "durationMin": 60, "price": 180.00 }
    ],
    "wizardStep": 3,
    "onboardingStatus": "IN_PROGRESS"
  }
}
```

**Hata durumları:**

| HTTP | Durum                                        |
|------|----------------------------------------------|
| 400  | `services` dizisi boş                        |
| 400  | `durationMin` 15'in katı değil               |
| 400  | `price` negatif                              |
| 422  | Wizard henüz 2. adımda değil (tenant yok)   |

---

### `POST /onboarding/staff`

Bir veya daha fazla personel ekler ve hizmetlere atar.

**Request:**

```jsonc
{
  "staff": [
    {
      "fullName":   "Mehmet Yıldız",
      "email":      "mehmet@salon.com",   // opsiyonel
      "phone":      "+905331234567",      // opsiyonel
      "serviceIds": ["uuid-1", "uuid-2"],
      "colorCode":  "#f59e0b"             // opsiyonel
    }
  ]
}
```

**Response — 201:**

```jsonc
{
  "success": true,
  "data": {
    "created": [
      {
        "id":         "uuid-staff-1",
        "fullName":   "Mehmet Yıldız",
        "serviceIds": ["uuid-1", "uuid-2"]
      }
    ],
    "wizardStep": 4,
    "onboardingStatus": "IN_PROGRESS"
  }
}
```

**Hata durumları:**

| HTTP | Durum                                              |
|------|----------------------------------------------------|
| 400  | `staff` dizisi boş                                 |
| 404  | `serviceIds` içinde bu tenant'a ait olmayan ID var |
| 422  | Wizard henüz 3. adımda değil                       |

---

### `POST /onboarding/activate-booking`

Onboarding'i tamamlar ve booking linkini aktive eder.

**Request:** *(gövde yok)*

**Response — 200:**

```jsonc
{
  "success": true,
  "data": {
    "tenantId":           "uuid",
    "bookingUrl":         "https://calon.com.tr/guzellik-salonu-a",
    "bookingActivatedAt": "2026-03-13T10:04:47.000Z",
    "wizardStep":         5,
    "onboardingStatus":   "COMPLETED"
  }
}
```

**Hata durumları:**

| HTTP | Durum                                               |
|------|-----------------------------------------------------|
| 422  | En az 1 hizmet eklenmemiş                           |
| 422  | En az 1 personel eklenmemiş                         |
| 422  | Personel hiçbir hizmete atanmamış                   |
| 409  | Booking zaten aktive edilmiş (`COMPLETED`)          |

---

### Yardımcı Endpoint

```
GET /onboarding/check-slug?slug=<değer>
```

Slug benzersizliğini gerçek zamanlı kontrol eder. Auth gerektirmez.

**Response — 200:**

```jsonc
{ "available": true }
// veya
{ "available": false, "suggestion": "guzellik-salonu-a-2" }
```

---

## 4. VERİ MODELİ

### Wizard State — `Tenant` Modeli Uzantısı

Wizard ilerleme durumu `Tenant` kaydında tutulur. Ayrı bir tablo açılmaz;
onboarding verileri zaten ilgili tablolara yazıldığından gerçek kaynak orada olur.

```prisma
model Tenant {
  // … mevcut alanlar …

  // Onboarding
  onboardingStatus   OnboardingStatus  @default(PENDING)
  wizardStep         Int               @default(1)   // 1–5
  onboardingStartedAt DateTime?
  bookingActivatedAt  DateTime?
}

enum OnboardingStatus {
  PENDING      // Signup tamamlandı, tenant oluşmadı (teorik: user kaydı var)
  IN_PROGRESS  // Tenant oluştu, wizard devam ediyor
  COMPLETED    // Booking link aktive edildi
  ABANDONED    // 7 gün sonra cron tarafından işaretlenir
}
```

### Durum Geçiş Diyagramı

```
          signup
PENDING ─────────────► IN_PROGRESS
                             │
                activate-booking
                             │
                             ▼
                         COMPLETED

IN_PROGRESS ──(7 gün sessizlik)──► ABANDONED
```

### `wizardStep` Semantiği

| Değer | Anlam                                                     |
|-------|-----------------------------------------------------------|
| `1`   | Salon bilgileri bekleniyor (`create-tenant` çağrılmadı)   |
| `2`   | Hizmet eklenmesi bekleniyor                               |
| `3`   | Personel eklenmesi bekleniyor                             |
| `4`   | Çalışma saatleri bekleniyor (atlanabilir)                 |
| `5`   | Aktivasyon bekleniyor / tamamlandı                        |

### Bütünlük Kuralları

- `wizardStep` yalnızca artar. Kullanıcı geriye döner ama `wizardStep` değeri düşmez.
- `onboardingStatus = COMPLETED` olduğunda `wizardStep` ve `bookingActivatedAt` immutable'dır.
- `ABANDONED` durumuna düşen tenant yeniden aktive edilemez; kullanıcı yeni bir tenant oluşturabilir.

---

## 5. SUCCESS CRITERIA

Onboarding başarıyla tamamlandı (`COMPLETED`) sayılabilmesi için tüm aşağıdaki
koşulların **aynı anda** sağlanması gerekir:

| # | Koşul                                                               | Doğrulama                                                     |
|---|---------------------------------------------------------------------|---------------------------------------------------------------|
| 1 | **En az 1 hizmet**                                                  | `Service.count({ where: { tenantId, isActive: true } }) >= 1` |
| 2 | **En az 1 personel**                                                | `Staff.count({ where: { tenantId, isActive: true } }) >= 1`   |
| 3 | **Personel en az 1 hizmete atanmış**                                | `StaffService.count({ where: { tenantId } }) >= 1`            |
| 4 | **Booking link aktive edildi**                                      | `Tenant.onboardingStatus === 'COMPLETED'`                     |
| 5 | **Tenant TRIAL veya daha iyi bir billing durumunda**                | `TenantBilling.status !== 'CANCELED'`                         |

`POST /onboarding/activate-booking` çağrısı yapılmadan önce backend bu 5 koşulu
doğrular; herhangi biri sağlanmıyorsa `422` döner ve hangi koşulun eksik olduğunu
belirtir.

### Başarı Metriği (Platform Geneli)

| Metrik                         | Hedef   |
|--------------------------------|---------|
| Tamamlanma süresi (p50)        | ≤ 5 dk  |
| Tamamlanma süresi (p95)        | ≤ 12 dk |
| Wizard tamamlama oranı         | ≥ 60 %  |
| Signup → Booking aktivasyon    | aynı oturum içinde |

---

## 6. FAILURE STATES

### 6.1 Wizard Terk Edilirse (Abandonment)

Kullanıcı wizard'ı yarıda bırakıp 7 gün boyunca geri dönmezse:

- `onboardingStatus` → `ABANDONED`
- Tenant `isDeleted = true` **yapılmaz** — veri korunur.
- Tenant kaydı Super Admin panelinde `ABANDONED` etiketiyle görünür.
- E-posta re-engagement akışı tetiklenir: 24 saat sonra `"Salonunuzu tamamlamayı unutmayın"` maili.

**Terk sonrası geri dönüş:** Kullanıcı tekrar giriş yaparsa `wizardStep` kaldığı adımdan devam eder. `ABANDONED` işareti, kullanıcı bir adımı tamamladığında otomatik `IN_PROGRESS`'e geri döner.

```
ABANDONED ──(kullanıcı wizard'a devam ederse)──► IN_PROGRESS
```

---

### 6.2 Incomplete Tenant

`onboardingStatus = IN_PROGRESS` veya `ABANDONED` durumundaki bir tenant için:

**Booking linki erişilebilir mi?**
Hayır. `https://calon.com.tr/<slug>` adresi `HTTP 404` döner veya
`"Bu salon henüz hazır değil"` sayfası gösterilir.

**Admin panelinde nasıl görünür?**

```
Tenant: Güzellik Salonu A
Durum:  IN_PROGRESS  ← sarı rozet
Adım:   3 / 5
Son aktivite: 2026-03-12 14:22
```

**Kritik yazma işlemleri:**
`TenantBilling.status = TRIAL` olduğundan kritik write'lar (randevu, ödeme) erişilebilir durumdadır. Booking linki henüz aktive olmadığından dışarıdan müşteri erişimi yoktur; yalnızca resepsiyon içi testler yapılabilir.

---

### 6.3 Slug Çakışması

Kullanıcı hedeflediği slug'ı kullanamıyorsa:

```jsonc
// HTTP 409
{
  "statusCode": 409,
  "message": "Bu slug zaten alınmış.",
  "suggestion": "guzellik-salonu-a-2"
}
```

Sistem, mevcut slug'a numara ekleyerek ilk uygun alternatifi önerir.

---

### 6.4 Trial Süresi Dolan Incomplete Tenant

7 günlük trial süresi dolduğunda wizard hâlâ tamamlanmamış olabilir:

- `TenantBilling.status` cron tarafından `PAST_DUE` yapılır.
- Kullanıcı wizard'a devam etmek isterse önce ödeme yöntemi eklemesi istenir.
- Bu durumda wizard → **Step 4.5: Ödeme Yöntemi** ara adımı enjekte edilir *(V2)*.
- **V1 kararı:** Trial süresi dolmuşsa kullanıcı ödeme sayfasına yönlendirilir; onboarding wizard'a dönüş için ödeme tamamlanmalıdır.

---

## 7. V1 SINIRLARI

Bu versiyonda aşağıdakiler **kesinlikle kapsam dışıdır**.
Her biri ayrı bir faz olarak planlanmış ve backlog'a alınmıştır.

| Özellik              | V1 Kararı                                                               | Planlanan Faz |
|----------------------|-------------------------------------------------------------------------|---------------|
| **Marketplace**      | Salon calon.com.tr keşif listesinde gösterilmez; yalnızca doğrudan link | Faz 10        |
| **Analytics**        | Dashboard, dönüşüm grafiği, rezervasyon istatistiği yok                 | Faz 8         |
| **Loyalty Programı** | Puan, rozet, kampanya sistemi yok                                        | Faz 11        |
| **Referral**         | "Arkadaşını davet et" mekanizması yok                                    | Faz 12        |
| **Ödeme Entegrasyonu** | Wizard içinde kart bağlama yok; ödeme ayrı akışta yapılır              | Faz 7         |
| **Çoklu Şube**       | Onboarding tek lokasyon oluşturur                                        | Faz 9         |
| **Çoklu Dil**        | Wizard yalnızca Türkçe                                                   | Faz 13        |
| **AI Asistan**       | Randevu botunun aktivasyonu onboarding'e dahil değil                     | Faz 15        |

### V1'in Tek Odağı

```
Signup → Tenant → Hizmet → Personel → Booking Link
```

Bu zincirin dışındaki her şey — ne kadar küçük olursa olsun — kapsam dışı
sayılır ve bir sonraki release'e atılır. Onboarding ekibi bu kuralı her özellik
tartışmasında referans alır.

---

### Tasarım İlkesi Özeti

| İlke                          | Uygulama                                                         |
|-------------------------------|------------------------------------------------------------------|
| **Minimum zorunlu alan**      | Her adımda yalnızca işin devam etmesi için gereken alan istenir  |
| **Akıllı varsayılanlar**      | Timezone, currency, çalışma saati, renk — kullanıcı değiştirmedikçe varsayılan uygulanır |
| **Kurtarılabilir terk**       | Her adım kaydedildiğinden yarıda bırakma veri kaybına yol açmaz |
| **Hız önceliği**              | Adım 4 (çalışma saatleri) atlanabilir — 5 dakika hedefini korumak için |
| **Sonraki adımı aç**          | Her adım tamamlandığında sonraki adım kilidini açar; kullanıcı baskı altında ilerler |

---

*Bu belge onboarding akışı değiştiğinde veya yeni adım eklendiğinde güncellenmelidir.*
*Son güncelleme: 2026-03-13*
