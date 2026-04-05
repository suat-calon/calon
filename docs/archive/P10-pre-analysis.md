# CALON REPO - İLK ANALİZ BULGULARI

**Tarih:** 2026-03-17  
**Analiz Durumu:** Kısmi (Claude Code ile derinleştirilecek)

---

## ✅ MEVCUT YAPITAŞLARI

### 1. WHITE-LABEL ALTYAPISI (KISMİ)

**Tenant Model (schema.prisma):**
```prisma
model Tenant {
  id         String       @id @default(uuid())
  name       String
  slug       String       @unique  // subdomain: slug.calon.com.tr
  plan       TenantPlan   
  status     TenantStatus 
  brandColor String?      // ✅ TEK RENK ALANI
  logoUrl    String?      // ✅ LOGO
  timezone   String       @default("Europe/Istanbul")
  locale     String       @default("tr-TR")
  currency   String       @default("TRY")
  ...
}
```

**DURUM:**
- ✅ `brandColor` (tek renk) var
- ✅ `logoUrl` var
- ✅ `slug` var (subdomain için)
- ❌ `primaryColor`, `secondaryColor`, `accentColor` YOK
- ❌ `customCSS` veya `themeOverride` YOK
- ❌ Location-level branding YOK

**EKSIKLER:**
1. Çoklu renk sistemi yok (primary/secondary/accent)
2. Frontend theme override sistemi yok
3. Tenant branding update endpoint'i YOK
4. Settings UI YOK

---

### 2. LANDING PAGE DURUMU

**apps/web (Salon Dashboard):**
- ❌ Homepage (`/`) → Sadece `/dashboard`'a redirect
- ❌ Salon owner landing page YOK
- ❌ Public marketing page YOK

**apps/booking (Müşteri Widget):**
- ❌ Homepage YOK
- ✅ Dynamic routes: `/{salonSlug}`, `/{citySlug}`
- ✅ Booking flow complete (Faz 16-17-18)

**Super Admin:**
- ❌ Ayrı app YOK
- ✅ Backend: `modules/admin/` mevcut
- ❌ Frontend UI YOK

**EKSIKLER:**
1. Public homepage (calon.com.tr anasayfa) YOK
2. Salon owner landing (features, pricing) YOK
3. Super admin panel UI YOK

---

### 3. BACKEND ENDPOINTS

**Mevcut Controller'lar:**
```
✅ modules/admin/admin.controller.ts
✅ modules/catalog/product.controller.ts
✅ modules/catalog/service.controller.ts
✅ modules/operations/appointment/appointment.controller.ts
✅ modules/iam/auth.controller.ts
✅ modules/billing/*
✅ modules/staff/*
✅ modules/crm/*
```

**Eksik Endpoint'ler:**
```
❌ GET /appointments (liste için)
❌ PATCH /products/:id (güncelleme için)
❌ DELETE /products/:id (silme için)
❌ PATCH /tenants/:id (branding update için)
❌ GET /tenants/me (tenant bilgileri için)
```

---

### 4. FAZ PLANLAMASI

**README.md'den:**
- ✅ Production Preparation Phase
- ✅ Feature freeze
- ✅ First customer hazırlığı

**Transcript'ten (Özet):**
- ✅ P0-P9 tamamlandı (%89)
- ✅ Aktif: P10 - Controlled Production Launch
- ✅ Faz 1: IAM (JWT + Refresh)
- ✅ Faz 2: Randevu (XState + GIST)
- ✅ Faz 3: Stok (BullMQ)
- ✅ Faz 16-18: Booking widget (PLG + City + Referral)
- ✅ Faz 21: Onboarding
- ✅ Faz 22: Subscription billing

