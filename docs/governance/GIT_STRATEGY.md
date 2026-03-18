# CALON GIT STRATEGY (PRODUCTION READY)

**Son güncelleme:** 2026-03-18  
**Durum:** MANDATORY — Bu strateji tüm contributors için zorunludur

---

## 🎯 AMAÇ

"dev doğru / main yanlış" kaosunu bitirmek ve her zaman tek gerçek repo durumu sağlamak.

---

## 1️⃣ TEMEL PRENSİP

**Production gerçeği = main branch**

- `main` = her zaman deploy edilebilir
- `main` = her zaman doğru state
- `main` = dış dünyaya gösterilen gerçek

💥 Eğer main bozuksa → sistem bozuk kabul edilir

---

## 2️⃣ BRANCH MODELİ

### Kullanılacak Branchler:

**🔵 main**
- Production-ready
- Deploy edilen branch
- Her commit "çalışır" olmak zorunda
- **Default branch**

**🟡 dev**
- Aktif geliştirme
- Claude/Codex burada çalışır
- Feature'lar burada birleşir
- Test ve deneme alanı

**🔴 feature/***
- Kısa ömürlü (1-3 gün)
- Spesifik iş
- PR ile dev'e girer

---

## 3️⃣ GÜNLÜK AKIŞ

```
feature → dev → main
```

### 1. Feature Geliştirme
```bash
git checkout dev
git checkout -b feature/booking-slot-fix
# Çalış → commit → push
```

### 2. Dev'e Merge
```bash
git checkout dev
git merge feature/booking-slot-fix
git push origin dev
```

### 3. DEV → MAIN (KRİTİK!)
```bash
# Bu yapılmadan iş "bitmiş" sayılmaz
git checkout main
git merge dev
git push origin main
```

⚠️ **ALTIN KURAL:** dev = geçici çalışma alanı, main = gerçek

---

## 4️⃣ RELEASE KURALI

**Deploy her zaman main üzerinden:**

```
main push → build → test → deploy
```

---

## 5️⃣ CLAUDE / AI ÇALIŞMA MODELİ

Claude'a verilen kurallar:

- Tüm değişiklikler `dev` branch'te yapılır
- İş tamamlanmadan `main`'e geçilmez
- `dev` → `main` merge manuel onay gerektirir
- Commit message standartları: conventional commits

---

## 6️⃣ MERGE GATE

`main`'e geçmeden önce kontrol:

**CHECKLIST:**
- [ ] Build geçiyor
- [ ] Test geçiyor
- [ ] Migration çalışıyor
- [ ] Seed çalışıyor
- [ ] API boot ediyor
- [ ] Worker boot ediyor
- [ ] Env eksik değil
- [ ] Docs güncel

👉 Bunlardan biri fail → merge yok

---

## 7️⃣ VERSION DİSİPLİNİ

Her release:
- Commit SHA = version
- API endpoint: `/health/version`

```json
{
  "version": "a1b2c3d",
  "env": "production",
  "branch": "main"
}
```

---

## 8️⃣ HOTFIX MODELİ

Production'da bug çıktı:

```bash
# 1. main'den hotfix branch'i aç
git checkout main
git checkout -b hotfix/payment-bug

# 2. Fix yap
# ... kod ...
git commit -m "fix: payment webhook validation"
git push origin hotfix/payment-bug

# 3. main'e merge
git checkout main
git merge hotfix/payment-bug
git push origin main

# 4. dev'e de merge (senkronizasyon)
git checkout dev
git merge main
git push origin dev
```

⚠️ **ÇOK KRİTİK:** Hotfix sadece main'den çıkar, dev'den ASLA!

---

## 9️⃣ BRANCH KORUMA (GITHUB SETTINGS)

**main için:**
- Direct push: ❌ Kapalı
- PR zorunlu: ✅ Aktif
- CI zorunlu: ✅ Aktif
- En az 1 review: ✅ (Suat onayı)

**dev için:**
- Direct push: ✅ İzinli (hızlı iterasyon)
- CI recommended: ⚠️ Önerilen

---

## 🔟 EN BÜYÜK HATALAR (ASLA YAPMA)

❌ dev'de bırakmak  
❌ "Sonra merge ederiz" demek  
❌ main'i unutmak  
❌ Farklı gerçeklikler oluşturmak  
❌ Hotfix'i dev'den yapmak  

---

## 📊 MEVCUT DURUM (2026-03-18)

**Sorun:**
- dev: 62 commit ahead
- main: eski durum
- Dış dünya: main görüyor (yanlış)

**Çözüm:**
```bash
git checkout main
git merge dev
git push origin main
```

**Sonrası:** Bu stratejiyi takip et, bir daha bu problem yaşanmaz.

---

## 🎯 COMMIT MESSAGE STANDARTLARI

```
feat: yeni özellik
fix: bug düzeltmesi
chore: kod dışı işler (docs, config)
refactor: kod iyileştirme
test: test ekleme/düzeltme
docs: dokümantasyon
ci: CI/CD değişiklikleri
```

**Örnekler:**
```
feat(booking): add hold expiration worker
fix(auth): resolve JWT refresh token race condition
chore(docs): add production stack documentation
```

---

## 📝 DEPLOY CHECKLIST

**main'e merge öncesi:**
1. ✅ Local tests pass
2. ✅ Migration test edildi
3. ✅ Seed çalışıyor
4. ✅ Env variables doğrulandı
5. ✅ Breaking change yok
6. ✅ Docs güncellendi

**Deploy sonrası:**
1. ✅ Health endpoint check
2. ✅ Smoke test (critical paths)
3. ✅ Log monitoring (5 dk)
4. ✅ Rollback plan hazır

---

## 🚨 ACİL DURUM

**main bozulursa:**

```bash
# Son çalışan commit'e dön
git checkout main
git reset --hard <last-good-commit>
git push origin main --force

# dev'i de senkronize et
git checkout dev
git reset --hard main
git push origin dev --force
```

⚠️ `--force` sadece acil durumlarda!

---

## ✅ BAŞARI KRİTERLERİ

Bu strateji başarılıysa:
- ✅ GitHub main branch her zaman temiz
- ✅ Kimse "hangi branch doğru?" diye sormuyor
- ✅ Deploy deterministik
- ✅ Debug kolay
- ✅ Ekip büyüse bile sistem bozulmuyor

---

**SON GÜNCELLEME:** 2026-03-18  
**GÜNCELLEYEN:** Suat Gökçe — PY denetim raporu sonrası  
**DURUM:** Mandatory ⚠️
