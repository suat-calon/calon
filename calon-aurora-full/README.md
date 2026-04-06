# CALON Aurora Surface — Kurulum Kılavuzu

## Dosya Yerleşimi

Aşağıdaki dosyaları `c:/dev/calon/` kök dizinindeki karşılık gelen yollarına kopyalayın:

```
apps/web/
├── app/ui/aurora/
│   └── page.tsx                          ← Route entry
├── components/aurora/
│   ├── index.ts                          ← Barrel export
│   ├── aurora-surface.tsx                ← Ana kapsayıcı
│   ├── aurora-auth-panel.tsx             ← Sol: Auth UI
│   ├── aurora-dashboard-panel.tsx        ← Sağ: Dashboard preview
│   ├── aurora-topbar.tsx                 ← Dashboard üst bar
│   ├── aurora-sidebar.tsx                ← Dashboard sol menü
│   ├── aurora-kpi-card.tsx               ← KPI metrik kartları
│   ├── aurora-chart-card.tsx             ← Bar + Donut chart
│   ├── aurora-staff-card.tsx             ← Ekip kartı
│   └── aurora-capability-tile.tsx        ← Alt yetenek tile'ları
└── styles/
    └── aurora-utilities.css              ← İzole stil yardımcıları
```

## Kurulum Adımları

### 1. Dosyaları Kopyala

Tüm dosyaları yukarıdaki yapıya göre `c:/dev/calon/` altına yerleştirin.

### 2. CSS Import

`apps/web/app/globals.css` dosyanızın **en sonuna** şu satırı ekleyin:

```css
@import "../styles/aurora-utilities.css";
```

> ⚠️ globals.css'teki mevcut hiçbir satırı DEĞİŞTİRMEYİN. Sadece import ekleyin.

### 3. Doğrulama

```bash
cd c:/dev/calon
pnpm --filter web dev
# veya
yarn --filter web dev
```

Tarayıcıda açın: `http://localhost:3000/ui/aurora`

### 4. Build Kontrolü

```bash
pnpm --filter web typecheck
pnpm --filter web lint
pnpm --filter web build
```

## Tasarım Tokenleri

| Token | Değer | Kullanım |
|-------|-------|----------|
| Background Base | `#F5F1FF` | Aurora arka plan |
| Lavender Haze | `#ECE3FF` | Gradient geçiş |
| Mist Blue | `#E7F0FF` | Gradient geçiş |
| Primary Violet | `#6D4CFF` | Ana aksan rengi |
| Electric Purple | `#8A5CFF` | İkincil aksan |
| Orchid | `#C86BFF` | Chart/highlight |
| Cyan Hint | `#7ED7FF` | Chart accent |
| Text Primary | `#332B5B` | Ana metin |
| Text Secondary | `#6E6791` | İkincil metin |
| Text Muted | `#938DB2` | Hafif metin |
| Glass Fill | `rgba(255,255,255,0.28–0.56)` | Cam yüzey |
| Glass Border | `rgba(255,255,255,0.38–0.55)` | Cam kenar |

## İzolasyon Garantisi

- ✅ Mevcut dashboard route'larına dokunulmaz
- ✅ Auth guard dışında kalır
- ✅ Global CSS sistemi korunur (sadece additive import)
- ✅ Mevcut component'lere müdahale yoktur
- ✅ Route collision riski yoktur (`/ui/aurora` benzersiz path)

## Not

Bu surface **saf UI showcase** olarak tasarlanmıştır.
Gerçek auth bağlama veya API entegrasyonu içermez.
Amacı: **Premium UI direction lock** sağlamaktır.
