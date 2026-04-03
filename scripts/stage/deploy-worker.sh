#!/usr/bin/env bash
# Calon Stage — Worker Deploy Script
# Usage: ./scripts/stage/deploy-worker.sh
set -euo pipefail

COMPOSE_FILE="docker-compose.yml"
COMPOSE_OVERRIDE="docker-compose.staging.yml"
COMPOSE_PORTS="docker-compose.staging-ports.yml"
ENV_FILE="apps/api/.env.staging"
CONTAINER_NAME="calon_worker_stage"
MAX_WAIT=30

# Canonical compose command — always uses stage env file to prevent root .env poisoning
COMPOSE="docker compose --env-file $ENV_FILE -f $COMPOSE_FILE -f $COMPOSE_OVERRIDE -f $COMPOSE_PORTS"

echo "═══════════════════════════════════════════════"
echo "  Calon Stage Worker Deploy"
echo "═══════════════════════════════════════════════"

# ── 1. Env guard ─────────────────────────────────────────────────────────────
echo "[1/5] Checking environment..."

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
echo "[2/5] Building worker image..."
$COMPOSE build worker
echo "  ✓ Build complete"

# ── 3. Start worker ──────────────────────────────────────────────────────────
# --force-recreate: eski container reuse edilmez — her deploy yeni container garanti eder.
echo "[3/5] Starting worker container..."
$COMPOSE up -d --force-recreate worker
echo "  ✓ Worker container started"

# ── 4. Startup verification ──────────────────────────────────────────────────
echo "[4/5] Checking worker startup (${MAX_WAIT}s)..."
sleep 5

# 4a. Container running check
if ! docker ps --filter "name=$CONTAINER_NAME" --format '{{.Names}}' | grep -q "$CONTAINER_NAME"; then
  echo "FAIL: Worker container not running"
  $COMPOSE logs worker --tail=20 2>&1
  exit 1
fi

# 4b. Restart count check (should be 0 after fresh deploy)
RESTART_COUNT=$(docker inspect "$CONTAINER_NAME" --format '{{.RestartCount}}' 2>/dev/null || echo "?")
if [ "$RESTART_COUNT" != "0" ] && [ "$RESTART_COUNT" != "?" ]; then
  echo "WARN: Worker restart count = $RESTART_COUNT (expected 0)"
fi

# 4c. Boot log sanity — check for critical startup markers
BOOT_LOG=$($COMPOSE logs worker --tail=20 2>&1)
if echo "$BOOT_LOG" | grep -q "Worker context started"; then
  echo "  ✓ Worker boot confirmed"
else
  echo "FAIL: 'Worker context started' not found in boot log"
  echo "$BOOT_LOG"
  exit 1
fi

# ── 5. Health signals ────────────────────────────────────────────────────────
echo "[5/5] Checking health signals..."

# 5a. ConnTrace — outbox listener alive
if echo "$BOOT_LOG" | grep -q "ConnTrace.*LISTEN"; then
  echo "  ✓ OutboxListener connected"
else
  echo "  ⚠ OutboxListener ConnTrace not found (may take longer)"
fi

# 5b. ECONNRESET flood check — more than 3 in boot window = problem
ECONNRESET_COUNT=$(echo "$BOOT_LOG" | grep -c "ECONNRESET" || true)
if [ "$ECONNRESET_COUNT" -gt 3 ]; then
  echo "WARN: $ECONNRESET_COUNT ECONNRESET errors in boot window"
fi

echo ""
echo "═══════════════════════════════════════════════"
echo "  Stage Worker deploy: SUCCESS"
echo "  Container: $CONTAINER_NAME (restarts=$RESTART_COUNT)"
echo "  Monitor: $COMPOSE logs -f worker"
echo "═══════════════════════════════════════════════"
