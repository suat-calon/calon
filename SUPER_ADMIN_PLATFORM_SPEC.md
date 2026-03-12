# CALON SUPER ADMIN PLATFORM SPEC

> **Statü:** Tasarım referansı — Faz 5 V1 kapsamı
> **Son güncelleme:** 2026-03-12
> **Hedef kitle:** Platform sahibi, internal ops, support ekibi

---

## 1. PLATFORM PURPOSE

### Super Admin Paneli Nedir?

Super Admin, Calon **platform operatörlerine** ait dahili yönetim aracıdır. Tek bir arayüzden tüm tenant'ların sağlık durumunu, abonelik yaşam döngüsünü ve platform büyüme metriklerini takip etmeye ve kontrol etmeye yarar.

### Ne İçin Vardır?

| Hedef | Açıklama |
|---|---|
| **Operasyonel görünürlük** | Hangi tenant aktif, hangisi askıda, hangisi ödeme geciktiriyor? |
| **Abonelik müdahalesi** | Plan değiştirme, askıya alma, yeniden aktifleştirme — hepsini tek noktadan |
| **Destek süreçleri** | Tenant başına dahili not, geçmiş olaylar ve risk işaretleri |
| **Platform sağlığı** | Toplam aktif salon sayısı, aylık gelir, büyüme trendleri |
| **Erken uyarı** | Ödeme gecikmeleri, yüksek hata oranları, kota aşımları otomatik flaglenir |

### Salon Panelinden Farkı Nedir?

| Boyut | Salon Paneli (`app.calon.io`) | Super Admin (`admin.calon.io`) |
|---|---|---|
| **Kullanıcı** | Salon sahibi / çalışan | Platform operatörü |
| **Veri kapsamı** | Yalnızca kendi tenant'ı | Tüm tenant'lar |
| **Amaç** | Günlük iş operasyonu | Platform yönetimi ve müdahale |
| **Müşteri verisi** | Tam erişim (kendi müşterileri) | Yapısal meta — müşteri PII görülmez |
| **Kimlik doğrulama** | Tenant JWT | Ayrı Super Admin kimlik bilgisi (MFA zorunlu) |

---

## 2. PRIMARY USERS

### Suat / Platform Owner

- Tam yetki — tüm modülleri okuyabilir ve yönetebilir
- Faturalandırma müdahalesi, plan geçişleri, kriz senaryolarında doğrudan aksiyon
- Platform büyüme metriklerini ve gelir durumunu izler

### Internal Ops / Admin

- Abonelik yönetimi: plan atama, askıya alma, yeniden aktifleştirme
- Billing cron'ları manuel tetikleme
- Support note oluşturma, risk flag kapatma
- Müşteri PII'ye erişimi **yoktur**

### Support / Admin Staff

- **Salt okunur** tenant detay görünümü
- Dahili not ekleme yetkisi (okuma + yazma)
- Abonelik durumunu **görüntüler**, değiştiremez
- Risk flag'leri okur, kapatmaz

---

## 3. CORE MODULES

---

### 3.1 Overview Dashboard

**Amaç:** Platform durumunu tek bakışta vermek. Günlük operasyonun başlangıç ekranı.

**Görüntülenebilir:**
- Toplam kayıtlı tenant sayısı
- Aktif / Trial / Past Due / Suspended / Cancelled breakdown (pasta/bar grafik)
- Bugün yeni kayıt olanlar
- Son 30 günde ödeme alan tenant sayısı
- Platform toplam MRR (yönetim kararları için referans — finansal araç değil)
- Son 24 saatte tetiklenen alert sayısı

**Değiştirilebilir:**
- Tarih aralığı filtresi (son 7 / 30 / 90 gün)

---

### 3.2 Tenant Management

**Amaç:** Tüm tenant'ları listelemek, filtrelemek ve yönetmek.

