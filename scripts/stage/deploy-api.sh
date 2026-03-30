#!/usr/bin/env bash
# Calon Stage — API Deploy Script
# Usage: ./scripts/stage/deploy-api.sh
set -euo pipefail

COMPOSE_FILE="docker-compose.yml"
COMPOSE_OVERRIDE="docker-compose.staging.yml"
COMPOSE_PORTS="docker-compose.staging-ports.yml"
ENV_FILE="apps/api/.env.staging"
HEALTH_URL="http://localhost:4001/api/v1/health"
MAX_WAIT=60

echo "═══════════════════════════════════════════════"
echo "  Calon Stage API Deploy"
echo "═══════════════════════════════════════════════"

# ── 1. Env guard ─────────────────────────────────────────────────────────────
echo "[1/5] Checking environment..."

if [ ! -f "$ENV_FILE" ]; then
  echo "FAIL: $ENV_FILE not found. Copy from .env.staging.example and fill secrets."
  exit 1
fi

# Check critical env vars exist (not empty)
for var in DATABASE_URL REDIS_HOST JWT_SECRET; do
  if ! grep -q "^${var}=.\+" "$ENV_FILE" 2>/dev/null; then
    echo "FAIL: $var is missing or empty in $ENV_FILE"
    exit 1
  fi
done

echo "  ✓ Environment file validated"

# ── 2. Build ─────────────────────────────────────────────────────────────────
echo "[2/5] Building API image..."
docker compose -f "$COMPOSE_FILE" -f "$COMPOSE_OVERRIDE" -f "$COMPOSE_PORTS" build api
echo "  ✓ Build complete"

# ── 3. Migration ─────────────────────────────────────────────────────────────
echo "[3/5] Running database migration..."
docker compose -f "$COMPOSE_FILE" -f "$COMPOSE_OVERRIDE" -f "$COMPOSE_PORTS" \
  run --rm api npx prisma migrate deploy --schema /app/packages/database/prisma/schema.prisma
echo "  ✓ Migration complete"

# ── 4. Start API ─────────────────────────────────────────────────────────────
# Note: prisma generate runs at build time inside the Docker image.
# No runtime generate needed — generated client is baked into the image.
echo "[4/5] Starting API container..."
docker compose -f "$COMPOSE_FILE" -f "$COMPOSE_OVERRIDE" -f "$COMPOSE_PORTS" up -d api
echo "  ✓ API container started"

# ── 5. Health check ──────────────────────────────────────────────────────────
echo "[5/5] Waiting for API health (max ${MAX_WAIT}s)..."
elapsed=0
while [ $elapsed -lt $MAX_WAIT ]; do
  status=$(curl -s -o /dev/null -w "%{http_code}" "$HEALTH_URL" 2>/dev/null || echo "000")
  if [ "$status" = "200" ]; then
    echo "  ✓ API healthy (HTTP 200)"
    echo ""
    echo "═══════════════════════════════════════════════"
    echo "  Stage API deploy: SUCCESS"
    echo "  Health: $HEALTH_URL"
    echo "═══════════════════════════════════════════════"
    exit 0
  fi
  sleep 2
  elapsed=$((elapsed + 2))
  echo "  ... waiting ($elapsed/${MAX_WAIT}s, last status: $status)"
done

echo "FAIL: API did not become healthy within ${MAX_WAIT}s"
echo "  Check logs: docker compose -f $COMPOSE_FILE -f $COMPOSE_OVERRIDE -f $COMPOSE_PORTS logs api --tail=50"
exit 1
