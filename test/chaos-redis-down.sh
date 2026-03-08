#!/usr/bin/env bash
# ──────────────────────────────────────────────────────────────────────────────
# CHAOS TEST — Redis Down Graceful Degradation
# ──────────────────────────────────────────────────────────────────────────────
# Redis container'ı 60 saniye durdurur, soak testi paralel çalışırken:
#   1. Entitlement DB-fallback devreye girmeli (5xx OLMAMALI)
#   2. BillingGuard servis kesintisi olmadan devam etmeli
#   3. Redis yeniden başlatılınca normal operasyona dönmeli
#
# Rapor:
#   • Chaos öncesi / sırası / sonrası p95 latency farkı
#   • 5xx sayısı (0 olmalı)
#   • Entitlement fallback hit sayısı (> 0 olmalı)
#   • Başarı eşiği: 5xx === 0 && fallback > 0 && p95_during < p95_before * 2
#
# Kullanım:
#   ./test/chaos-redis-down.sh [BASE_URL] [CHAOS_DURATION_SECS]
#
# Örnek:
#   ./test/chaos-redis-down.sh http://localhost:4000 60
# ──────────────────────────────────────────────────────────────────────────────

set -euo pipefail

BASE_URL="${1:-http://localhost:4000}"
CHAOS_DURATION="${2:-60}"
API="${BASE_URL}/api/v1"

REDIS_CONTAINER="${REDIS_CONTAINER:-calon_redis}"
RESULTS_DIR="test/results"
TIMESTAMP=$(date +%Y%m%d_%H%M%S)
REPORT="${RESULTS_DIR}/chaos-${TIMESTAMP}.json"

# Renkler (terminal desteği varsa)
RED='\033[0;31m'; GREEN='\033[0;32m'; YELLOW='\033[1;33m'; CYAN='\033[0;36m'; NC='\033[0m'

log()  { echo -e "${CYAN}[CHAOS]${NC} $*"; }
ok()   { echo -e "${GREEN}[✓]${NC} $*"; }
warn() { echo -e "${YELLOW}[!]${NC} $*"; }
fail() { echo -e "${RED}[✗]${NC} $*"; }

