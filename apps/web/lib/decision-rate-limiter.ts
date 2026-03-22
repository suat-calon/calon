/**
 * Decision Rate Limiter — Spam Control
 * FAZ UI-13 TASK 11: Rate limit decision events to prevent abuse
 *
 * Prevents:
 * - Rapid-fire apply/dismiss/defer clicks
 * - Outcome spam (multiple outcomes for same decision)
 * - Hard dismiss spam
 */

import { trackWarn } from './telemetry';

// ── Types ────────────────────────────────────────────────────────────────────

interface RateLimitEntry {
  count: number;
  firstAt: number;
  lastAt: number;
}

// ── Constants ────────────────────────────────────────────────────────────────

/** Min interval between same action on same decision (ms) */
const MIN_ACTION_INTERVAL_MS = 500;

/** Max actions per decision per minute */
const MAX_ACTIONS_PER_MINUTE = 10;

/** Max total actions per minute across all decisions */
const MAX_TOTAL_ACTIONS_PER_MINUTE = 30;

const WINDOW_MS = 60_000;

// ── State ────────────────────────────────────────────────────────────────────

const perDecision = new Map<string, RateLimitEntry>();
let totalEntry: RateLimitEntry = { count: 0, firstAt: 0, lastAt: 0 };

// ── API ──────────────────────────────────────────────────────────────────────

/**
 * Check if an action should be rate-limited.
 * Returns true if the action should be BLOCKED.
 */
export function isActionRateLimited(
  decisionId: string,
  action: string,
): boolean {
  const now = Date.now();
  const key = `${decisionId}:${action}`;

  // 1. Rapid-fire protection
  const entry = perDecision.get(key);
  if (entry && now - entry.lastAt < MIN_ACTION_INTERVAL_MS) {
    trackWarn('decision', 'rate_limited', { decisionId, action, reason: 'too_fast' });
    return true;
  }

  // 2. Per-decision limit
  if (entry) {
    if (now - entry.firstAt < WINDOW_MS && entry.count >= MAX_ACTIONS_PER_MINUTE) {
      trackWarn('decision', 'rate_limited', { decisionId, action, reason: 'per_decision_limit' });
      return true;
    }
  }

  // 3. Global limit
  if (now - totalEntry.firstAt < WINDOW_MS && totalEntry.count >= MAX_TOTAL_ACTIONS_PER_MINUTE) {
    trackWarn('decision', 'rate_limited', { decisionId, action, reason: 'global_limit' });
    return true;
  }

  // Update counters
  if (!entry || now - entry.firstAt >= WINDOW_MS) {
    perDecision.set(key, { count: 1, firstAt: now, lastAt: now });
  } else {
    entry.count += 1;
    entry.lastAt = now;
  }

  if (now - totalEntry.firstAt >= WINDOW_MS) {
    totalEntry = { count: 1, firstAt: now, lastAt: now };
  } else {
    totalEntry.count += 1;
    totalEntry.lastAt = now;
  }

  return false;
}

/**
 * Reset all rate limit counters (for testing/debug).
 */
export function resetRateLimits(): void {
  perDecision.clear();
  totalEntry = { count: 0, firstAt: 0, lastAt: 0 };
}