**Görüntülenebilir:**
- Tenant listesi (isim, slug, plan, durum, kayıt tarihi, son ödeme)
- Durum filtreleri: ACTIVE | TRIAL | PAST_DUE | SUSPENDED | CANCELED
- Plan filtreleri: SOLO | PRO | TEAM | ENTERPRISE
- Arama: isim, slug, e-posta

**Değiştirilebilir:**
- Tenant seçilerek detay sayfasına geçiş
- Toplu export (CSV — yalnızca yapısal meta, PII yok)

---

### 3.3 Subscription & Billing Control

**Amaç:** Abonelik yaşam döngüsüne müdahale. Ödeme sorunlarını çözmek, planları güncellemek.

**Görüntülenebilir:**
- Mevcut plan ve döngü (MONTHLY / YEARLY)
- Billing status + `graceUntil` / `trialEndsAt` tarihleri
- Son ödeme tarihi ve tutarı
- Açık BillingAttempt kayıtları (PENDING / FAILED)
- Son 10 BillingPeriod geçmişi
- Outbox'ta bekleyen abonelik event'leri

**Değiştirilebilir:**
- Plan değiştirme (SOLO ↔ PRO ↔ TEAM ↔ ENTERPRISE)
- Billing döngüsü değiştirme (MONTHLY ↔ YEARLY)
- Aboneliği manuel olarak ACTIVE'e geçirme
- Tenant'ı PAST_DUE'ya işaretleme
- Tenant'ı SUSPENDED'a alma
- Billing cron'u seçili tenant için manuel tetikleme
- Trial süresini uzatma (gün bazında)

---

### 3.4 Support / Internal Notes

**Amaç:** Tenant başına dahili iletişim geçmişi ve operasyonel hafıza oluşturmak.

**Görüntülenebilir:**
- Tenant'a ait tüm dahili notlar (tarih, yazar, içerik)
- Not kategorisi: BILLING | TECHNICAL | ONBOARDING | ESCALATION | OTHER

**Değiştirilebilir:**
- Yeni not ekleme (kategori + serbest metin)
- Not düzenleme (yalnızca kendi yazdığı — support staff)
- Not silme: **yasak** (audit trail korunur)

---

### 3.5 Alerts & Risk Flags

**Amaç:** Platformun risk noktalarını proaktif olarak görmek ve yanıtlamak.

**Görüntülenebilir:**
- Otomatik flaglenen durumlar:
  - `PAST_DUE` → grace period süresi
  - `SUSPENDED` → 7+ gündür çözümsüz
  - BillingAttempt FAILED → 3+ başarısız deneme
  - Outbox event stuck (24+ saat işlenmemiş)
  - Kota aşımı (sms / ai)
- Her flag için: tenant, flag tipi, oluşma tarihi, öneri aksiyon

**Değiştirilebilir:**
- Flag'i "resolved" olarak işaretleme (not zorunlu)
- Flag'den doğrudan Tenant Detail'e geçiş

---

### 3.6 Metrics & Growth Overview

**Amaç:** Platform büyümesini ve gelir eğilimini izlemek.

**Görüntülenebilir:**
- Haftalık / aylık yeni tenant sayısı (çizgi grafik)
- Plan dağılımı zaman serisi (SOLO / PRO / TEAM oranları)
- Churn: iptal edilen tenant sayısı (dönemsel)
- Trial → Paid dönüşüm oranı
- Abonelik başarı / başarısızlık oranı (BillingAttempt bazında)
- SMS ve AI kullanım toplamları (platform seviyesi)

**Değiştirilebilir:**
- Tarih aralığı filtresi

---

## 4. TENANT DETAIL VIEW

Bir tenant detay sayfası şu kartlardan / sekmelerden oluşur:

---

### Kart: Identity

| Alan | Açıklama |
|---|---|
| Tenant adı | İşletme adı |
| Slug | URL tanımlayıcı |
| Owner e-posta | Kayıt e-postası (maskelenmiş: `su***@calon.io`) |
| Oluşturma tarihi | `createdAt` |
| Tenant UUID | Kopyalanabilir |
| Tenant plan (rozet) | SOLO / PRO / TEAM / ENTERPRISE |