# ── Yardımcı: basit HTTP probe ────────────────────────────────────────────────
# Birden fazla tenant'ı hızlıca sorgular, 5xx/fallback sayar
# Çıktı: "5xx=N fallback=M p95=Xms"
probe_endpoints() {
  local label="$1"
  local fixture="test/fixtures/tenants.json"
  local sample_count=20       # Her probe'da 20 farklı tenant sorgulanır
  local errors=0
  local fallbacks=0
  local durations=()

  if [[ ! -f "$fixture" ]]; then
    warn "Fixture bulunamadı: $fixture — önce seed-200-tenants.ts çalıştırın"
    echo "5xx=ERR fallback=ERR p95=ERR"
    return
  fi

  # jq ile tenant listesinden token dizisi al
  local tokens
  mapfile -t tokens < <(jq -r '.[0:20] | .[].token' "$fixture" 2>/dev/null || echo "")

  if [[ ${#tokens[@]} -eq 0 ]]; then
    warn "Token okunamadı (jq gerekli)"
    echo "5xx=ERR fallback=ERR p95=ERR"
    return
  fi

  for token in "${tokens[@]}"; do
    local start
    start=$(date +%s%3N)

    local http_out
    http_out=$(curl -s -o /dev/null \
      -w "%{http_code} %{header_json}" \
      -H "Authorization: Bearer ${token}" \
      -H "x-correlation-id: chaos-probe-${label}-$$" \
      --max-time 5 \
      "${API}/billing/entitlements" 2>/dev/null || echo "000 {}")

    local finish
    finish=$(date +%s%3N)
    local dur=$(( finish - start ))
    durations+=("$dur")

    local status
    status=$(echo "$http_out" | awk '{print $1}')

    if [[ "$status" =~ ^5 ]]; then
      (( errors++ )) || true
    fi

    # x-entitlement-source: db-fallback header kontrolü
    if echo "$http_out" | grep -qi 'db-fallback'; then
      (( fallbacks++ )) || true
    fi
  done

  # p95 hesapla (basit sort + index)
  local sorted
  sorted=$(printf '%s\n' "${durations[@]}" | sort -n)
  local count=${#durations[@]}
  local p95_idx=$(( (count * 95 / 100) ))
  [[ $p95_idx -ge $count ]] && p95_idx=$(( count - 1 ))
  local p95
  p95=$(echo "$sorted" | sed -n "$(( p95_idx + 1 ))p")

  echo "5xx=${errors} fallback=${fallbacks} p95=${p95}ms"
}

# ── Ana senaryo ───────────────────────────────────────────────────────────────
main() {
  mkdir -p "${RESULTS_DIR}"

  log "Chaos Redis Down Testi başlıyor"
  log "Hedef: ${BASE_URL}"
  log "Redis container: ${REDIS_CONTAINER}"
  log "Chaos süresi: ${CHAOS_DURATION}s"
  echo ""

  # ── Faz 1: API sağlığı kontrolü ──────────────────────────────────────────
  log "Faz 1: API sağlık kontrolü..."
  local health_status
  health_status=$(curl -s -o /dev/null -w "%{http_code}" --max-time 5 "${BASE_URL}/api/v1/health" 2>/dev/null || echo "000")
  if [[ "$health_status" != "200" ]]; then
    fail "API erişilemiyor (HTTP ${health_status}). API'nin çalıştığından emin olun."
    exit 1
  fi
  ok "API hazır (${BASE_URL})"

  # Redis container kontrolü
  if ! docker inspect "${REDIS_CONTAINER}" &>/dev/null; then
    fail "Redis container bulunamadı: ${REDIS_CONTAINER}"
    fail "Çalıştırın: docker compose up -d redis"
    exit 1
  fi
  ok "Redis container bulundu: ${REDIS_CONTAINER}"
  echo ""

  # ── Faz 2: Baseline ölçümü (Redis UP) ────────────────────────────────────
  log "Faz 2: Baseline ölçümü (Redis UP)..."
  sleep 2
  local baseline
  baseline=$(probe_endpoints "baseline")
  ok "Baseline: ${baseline}"

  local baseline_5xx baseline_p95
  baseline_5xx=$(echo "$baseline"   | grep -oP '5xx=\K[^\ ]+')
  baseline_p95=$(echo "$baseline"   | grep -oP 'p95=\K[^m]+')

  if [[ "$baseline_5xx" != "0" ]]; then
    warn "Baseline'da zaten ${baseline_5xx} hata var — devam ediliyor ama dikkat"
  fi
  echo ""

  # ── Faz 3: Redis durdur ───────────────────────────────────────────────────
  log "Faz 3: Redis container durduruluyor → ${CHAOS_DURATION}s chaos..."
  docker stop "${REDIS_CONTAINER}" &>/dev/null
  ok "Redis durduruldu: $(date '+%H:%M:%S')"

  # İlk 5 saniyede hızlı probe (geçiş sürecini yakala)
  sleep 5
  log "Chaos sırasında hızlı probe..."
  local during_early
  during_early=$(probe_endpoints "during-early")
  ok "Chaos başlangıcı (5s): ${during_early}"

  # Ortada probe (beklenen: DB fallback aktif, 5xx yok)
  local half=$(( CHAOS_DURATION / 2 ))
  sleep $(( half - 5 ))
  log "Chaos ortası (${half}s)..."
  local during_mid
  during_mid=$(probe_endpoints "during-mid")
  ok "Chaos ortası (${half}s): ${during_mid}"

  # Kalan süre
  sleep $(( CHAOS_DURATION - half ))

  # ── Faz 4: Redis yeniden başlat ──────────────────────────────────────────
  log "Faz 4: Redis yeniden başlatılıyor..."
  docker start "${REDIS_CONTAINER}" &>/dev/null
  ok "Redis yeniden başlatıldı: $(date '+%H:%M:%S')"

  # Redis warmup bekleme
  sleep 8
  log "Redis warmup bekleniyor (8s)..."

  # ── Faz 5: Recovery ölçümü ───────────────────────────────────────────────
  log "Faz 5: Recovery ölçümü (Redis tekrar UP)..."
  local recovery
  recovery=$(probe_endpoints "recovery")
  ok "Recovery: ${recovery}"
  echo ""

  # ── Özet ve geçer/kalır değerlendirmesi ──────────────────────────────────
  local during_5xx during_fallbacks during_p95 recovery_5xx
  during_5xx=$(echo "$during_mid"    | grep -oP '5xx=\K[^\ ]+')
  during_fallbacks=$(echo "$during_mid" | grep -oP 'fallback=\K[^\ ]+')
  during_p95=$(echo "$during_mid"    | grep -oP 'p95=\K[^m]+')
  recovery_5xx=$(echo "$recovery"    | grep -oP '5xx=\K[^\ ]+')

  # Geçme kriterleri
  local passed=true
  local criteria_5xx="PASS" criteria_fallback="PASS" criteria_recovery="PASS" criteria_p95="PASS"

  if [[ "$during_5xx" != "0" && "$during_5xx" != "ERR" ]]; then
    criteria_5xx="FAIL"
    passed=false
  fi

  if [[ "$during_fallbacks" == "0" || "$during_fallbacks" == "ERR" ]]; then
    criteria_fallback="FAIL (fallback hiç tetiklenmedi)"
    passed=false
  fi

  if [[ "$recovery_5xx" != "0" && "$recovery_5xx" != "ERR" ]]; then
    criteria_recovery="FAIL (recovery sonrası hatalar devam ediyor)"
    passed=false
  fi

  # p95 chaos sırasında baseline'ın 2 katından az olmalı
  if [[ "$during_p95" =~ ^[0-9]+$ && "$baseline_p95" =~ ^[0-9]+$ ]]; then
    local max_allowed=$(( baseline_p95 * 2 ))
    if [[ $during_p95 -gt $max_allowed ]]; then
      criteria_p95="FAIL (p95 ${during_p95}ms > ${max_allowed}ms limit)"
      passed=false
    else
      criteria_p95="PASS (p95 ${during_p95}ms ≤ ${max_allowed}ms)"
    fi
  else
    criteria_p95="SKIP (ölçülemedi)"
  fi

  echo ""
  echo "╔══════════════════════════════════════════════════════════╗"
  echo "║            CHAOS TEST SONUÇLARI                          ║"
  echo "╠══════════════════════════════════════════════════════════╣"
  printf "║  %-20s %s\n" "Baseline:"      "${baseline}"
  printf "║  %-20s %s\n" "Chaos sırası:"  "${during_mid}"
  printf "║  %-20s %s\n" "Recovery:"      "${recovery}"
  echo "╠══════════════════════════════════════════════════════════╣"
  printf "║  %-28s %-28s║\n" "5xx Sıfır:"      "${criteria_5xx}"
  printf "║  %-28s %-28s║\n" "Fallback Aktif:"  "${criteria_fallback}"
  printf "║  %-28s %-28s║\n" "Recovery:"        "${criteria_recovery}"
  printf "║  %-28s %-28s║\n" "p95 Latency:"     "${criteria_p95}"
  echo "╠══════════════════════════════════════════════════════════╣"
  if [[ "$passed" == "true" ]]; then
    echo "║  SONUÇ: ✅  CHAOS TEST BAŞARILI                           ║"
  else
    echo "║  SONUÇ: ❌  CHAOS TEST BAŞARISIZ                          ║"
  fi
  echo "╚══════════════════════════════════════════════════════════╝"
  echo ""

  # JSON raporu kaydet
  cat > "${REPORT}" << EOF
{
  "timestamp": "$(date -u +%Y-%m-%dT%H:%M:%SZ)",
  "chaosType": "redis-down",
  "chaosDurationSecs": ${CHAOS_DURATION},
  "baseline":  "${baseline}",
  "duringMid": "${during_mid}",
  "recovery":  "${recovery}",
  "criteria": {
    "5xx_zero":           "${criteria_5xx}",
    "fallback_triggered": "${criteria_fallback}",
    "recovery_clean":     "${criteria_recovery}",
    "p95_within_2x":      "${criteria_p95}"
  },
  "passed": ${passed}
}
EOF

  log "Rapor kaydedildi → ${REPORT}"

  if [[ "$passed" == "false" ]]; then
    exit 1
  fi
}

main "$@"
