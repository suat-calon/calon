#!/usr/bin/env bash
# Calon Stage — API Smoke Test
# Usage: ./scripts/stage/smoke-api.sh [base_url]
# Example: ./scripts/stage/smoke-api.sh https://stage-api.calon.com.tr
set -euo pipefail

BASE_URL="${1:-http://localhost:4001}"
API="${BASE_URL}/api/v1"
COOKIE_JAR=$(mktemp)
PASS=0
FAIL=0

# Demo credentials (non-secret — seed data)
EMAIL="owner@demo-salon.com"
PASSWORD='Demo1234!'

echo "═══════════════════════════════════════════════"
echo "  Calon Stage API Smoke Test"
echo "  Target: $API"
echo "═══════════════════════════════════════════════"

check() {
  local name="$1"
  local expected="$2"
  local actual="$3"

  if [ "$actual" = "$expected" ]; then
    echo "  ✓ $name (HTTP $actual)"
    PASS=$((PASS + 1))
  else
    echo "  ✗ $name (expected $expected, got $actual)"
    FAIL=$((FAIL + 1))
  fi
}

# ── 1. Health ────────────────────────────────────────────────────────────────
echo ""
echo "[1/5] Health..."
status=$(curl -s -o /dev/null -w "%{http_code}" "$API/health" 2>/dev/null || echo "000")
check "GET /health" "200" "$status"

# ── 2. Login ─────────────────────────────────────────────────────────────────
echo "[2/5] Login..."
status=$(curl -s -o /dev/null -w "%{http_code}" \
  -X POST "$API/auth/login" \
  -H "Content-Type: application/json" \
  --data-raw "{\"email\":\"${EMAIL}\",\"password\":\"${PASSWORD}\"}" \
  -c "$COOKIE_JAR" 2>/dev/null || echo "000")
check "POST /auth/login" "200" "$status"

# ── 3. Auth/me ───────────────────────────────────────────────────────────────
echo "[3/5] Auth/me..."
status=$(curl -s -o /dev/null -w "%{http_code}" \
  "$API/auth/me" -b "$COOKIE_JAR" 2>/dev/null || echo "000")
check "GET /auth/me" "200" "$status"

# ── 4. Tenants/me ────────────────────────────────────────────────────────────
echo "[4/5] Tenants/me..."
status=$(curl -s -o /dev/null -w "%{http_code}" \
  "$API/tenants/me" -b "$COOKIE_JAR" 2>/dev/null || echo "000")
check "GET /tenants/me" "200" "$status"

# ── 5. Staff ─────────────────────────────────────────────────────────────────
echo "[5/5] Staff..."
status=$(curl -s -o /dev/null -w "%{http_code}" \
  "$API/staff?take=5" -b "$COOKIE_JAR" 2>/dev/null || echo "000")
check "GET /staff" "200" "$status"

# ── Cleanup ──────────────────────────────────────────────────────────────────
rm -f "$COOKIE_JAR"

# ── Summary ──────────────────────────────────────────────────────────────────
echo ""
echo "═══════════════════════════════════════════════"
echo "  Results: $PASS passed, $FAIL failed"
if [ $FAIL -gt 0 ]; then
  echo "  Stage API Smoke: FAIL"
  echo "═══════════════════════════════════════════════"
  exit 1
else
  echo "  Stage API Smoke: PASS"
  echo "═══════════════════════════════════════════════"
  exit 0
fi