---

### Kart: Plan & Billing Status

| Alan | Açıklama |
|---|---|
| Billing durumu | TRIAL / ACTIVE / PAST_DUE / SUSPENDED / CANCELED (renkli rozet) |
| Mevcut plan | Plan adı + döngü |
| Trial bitiş | `trialEndsAt` (varsa) |
| Grace bitiş | `graceUntil` (varsa) |
| Dönem başlangıç / bitiş | `currentPeriodStart / End` |
| Son ödeme tarihi | `lastPaymentAt` |
| Provider abonelik ID | `providerSubscriptionId` |

---

### Kart: Payment State

| Alan | Açıklama |
|---|---|
| Açık girişimler | PENDING BillingAttempt listesi |
| Son 5 girişim | Tablo: tarih, tutar, durum, provider ID |
| Son başarısız neden | `failReason` |

---

### Sekme: Latest Activity

- Son 20 AuditLog kaydı (entityType, action, tarih, aktör)
- Filtreler: entityType (Appointment / Payment / Billing), tarih aralığı
- Randevu / ödeme sayıları görüntülenir; içerik/PII **görüntülenmez**

---

### Sekme: Support Notes

- Tenant'a ait tüm dahili notlar (bkz. Modül 3.4)
- Yeni not ekleme formu bu sekmede

---

### Sekme: Risk Flags

- Tenant'a ait açık / kapalı flag'ler
- Flag geçmişi (kim kapattı, ne zaman, hangi notla)

---

### Sekme: Usage

| Gösterge | Açıklama |
|---|---|
| Aktif dönem | `periodStart / periodEnd` |
| SMS kullanımı | `smsUsed / smsIncluded` (progress bar) |
| AI kullanımı | `aiUsed / aiIncluded` (progress bar) |
| Kota aşımı uyarısı | > %80 ise sarı, > %100 ise kırmızı |

---

## 5. ALLOWED ACTIONS

Aşağıdaki aksiyonların tamamı **AuditLog kaydı oluşturur** — geri alınamaz işlemler için "Onayla" modal'ı zorunludur.

| Aksiyon | Kimin Yapabileceği | Açıklama |
|---|---|---|
| **Tenant aktifleştir** | Owner, Ops | Status → ACTIVE, entitlements yenile |
| **Tenant askıya al** | Owner, Ops | Status → SUSPENDED |
| **Past Due işaretle** | Owner, Ops | Status → PAST_DUE |
| **Plan değiştir** | Owner, Ops | SOLO / PRO / TEAM / ENTERPRISE |
| **Döngü değiştir** | Owner, Ops | MONTHLY / YEARLY |
| **Trial uzat** | Owner, Ops | N gün ekle (`trialEndsAt` güncelle) |
| **Dahili not ekle** | Tümü | Kategori + serbest metin |
| **Entitlement cache temizle** | Owner, Ops | Redis cache invalidate |
| **Billing cron tetikle** | Owner, Ops | Seçili tenant için manuel çalıştır |
| **Risk flag kapat** | Owner, Ops | Not eklenmesi zorunlu |
| **Outbox event sorgula** | Owner, Ops | Stuck event listesi görüntüleme |

---

## 6. FORBIDDEN ACTIONS

Aşağıdaki aksiyonlar Super Admin panelinde **kesinlikle yapılamaz:**

### Tenant İş Verisi Doğrudan Düzenleme Yasağı
- Randevu oluşturma / düzenleme / silme
- Müşteri kaydı oluşturma veya güncelleme
- Fiyat / hizmet / personel yapılandırması değiştirme
- Herhangi bir Appointment, Customer, Service, Staff kaydına yazma