**Eksik Bilgiler:**
- ❓ White-label hangi fazda planlanmış?
- ❓ Landing page'ler hangi fazda?
- ❓ Super admin panel hangi fazda?
- ❓ Toplam kaç faz var? (Faz 25'e kadar commit var)

---

## 🔍 CLAUDE CODE İÇİN ARAŞTIRMA TALİMATI

### GÖREV 1: SCHEMA DETAYI
```
packages/database/prisma/schema.prisma:
- Tüm modelleri listele (30+)
- Tenant model - hangi alanlar var?
- White-label için başka alanlar var mı?
- Multi-tenancy RLS nasıl çalışıyor?
```

### GÖREV 2: BACKEND AUDIT
```
apps/api/src/modules/*:
- Tüm controller'ları listele
- Her controller'da hangi endpoint'ler var?
- Tenant management için endpoint var mı?
- Eksik CRUD işlemleri neler?
```

### GÖREV 3: FRONTEND STRUCTURE
```
apps/web/app/*:
- Tüm route'ları listele
- Landing page var mı?
- Settings sayfası var mı?
- Theme system var mı?

apps/booking/app/*:
- Homepage var mı?
- Public landing var mı?
```

### GÖREV 4: FAZ DOKÜMANLARI
```
Tüm repo'da ara:
- ROADMAP*, PLAN*, PHASE*, FAZ* dosyaları
- git commit mesajlarında faz referansları
- Hangi fazlar tamamlanmış?
- White-label ne zaman geliştirilecek?
```

### GÖREV 5: WHITE-LABEL SISTEMI
```
Frontend'de ara:
- Theme provider var mı?
- CSS variable override var mı?
- Tenant theme loader var mı?
- Branding settings UI var mı?
```

---

## 🎯 KRİTİK SORULARIN CEVAPLARI

### SORU 1: Yapı ve planları tam inceledim mi?
**CEVAP:** HAYIR, sadece yüzeysel.

**Mevcut Bulgular:**
- ✅ Tenant model white-label için hazır (kısmi)
- ❌ Frontend theme sistemi yok
- ❌ Settings UI yok
- ❌ Landing page'ler yok

**Gerekli:** Claude Code ile derinlemesine analiz

---

### SORU 2: Landing page'ler planlanmış mı?
**CEVAP:** BİLİNMİYOR

**Mevcut Durum:**
- ❌ `apps/web/app/page.tsx` → redirect only
- ❌ `apps/booking` → homepage yok
- ❌ Public marketing page yok
- ❌ Super admin landing yok

**Gerekli:** 
1. Dokümanlarda landing page planı var mı bul
2. Yoksa eklemeliyiz (Faz A2 veya A3)

---

### SORU 3: White-label (renk + logo) planlanmış mı?
**CEVAP:** KISMEN PLANLANMIŞ

**Mevcut Durum:**
- ✅ Backend: `Tenant.brandColor` + `Tenant.logoUrl`
- ❌ Frontend: Theme override sistemi YOK
- ❌ Settings UI: Branding sayfası YOK
- ❌ Endpoint: `PATCH /tenants/:id` YOK

**Eksikler:**
1. Multi-color system (primary/secondary/accent)
2. CSS variable injection
3. Real-time theme switcher
4. Branding settings form

**Önerilen Ekleme:**
```prisma
model Tenant {
  ...
  // White-label colors (extended)
  brandColor      String? // Deprecated - use primaryColor
  primaryColor    String? @default("#f85d3f") // coral
  secondaryColor  String? @default("#1e293b") // slate
  accentColor     String? @default("#f59e0b") // amber
  logoUrl         String?
  faviconUrl      String?
  customCSS       String? @db.Text
  customDomain    String? // custom.domain.com
  ...
}
```

---

## 📋 SONRAKI ADIMLAR

### HEMEN (Claude Code):
1. Repo'yu derinlemesine tara
2. Faz planlamasını bul
3. White-label roadmap'i bul
4. Landing page planını bul

### SONRA (Geliştirme):
1. Eksik endpoint'leri ekle
2. Settings sayfası + branding form
3. Frontend theme system
4. Landing page'ler

---

**SON NOT:**
Bu analiz kısmi. Claude Code'un detaylı incelemesi gerekli.
