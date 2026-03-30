#!/usr/bin/env bash
# Calon Stage — Worker Deploy Script
# Usage: ./scripts/stage/deploy-worker.sh
set -euo pipefail

COMPOSE_FILE="docker-compose.yml"
COMPOSE_OVERRIDE="docker-compose.staging.yml"
COMPOSE_PORTS="docker-compose.staging-ports.yml"
ENV_FILE="apps/api/.env.staging"

# Canonical compose command — always uses stage env file to prevent root .env poisoning
COMPOSE="docker compose --env-file $ENV_FILE -f $COMPOSE_FILE -f $COMPOSE_OVERRIDE -f $COMPOSE_PORTS"

echo "═══════════════════════════════════════════════"
echo "  Calon Stage Worker Deploy"
echo "═══════════════════════════════════════════════"

# ── 1. Env guard ─────────────────────────────────────────────────────────────
echo "[1/4] Checking environment..."

if [ ! -f "$ENV_FILE" ]; then
  echo "FAIL: $ENV_FILE not found."
  exit 1
fi

# Check Redis config (worker needs queue)
for var in REDIS_HOST BULL_PREFIX; do
  if ! grep -q "^${var}=.\+" "$ENV_FILE" 2>/dev/null; then
    echo "FAIL: $var is missing or empty in $ENV_FILE"
    exit 1
  fi
done

BULL_PREFIX=$(grep "^BULL_PREFIX=" "$ENV_FILE" | cut -d= -f2)
if [ "$BULL_PREFIX" != "stage" ]; then
  echo "WARN: BULL_PREFIX is '$BULL_PREFIX', expected 'stage'. Prod queue contamination risk."
fi

echo "  ✓ Environment validated (BULL_PREFIX=$BULL_PREFIX)"

# ── 2. Build ─────────────────────────────────────────────────────────────────
echo "[2/4] Building worker image..."
$COMPOSE build worker
echo "  ✓ Build complete"

# ── 3. Start worker ──────────────────────────────────────────────────────────
echo "[3/4] Starting worker container..."
$COMPOSE up -d worker
echo "  ✓ Worker container started"

# ── 4. Quick log check ───────────────────────────────────────────────────────
echo "[4/4] Checking worker startup (5s)..."
sleep 5
$COMPOSE logs worker --tail=10 2>&1 | head -15

echo ""
echo "═══════════════════════════════════════════════"
echo "  Stage Worker deploy: SUCCESS"
echo "  Monitor: $COMPOSE logs -f worker"
echo "═══════════════════════════════════════════════"