### Müşteri PII Görüntüleme Yasağı
- Tenant'ın müşteri listesini görüntüleme
- Bireysel müşteri iletişim bilgilerine (ad, telefon, e-posta) erişim
- Randevu içeriğini (notlar, özel istekler) okuma
- Ödeme kart bilgilerine herhangi bir erişim

### Audit'siz Destructive Action Yasağı
- AuditLog yazmadan status değişikliği yapma
- "Onayla" modal'ı atlanarak gerçekleştirilen aksiyon yok
- Bulk aksiyon: onay olmadan birden fazla tenant'ı aynı anda askıya alma yasak
- Outbox event'lerini doğrudan silme veya manipüle etme

### Sistem Güvenlik Sınırları
- Başka tenant hesabına giriş (impersonation) — V1 kapsamı dışı, özel güvenlik protokolü gerektirir
- Veritabanına doğrudan SQL çalıştırma
- Uygulama konfigürasyon dosyalarını değiştirme
- Kullanıcı şifrelerini görüntüleme veya sıfırlama (şifre sıfırlama e-postası gönderilebilir)

---

## 7. V1 IMPLEMENTATION SCOPE

### ✅ V1'de Olacaklar

| Özellik | Detay |
|---|---|
| Tenant listesi | Arama, durum/plan filtresi, sayfalama |
| Tenant detay sayfası | Identity, Plan/Billing, Payment State kartları |
| Subscription status yönetimi | Aktifleştir, askıya al, past due, plan değiştir |
| Temel support notları | Not ekleme ve listeleme (kategorisiz — serbest metin) |
| Top-level metrikler | Tenant sayısı breakdown, plan dağılımı |
| Alert listesi | PAST_DUE / SUSPENDED / stuck outbox flag'leri |
| Audit trail görüntüleme | Son 20 AuditLog, filtresiz |
| Entitlement cache invalidate | Tek tenant için düğme |

### ❌ V1'de Olmayacaklar

| Özellik | Gerekçe |
|---|---|
| Full impersonation | Güvenlik protokolü + MFA akışı ayrı faz gerektirir |
| Gelişmiş analytics & charting | BI entegrasyonu veya ayrı raporlama servisi gerektirir |
| Deep CRM inspection | Müşteri PII koruması gereği — kasıtlı kapsam dışı |
| Arbitrary DB admin araçları | Güvenlik riski — CLI / Prisma Studio ayrı ortamda |
| SMS / e-posta kuyruğu yönetimi | Mesajlaşma faz'ı bağımlı |
| Multi-operator rol yönetimi | V1 için owner + ops yeterli |
| Otomatik churn tahmin / ML | Veri birikimi gerektirir |
| Webhook yeniden tetikleme | Outbox replay mekanizması ayrı faz |

---

## 8. SUCCESS CRITERIA

Super Admin paneli **"işe yarıyor"** sayılabilmesi için aşağıdaki soruların tamamı **2 dakika içinde** cevaplanabilir olmalıdır:

### Tenant Sağlığı
1. Şu an kaç tenant `PAST_DUE` durumunda ve en uzun süredir bekleyen hangisi?
2. Bu hafta kaç yeni tenant trial başlattı?
3. Bu tenant neden askıya alındı ve ne zaman aktif olacak?

### Abonelik & Gelir
4. Hangi plan en çok tercih ediliyor ve son 30 gündeki dağılım nedir?
5. Bu ay kaç BillingAttempt başarısız oldu ve hangi tenant'lar etkilendi?
6. Bu tenant'ın son başarılı ödemesi ne zamandı ve bir sonraki dönem ne zaman bitiyor?

### Operasyonel Müdahale
7. Bu tenant'ın planını hemen değiştirebilir miyim — ve değişiklik kaydedildi mi?
8. Askıda kalan bir outbox event var mı ve hangi tenant'ı etkiliyor?
9. Support ekibinden bu tenant hakkında önceki bir not var mı?

### Platform Güven
10. Bugün herhangi bir risk flag tetiklendi mi ve hangisi henüz çözülmedi?
