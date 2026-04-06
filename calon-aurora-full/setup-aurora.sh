#!/bin/bash
# ──────────────────────────────────────────────
# CALON Aurora Surface — Otomatik Kurulum
# Git Bash / WSL: bash setup-aurora.sh
# ──────────────────────────────────────────────

set -e

PROJECT_ROOT="/c/dev/calon"
# WSL kullanıyorsan:
# PROJECT_ROOT="/mnt/c/dev/calon"

echo ""
echo "  ╔══════════════════════════════════════╗"
echo "  ║   CALON Aurora Surface Kurulumu       ║"
echo "  ╚══════════════════════════════════════╝"
echo ""

if [ ! -d "$PROJECT_ROOT/apps/web" ]; then
  echo "  HATA: $PROJECT_ROOT/apps/web bulunamadi!"
  echo "  PROJECT_ROOT degiskenini kontrol et."
  exit 1
fi
echo "  [OK] Proje dizini dogrulandi"

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"

# Dizinleri oluştur
mkdir -p "$PROJECT_ROOT/apps/web/app/ui/aurora"
mkdir -p "$PROJECT_ROOT/apps/web/components/aurora"
mkdir -p "$PROJECT_ROOT/apps/web/styles"
echo "  [OK] Dizinler olusturuldu"

# Dosyaları kopyala
cp "$SCRIPT_DIR/apps/web/app/ui/aurora/page.tsx" "$PROJECT_ROOT/apps/web/app/ui/aurora/"
cp "$SCRIPT_DIR/apps/web/components/aurora/"*.tsx "$PROJECT_ROOT/apps/web/components/aurora/"
cp "$SCRIPT_DIR/apps/web/components/aurora/"*.ts "$PROJECT_ROOT/apps/web/components/aurora/"
cp "$SCRIPT_DIR/apps/web/styles/aurora-utilities.css" "$PROJECT_ROOT/apps/web/styles/"
echo "  [OK] 12 dosya kopyalandi"

# globals.css'e import ekle
GLOBALS="$PROJECT_ROOT/apps/web/app/globals.css"
if [ -f "$GLOBALS" ]; then
  if ! grep -q "aurora-utilities" "$GLOBALS"; then
    echo '' >> "$GLOBALS"
    echo '@import "../styles/aurora-utilities.css";' >> "$GLOBALS"
    echo "  [OK] globals.css'e aurora import eklendi"
  else
    echo "  [=] globals.css'de aurora import zaten var"
  fi
fi

echo ""
echo "  Kurulum tamamlandi!"
echo ""
echo "  cd $PROJECT_ROOT"
echo "  pnpm --filter web dev"
echo "  # → http://localhost:3000/ui/aurora"
echo ""
