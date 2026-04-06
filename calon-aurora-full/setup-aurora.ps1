# ──────────────────────────────────────────────
# CALON Aurora Surface — Otomatik Kurulum
# PowerShell ile çalıştır: .\setup-aurora.ps1
# ──────────────────────────────────────────────

$ErrorActionPreference = "Stop"
$PROJECT_ROOT = "C:\dev\calon"

Write-Host ""
Write-Host "  ╔══════════════════════════════════════╗" -ForegroundColor Magenta
Write-Host "  ║   CALON Aurora Surface Kurulumu       ║" -ForegroundColor Magenta  
Write-Host "  ╚══════════════════════════════════════╝" -ForegroundColor Magenta
Write-Host ""

# 1. Proje kontrolü
if (-not (Test-Path "$PROJECT_ROOT\apps\web")) {
    Write-Host "  HATA: $PROJECT_ROOT\apps\web bulunamadi!" -ForegroundColor Red
    exit 1
}
Write-Host "  [OK] Proje dizini dogrulandi" -ForegroundColor Green

# 2. Dizinleri oluştur
$dirs = @(
    "$PROJECT_ROOT\apps\web\app\ui\aurora",
    "$PROJECT_ROOT\apps\web\components\aurora",
    "$PROJECT_ROOT\apps\web\styles"
)

foreach ($dir in $dirs) {
    if (-not (Test-Path $dir)) {
        New-Item -ItemType Directory -Path $dir -Force | Out-Null
        Write-Host "  [+] Dizin olusturuldu: $dir" -ForegroundColor Yellow
    } else {
        Write-Host "  [=] Dizin mevcut: $dir" -ForegroundColor Gray
    }
}

# 3. Dosyaları kopyala
$scriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path
$sourceBase = Join-Path $scriptDir "apps\web"

$fileMappings = @(
    @{ src = "app\ui\aurora\page.tsx"; desc = "Route entry" },
    @{ src = "components\aurora\aurora-surface.tsx"; desc = "Ana kapsayici" },
    @{ src = "components\aurora\aurora-auth-panel.tsx"; desc = "Auth panel" },
    @{ src = "components\aurora\aurora-dashboard-panel.tsx"; desc = "Dashboard panel" },
    @{ src = "components\aurora\aurora-topbar.tsx"; desc = "Topbar" },
    @{ src = "components\aurora\aurora-sidebar.tsx"; desc = "Sidebar" },
    @{ src = "components\aurora\aurora-kpi-card.tsx"; desc = "KPI kartlari" },
    @{ src = "components\aurora\aurora-chart-card.tsx"; desc = "Chart kartlari" },
    @{ src = "components\aurora\aurora-staff-card.tsx"; desc = "Staff karti" },
    @{ src = "components\aurora\aurora-capability-tile.tsx"; desc = "Capability tile" },
    @{ src = "components\aurora\index.ts"; desc = "Barrel export" },
    @{ src = "styles\aurora-utilities.css"; desc = "Aurora CSS" }
)

foreach ($mapping in $fileMappings) {
    $srcPath = Join-Path $sourceBase $mapping.src
    $destPath = Join-Path "$PROJECT_ROOT\apps\web" $mapping.src
    
    if (Test-Path $srcPath) {
        Copy-Item -Path $srcPath -Destination $destPath -Force
        Write-Host "  [+] $($mapping.desc): $($mapping.src)" -ForegroundColor Cyan
    } else {
        Write-Host "  [!] Kaynak bulunamadi: $srcPath" -ForegroundColor Red
    }
}

# 4. globals.css'e import ekle
$globalsPath = "$PROJECT_ROOT\apps\web\app\globals.css"
$importLine = '@import "../styles/aurora-utilities.css";'

if (Test-Path $globalsPath) {
    $content = Get-Content $globalsPath -Raw
    if ($content -notmatch 'aurora-utilities') {
        Add-Content -Path $globalsPath -Value "`n$importLine"
        Write-Host "  [+] globals.css'e aurora import eklendi" -ForegroundColor Green
    } else {
        Write-Host "  [=] globals.css'de aurora import zaten var" -ForegroundColor Gray
    }
} else {
    Write-Host "  [!] globals.css bulunamadi: $globalsPath" -ForegroundColor Red
}

Write-Host ""
Write-Host "  ══════════════════════════════════════" -ForegroundColor Magenta
Write-Host "  Kurulum tamamlandi!" -ForegroundColor Green
Write-Host ""
Write-Host "  Sonraki adimlar:" -ForegroundColor White
Write-Host "    cd $PROJECT_ROOT" -ForegroundColor Gray
Write-Host "    pnpm --filter web dev" -ForegroundColor Gray
Write-Host "    # Tarayicida: http://localhost:3000/ui/aurora" -ForegroundColor Gray
Write-Host ""
Write-Host "  Build dogrulama:" -ForegroundColor White
Write-Host "    pnpm --filter web typecheck" -ForegroundColor Gray
Write-Host "    pnpm --filter web lint" -ForegroundColor Gray
Write-Host "    pnpm --filter web build" -ForegroundColor Gray
Write-Host ""
