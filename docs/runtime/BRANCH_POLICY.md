# CALON — BRANCH POLİTİKASI
> Bu belge projenin git branch stratejisinin tek resmi kaynağıdır.

---

## Branch Rolleri

| Branch | Rol | Kural |
|---|---|---|
| `dev` | Aktif geliştirme hattı | Source of truth. Tüm feature/fix/chore branch'leri buradan açılır ve buraya merge edilir |
| `main` | Production / kutsal alan | Manuel onaylı release'ler için. Doğrudan commit YASAK |

---

## Kesin Kurallar

### `main` branch koruması
- `main` üzerinde doğrudan çalışma YASAK
- `main`'e doğrudan commit YASAK
- `main`'e doğrudan push YASAK
- `main`'den hotfix branch açmak YASAK
- AI ajanı `main` branch'ine hiçbir koşulda dokunamaz
- `main`'e merge yalnızca insan onayı ile yapılır

### `dev` branch kuralları
- Tüm geliştirme `dev` üzerinde veya `dev`'den açılan branch'lerde yapılır
- Source-of-truth değerlendirmeleri önce `dev` üzerinden yapılır
- Feature branch'ler `dev`'den açılır, `dev`'e merge edilir
- Fix branch'ler `dev`'den açılır, `dev`'e merge edilir

### Feature / fix branch kuralları
- İsimlendirme: `feat/<konu>`, `fix/<konu>`, `chore/<konu>`
- Tek sorumluluk: bir branch bir iş yapar
- Merge öncesi build gate zorunlu
- Çöplük commit YASAK
- Scope dışı dosya değişikliği YASAK

---

## AI Ajan Branch Kısıtlamaları

- AI ajanı `main`'e geçemez (`git checkout main` YASAK)
- AI ajanı `main`'e commit atamaz
- AI ajanı `main`'e push yapamaz
- AI ajanı `main`'den branch açamaz
- AI ajanı yalnızca `dev` ve `dev`'den türeyen branch'lerde çalışabilir
- AI ajanı push yapamaz (tüm branch'ler için)
- Branch açma/merge yalnızca açıkça istendiğinde yapılır
