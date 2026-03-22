/**
 * Decision Memory V3 — Closed Learning Loop
 * FAZ UI-11.3: Outcome UI, pattern learning, generation adaptation,
 * aggressive suppression, hard dismiss, auto outcome
 *
 * LEARNING LOOP:
 * karar → aksiyon → outcome → pattern → davranış değişimi → yeni karar
 *
 * Principles:
 * - Outcome olmadan öğrenme YOK
 * - Learning davranışı değiştirmiyorsa sahte AI
 * - Context'siz learning YASAK
 * - confidence < 0.3 → karar hiç üretilmez
 * - failCount >= 3 && successCount === 0 → hard block
 */

import type { Decision } from './decision-engine';
import type { DashboardData } from './dashboard-mock';
import { getMemoryAdapter } from './decision-memory-adapter';
import { trackEvent, trackError, trackMemoryCorruption } from './telemetry';

// ── Types ────────────────────────────────────────────────────────────────────

export type LoadLevel = 'low' | 'medium' | 'high';
export type OutcomeResult = 'success' | 'failed' | 'unknown';
export type OutcomeSource = 'user' | 'auto';

export interface DecisionContext {
  hour: number;
  loadLevel: LoadLevel;
  staffBusyCount: number;
}

export interface DecisionOutcome {
  result: OutcomeResult;
  measuredAt: number;
  source: OutcomeSource;
  context?: DecisionContext;
}

/** Pattern key = rootCauseKey:loadLevel */
export interface PatternStats {
  successCount: number;
  failCount: number;
}

export interface DecisionMemoryItem {
  decisionId: string;
  rootCauseKey: string;
  status: 'applied' | 'dismissed' | 'deferred' | 'hard_dismissed';

  applyCount: number;
  dismissCount: number;

  appliedAt?: number;
  dismissedAt?: number;
  deferredAt?: number;

  /** Learned confidence — adapts via outcomes + decay */
  confidence: number;

  /** Context at time of last action */
  context?: DecisionContext;

  /** Latest outcome */
  outcome?: DecisionOutcome;

  /** When outcome was requested (pending tracker) */
  outcomeRequestedAt?: number;
  /** Whether outcome came from user or auto */
  outcomeSource?: OutcomeSource;

  /** Cumulative outcome counts */
  successCount: number;
  failCount: number;

  /** Pattern learning: patternKey → stats */
  patternStats: Record<string, PatternStats>;

  lastUpdatedAt: number;
}

// ── Constants ────────────────────────────────────────────────────────────────

const STORAGE_KEY = 'calon.decision.memory.v3';
const MAX_ITEMS = 50;

export const COOLDOWN_MAP: Record<string, number> = {
  applied:        4 * 60 * 60 * 1000,
  dismissed:      24 * 60 * 60 * 1000,
  deferred:       2 * 60 * 60 * 1000,
  hard_dismissed: Infinity,
};

const ROOT_CAUSE_SUPPRESS_THRESHOLD = 3;
const APPLY_BOOST_THRESHOLD = 2;
const DISMISS_DROP_THRESHOLD = 2;

const OUTCOME_SUCCESS_BOOST = 0.2;
const OUTCOME_FAILED_DROP = 0.3;
const OUTCOME_UNKNOWN_DROP = 0.05;

const ACTION_APPLY_BOOST = 0.05;
const ACTION_DISMISS_DROP = 0.05;

const DECAY_RATE = 0.95;
const DECAY_INTERVAL_MS = 24 * 60 * 60 * 1000;

/** Below this confidence, decision is not even generated (TASK 4) */
export const GENERATION_BLOCK_THRESHOLD = 0.3;

/** Hard block: failCount >= this AND successCount === 0 (TASK 5) */
export const HARD_BLOCK_FAIL_THRESHOLD = 3;

/** Success count for aggressive boosting (TASK 7) */
const SUCCESS_BOOST_THRESHOLD = 3;
const SUCCESS_BOOST_CONFIDENCE = 0.1;

// ── Context Capture ──────────────────────────────────────────────────────────

export function getCurrentContext(data: DashboardData): DecisionContext {
  const hour = new Date().getHours();
  const occupancy = data.todayStats.occupancyPercent;
  let loadLevel: LoadLevel = 'low';
  if (occupancy >= 70) loadLevel = 'high';
  else if (occupancy >= 40) loadLevel = 'medium';

  const staffBusyCount = (data.staffOps ?? []).filter(
    (s) => s.currentStatus === 'busy',
  ).length;

  return { hour, loadLevel, staffBusyCount };
}

export function buildPatternKey(rootCauseKey: string, loadLevel: LoadLevel): string {
  return `${rootCauseKey}:${loadLevel}`;
}

// ── Storage API (via adapter — UI-13 TASK 8) ─────────────────────────────────

export function getDecisionMemory(): DecisionMemoryItem[] {
  try {
    const raw = getMemoryAdapter().read();
    const migrated = raw.map(migrateItem);
    const cleaned = removeStaleItems(migrated);
    // If stale items were removed, persist the cleaned state
    if (cleaned.length < migrated.length) {
      trackEvent('memory', 'stale_items_removed', {
        removed: migrated.length - cleaned.length,
      });
      getMemoryAdapter().write(cleaned);
    }
    return cleaned;
  } catch (err) {
    trackError('memory', 'get_failed', err);
    resetDecisionMemory();
    return [];
  }
}

export function saveDecisionMemory(items: DecisionMemoryItem[]): void {
  try {
    // TASK 9: Validate items before saving
    const valid = items.filter(isValidMemoryItem);
    if (valid.length !== items.length) {
      trackMemoryCorruption('save_filtered_invalid', {
        total: items.length,
        valid: valid.length,
      });
    }
    getMemoryAdapter().write(pruneMemory(valid));
  } catch (err) {
    trackError('memory', 'save_failed', err);
  }
}

export function resetDecisionMemory(): void {
  try {
    getMemoryAdapter().clear();
    trackEvent('memory', 'reset');
  } catch (err) {
    trackError('memory', 'reset_failed', err);
  }
}

/** Valid status values for enum validation */
const VALID_STATUSES = new Set(['applied', 'dismissed', 'deferred', 'hard_dismissed']);

/** Stale item threshold: 30 days */
const STALE_THRESHOLD_MS = 30 * 24 * 60 * 60 * 1000;

/** TASK 9: Validate a memory item has required fields and sane values */
function isValidMemoryItem(item: unknown): item is DecisionMemoryItem {
  if (!item || typeof item !== 'object') return false;
  const m = item as Record<string, unknown>;
  if (typeof m.decisionId !== 'string' || m.decisionId.length === 0) return false;
  if (typeof m.rootCauseKey !== 'string' || m.rootCauseKey.length === 0) return false;
  if (typeof m.confidence === 'number' && (m.confidence < 0 || m.confidence > 1)) return false;
  if (typeof m.lastUpdatedAt === 'number' && m.lastUpdatedAt < 0) return false;
  // Invalid enum → drop item
  if (typeof m.status === 'string' && !VALID_STATUSES.has(m.status)) return false;
  return true;
}

/**
 * Migrate item from any version to current schema.
 * Handles: missing fields, invalid enums, NaN values, unknown versions.
 * UI-13.1 TASK 9: Hard migration with safe defaults.
 */
function migrateItem(item: Partial<DecisionMemoryItem> & { decisionId: string; rootCauseKey: string }): DecisionMemoryItem {
  // Sanitize status enum
  const status = typeof item.status === 'string' && VALID_STATUSES.has(item.status)
    ? item.status as DecisionMemoryItem['status']
    : 'applied';

  // Sanitize numeric fields — NaN or negative → default
  const safeNum = (v: unknown, fallback: number): number => {
    if (typeof v !== 'number' || isNaN(v) || v < 0) return fallback;
    return v;
  };

  // Sanitize confidence — clamp to [0, 1]
  const rawConf = typeof item.confidence === 'number' && !isNaN(item.confidence) ? item.confidence : 0.5;
  const confidence = Math.max(0, Math.min(1, rawConf));

  // Sanitize patternStats — drop entries with invalid counts
  let patternStats: Record<string, { successCount: number; failCount: number }> = {};
  if (item.patternStats && typeof item.patternStats === 'object') {
    for (const [key, ps] of Object.entries(item.patternStats)) {
      if (ps && typeof ps === 'object' && typeof ps.successCount === 'number' && typeof ps.failCount === 'number') {
        patternStats[key] = { successCount: Math.max(0, ps.successCount), failCount: Math.max(0, ps.failCount) };
      }
    }
  }

  return {
    decisionId: item.decisionId,
    rootCauseKey: item.rootCauseKey,
    status,
    applyCount: safeNum(item.applyCount, 0),
    dismissCount: safeNum(item.dismissCount, 0),
    confidence,
    successCount: safeNum(item.successCount, 0),
    failCount: safeNum(item.failCount, 0),
    lastUpdatedAt: safeNum(item.lastUpdatedAt, Date.now()),
    patternStats,
    // Optional fields — pass through if present
    ...(item.appliedAt != null ? { appliedAt: item.appliedAt } : {}),
    ...(item.dismissedAt != null ? { dismissedAt: item.dismissedAt } : {}),
    ...(item.deferredAt != null ? { deferredAt: item.deferredAt } : {}),
    ...(item.context ? { context: item.context } : {}),
    ...(item.outcome ? { outcome: item.outcome } : {}),
    ...(item.outcomeRequestedAt != null ? { outcomeRequestedAt: item.outcomeRequestedAt } : {}),
    ...(item.outcomeSource ? { outcomeSource: item.outcomeSource } : {}),
  };
}

/**
 * Remove stale items (not updated in 30 days) unless hard_dismissed.
 */
function removeStaleItems(items: DecisionMemoryItem[], now = Date.now()): DecisionMemoryItem[] {
  return items.filter((item) => {
    if (item.status === 'hard_dismissed') return true; // keep forever
    return now - item.lastUpdatedAt < STALE_THRESHOLD_MS;
  });
}

// ── Find or Create ───────────────────────────────────────────────────────────

function findOrCreate(
  items: DecisionMemoryItem[],
  decision: Decision,
): { item: DecisionMemoryItem; index: number } {
  const index = items.findIndex((m) => m.decisionId === decision.id);
  if (index >= 0) return { item: { ...items[index] }, index };

  return {
    item: {
      decisionId: decision.id,
      rootCauseKey: decision.rootCauseKey,
      status: 'applied',
      confidence: decision.confidence,
      applyCount: 0,
      dismissCount: 0,
      successCount: 0,
      failCount: 0,
      patternStats: {},
      lastUpdatedAt: Date.now(),
    },
    index: -1,
  };
}

function upsert(items: DecisionMemoryItem[], item: DecisionMemoryItem, index: number): void {
  if (index >= 0) items[index] = item;
  else items.push(item);
}

// ── Recording Actions ────────────────────────────────────────────────────────

export function recordApplied(decision: Decision, context?: DecisionContext): void {
  const items = getDecisionMemory();
  const { item, index } = findOrCreate(items, decision);
  const now = Date.now();

  item.status = 'applied';
  item.lastUpdatedAt = now;
  item.appliedAt = now;
  item.applyCount += 1;
  item.confidence = clamp01(item.confidence + ACTION_APPLY_BOOST);
  item.outcomeRequestedAt = now; // pending outcome starts
  if (context) item.context = context;

  upsert(items, item, index);
  saveDecisionMemory(items);
}

export function recordDismissed(decision: Decision, context?: DecisionContext): void {
  const items = getDecisionMemory();
  const { item, index } = findOrCreate(items, decision);
  const now = Date.now();

  item.status = 'dismissed';
  item.lastUpdatedAt = now;
  item.dismissedAt = now;
  item.dismissCount += 1;
  item.confidence = clamp01(item.confidence - ACTION_DISMISS_DROP);
  if (context) item.context = context;

  upsert(items, item, index);
  saveDecisionMemory(items);
}

export function recordDeferred(decision: Decision, context?: DecisionContext): void {
  const items = getDecisionMemory();
  const { item, index } = findOrCreate(items, decision);
  const now = Date.now();

  item.status = 'deferred';
  item.lastUpdatedAt = now;
  item.deferredAt = now;
  if (context) item.context = context;

  upsert(items, item, index);
  saveDecisionMemory(items);
}

/**
 * Hard dismiss — user says "Bu öneriyi bir daha gösterme" (TASK 10)
 * Decision is permanently blocked for this session store lifetime.
 */
export function hardDismiss(decision: Decision): void {
  const items = getDecisionMemory();
  const { item, index } = findOrCreate(items, decision);
  const now = Date.now();

  item.status = 'hard_dismissed';
  item.lastUpdatedAt = now;
  item.dismissedAt = now;

  upsert(items, item, index);
  saveDecisionMemory(items);
}

// ── Outcome Tracking ─────────────────────────────────────────────────────────

export function recordOutcome(
  decisionId: string,
  result: OutcomeResult,
  source: OutcomeSource = 'user',
  context?: DecisionContext,
): void {
  const items = getDecisionMemory();
  const index = items.findIndex((m) => m.decisionId === decisionId);
  if (index === -1) return;

  const item = { ...items[index] };
  const now = Date.now();

  item.outcome = { result, measuredAt: now, source, context };
  item.outcomeSource = source;
  item.lastUpdatedAt = now;
  item.outcomeRequestedAt = undefined; // resolved

  // Apply learning
  applyOutcomeLearning(item, result);

  // Update pattern stats
  if (item.context) {
    const patternKey = buildPatternKey(item.rootCauseKey, item.context.loadLevel);
    const pattern = item.patternStats[patternKey] ?? { successCount: 0, failCount: 0 };
    if (result === 'success') pattern.successCount += 1;
    if (result === 'failed') pattern.failCount += 1;
    item.patternStats[patternKey] = pattern;
  }

  items[index] = item;
  saveDecisionMemory(items);
}

function applyOutcomeLearning(item: DecisionMemoryItem, result: OutcomeResult): void {
  switch (result) {
    case 'success':
      item.confidence = clamp01(item.confidence + OUTCOME_SUCCESS_BOOST);
      item.successCount += 1;
      break;
    case 'failed':
      item.confidence = clamp01(item.confidence - OUTCOME_FAILED_DROP);
      item.failCount += 1;
      break;
    case 'unknown':
      item.confidence = clamp01(item.confidence - OUTCOME_UNKNOWN_DROP);
      break;
  }
}

// ── Pending Outcomes ─────────────────────────────────────────────────────────

/**
 * Get decisions that were applied but haven't received outcome feedback yet.
 */
export function getPendingOutcomes(memory: DecisionMemoryItem[]): DecisionMemoryItem[] {
  return memory.filter(
    (m) => m.status === 'applied' && m.outcomeRequestedAt != null && !m.outcome,
  );
}

// ── Decay ────────────────────────────────────────────────────────────────────

export function applyDecay(item: DecisionMemoryItem, now = Date.now()): DecisionMemoryItem {
  const elapsed = now - item.lastUpdatedAt;
  if (elapsed < DECAY_INTERVAL_MS) return item;

  const cycles = Math.floor(elapsed / DECAY_INTERVAL_MS);
  const decayFactor = Math.pow(DECAY_RATE, cycles);

  return {
    ...item,
    confidence: clamp01(Math.round(item.confidence * decayFactor * 100) / 100),
  };
}

export function applyDecayToAll(memory: DecisionMemoryItem[], now = Date.now()): DecisionMemoryItem[] {
  let changed = false;
  const result = memory.map((item) => {
    const decayed = applyDecay(item, now);
    if (decayed.confidence !== item.confidence) changed = true;
    return decayed;
  });
  if (changed) saveDecisionMemory(result);
  return result;
}

// ── Cooldown ─────────────────────────────────────────────────────────────────

export function isInCooldown(
  memory: DecisionMemoryItem[],
  decisionId: string,
  now = Date.now(),
): boolean {
  const item = memory.find((m) => m.decisionId === decisionId);
  if (!item) return false;

  // Hard dismissed = permanent cooldown
  if (item.status === 'hard_dismissed') return true;

  const cooldown = COOLDOWN_MAP[item.status] ?? 0;
  const lastActionTime = Math.max(
    item.appliedAt ?? 0,
    item.dismissedAt ?? 0,
    item.deferredAt ?? 0,
  );

  if (lastActionTime === 0) return false;
  return (now - lastActionTime) < cooldown;
}

// ── Generation-Level Blocking (TASK 4) ───────────────────────────────────────

/**
 * Check if a decision should be BLOCKED from generation entirely.
 * This happens BEFORE the decision is even created.
 *
 * Blocked when:
 * - confidence < 0.3 (learned to be weak)
 * - hard_dismissed
 * - hard block: failCount >= 3 AND successCount === 0 (TASK 5)
 */
export function isGenerationBlocked(
  memory: DecisionMemoryItem[],
  decisionId: string,
): boolean {
  const item = memory.find((m) => m.decisionId === decisionId);
  if (!item) return false;

  // Hard dismissed
  if (item.status === 'hard_dismissed') return true;

  // Hard block: repeated failure with no success (TASK 5)
  if (item.failCount >= HARD_BLOCK_FAIL_THRESHOLD && item.successCount === 0) return true;

  // Low confidence block (TASK 4)
  if (item.confidence < GENERATION_BLOCK_THRESHOLD) return true;

  return false;
}

/**
 * Get all decision IDs that should be blocked from generation.
 */
export function getBlockedDecisionIds(memory: DecisionMemoryItem[]): Set<string> {
  const blocked = new Set<string>();
  for (const item of memory) {
    if (item.status === 'hard_dismissed') {
      blocked.add(item.decisionId);
    } else if (item.failCount >= HARD_BLOCK_FAIL_THRESHOLD && item.successCount === 0) {
      blocked.add(item.decisionId);
    } else if (item.confidence < GENERATION_BLOCK_THRESHOLD) {
      blocked.add(item.decisionId);
    }
  }
  return blocked;
}

// ── Root Cause Suppression ───────────────────────────────────────────────────

export function getSuppressedRootCauses(memory: DecisionMemoryItem[]): Set<string> {
  const causeStats = new Map<string, {
    successCount: number;
    failCount: number;
    dismissCount: number;
    hasOutcomeData: boolean;
  }>();

  for (const item of memory) {
    if (item.status === 'hard_dismissed') continue;
    const key = item.rootCauseKey;
    const stats = causeStats.get(key) ?? { successCount: 0, failCount: 0, dismissCount: 0, hasOutcomeData: false };
    stats.successCount += item.successCount;
    stats.failCount += item.failCount;
    stats.dismissCount += item.dismissCount;
    if (item.outcome) stats.hasOutcomeData = true;
    causeStats.set(key, stats);
  }

  const suppressed = new Set<string>();
  for (const [key, stats] of causeStats) {
    if (stats.hasOutcomeData) {
      if (stats.failCount - stats.successCount >= ROOT_CAUSE_SUPPRESS_THRESHOLD) {
        suppressed.add(key);
      }
    } else {
      if (stats.dismissCount >= ROOT_CAUSE_SUPPRESS_THRESHOLD) {
        suppressed.add(key);
      }
    }
  }
  return suppressed;
}

// ── Root Cause Stats ─────────────────────────────────────────────────────────

export interface RootCauseStats {
  successCount: number;
  failCount: number;
  netScore: number;
}

export function getRootCauseStats(
  memory: DecisionMemoryItem[],
  rootCauseKey: string,
): RootCauseStats {
  let s = 0, f = 0;
  for (const item of memory) {
    if (item.rootCauseKey === rootCauseKey) {
      s += item.successCount;
      f += item.failCount;
    }
  }
  return { successCount: s, failCount: f, netScore: s - f };
}

// ── Pattern Learning (TASK 6) ────────────────────────────────────────────────

/**
 * Check if a pattern (rootCauseKey + loadLevel) should be suppressed.
 * Pattern fail >= 2 AND success === 0 → suppress in that context.
 */
export function isPatternSuppressed(
  memory: DecisionMemoryItem[],
  rootCauseKey: string,
  loadLevel: LoadLevel,
): boolean {
  const patternKey = buildPatternKey(rootCauseKey, loadLevel);

  let totalSuccess = 0;
  let totalFail = 0;

  for (const item of memory) {
    const ps = item.patternStats[patternKey];
    if (ps) {
      totalSuccess += ps.successCount;
      totalFail += ps.failCount;
    }
  }

  return totalFail >= 2 && totalSuccess === 0;
}

// ── Priority Adaptation ──────────────────────────────────────────────────────

type DecisionPriority = 'high' | 'medium' | 'low';

const PRIORITY_DOWN: Record<DecisionPriority, DecisionPriority> = {
  high: 'medium', medium: 'low', low: 'low',
};
const PRIORITY_UP: Record<DecisionPriority, DecisionPriority> = {
  low: 'medium', medium: 'high', high: 'high',
};

export function adaptPriority(
  originalPriority: DecisionPriority,
  memory: DecisionMemoryItem[],
  decisionId: string,
): DecisionPriority {
  const item = memory.find((m) => m.decisionId === decisionId);
  if (!item) return originalPriority;

  // TASK 7: Aggressive boosting on strong success
  if (item.successCount >= SUCCESS_BOOST_THRESHOLD) {
    // Double boost
    return PRIORITY_UP[PRIORITY_UP[originalPriority]];
  }

  if (item.successCount >= 2 && item.failCount === 0) {
    return PRIORITY_UP[originalPriority];
  }
  if (item.failCount >= 2 && item.successCount === 0) {
    return PRIORITY_DOWN[originalPriority];
  }

  if (item.applyCount >= APPLY_BOOST_THRESHOLD && item.dismissCount === 0) {
    return PRIORITY_UP[originalPriority];
  }
  if (item.dismissCount >= DISMISS_DROP_THRESHOLD && item.applyCount === 0) {
    return PRIORITY_DOWN[originalPriority];
  }

  return originalPriority;
}

// ── Confidence Adaptation ────────────────────────────────────────────────────

export function adaptConfidence(
  originalConfidence: number,
  memory: DecisionMemoryItem[],
  decisionId: string,
): number {
  const item = memory.find((m) => m.decisionId === decisionId);
  if (!item) return originalConfidence;

  let conf = item.confidence;

  // TASK 7: Aggressive boosting
  if (item.successCount >= SUCCESS_BOOST_THRESHOLD) {
    conf = clamp01(conf + SUCCESS_BOOST_CONFIDENCE);
  }

  return conf;
}

// ── Context-Aware Filtering ──────────────────────────────────────────────────

function isSimilarContext(a?: DecisionContext, b?: DecisionContext): boolean {
  if (!a || !b) return false;
  return a.loadLevel === b.loadLevel;
}

function applyContextLearning(
  decision: Decision,
  memory: DecisionMemoryItem[],
  currentContext: DecisionContext,
): { include: boolean; confidenceAdjust: number } {
  const item = memory.find((m) => m.decisionId === decision.id);
  if (!item || !item.outcome || !item.context) {
    return { include: true, confidenceAdjust: 0 };
  }

  const sameContext = isSimilarContext(item.outcome.context ?? item.context, currentContext);

  if (!sameContext) {
    return { include: true, confidenceAdjust: 0 };
  }

  if (item.outcome.result === 'failed' && item.failCount >= 2) {
    return { include: false, confidenceAdjust: 0 };
  }

  if (item.outcome.result === 'success') {
    return { include: true, confidenceAdjust: 0.1 };
  }

  return { include: true, confidenceAdjust: 0 };
}

// ── Learning Feedback ────────────────────────────────────────────────────────

export function getLearningFeedback(
  memory: DecisionMemoryItem[],
  decisionId: string,
): string | null {
  const item = memory.find((m) => m.decisionId === decisionId);
  if (!item) return null;

  if (item.successCount >= 2 && item.failCount === 0) {
    return 'Bu öneri daha önce işe yaradı.';
  }
  if (item.failCount >= 2 && item.successCount === 0) {
    return 'Bu öneri genelde sonuç vermiyor.';
  }
  if (item.successCount > 0 && item.failCount > 0) {
    const rate = Math.round((item.successCount / (item.successCount + item.failCount)) * 100);
    return `Bu önerinin başarı oranı %${rate}.`;
  }
  if (item.applyCount >= 3 && item.successCount === 0 && item.failCount === 0) {
    return 'Bu öneri birden fazla kez uygulandı, sonuç henüz ölçülmedi.';
  }
  return null;
}

/**
 * Learning stats for UI visibility (TASK 9)
 */
export function getLearningStats(
  memory: DecisionMemoryItem[],
  decisionId: string,
): { successCount: number; failCount: number } | null {
  const item = memory.find((m) => m.decisionId === decisionId);
  if (!item || (item.successCount === 0 && item.failCount === 0)) return null;
  return { successCount: item.successCount, failCount: item.failCount };
}

// ── Memory Pruning ───────────────────────────────────────────────────────────

function pruneMemory(items: DecisionMemoryItem[]): DecisionMemoryItem[] {
  if (items.length <= MAX_ITEMS) return items;
  // Keep hard_dismissed items, prune oldest regular items
  const hardDismissed = items.filter((i) => i.status === 'hard_dismissed');
  const regular = items.filter((i) => i.status !== 'hard_dismissed');
  regular.sort((a, b) => a.lastUpdatedAt - b.lastUpdatedAt);
  const keep = regular.slice(Math.max(0, regular.length - (MAX_ITEMS - hardDismissed.length)));
  return [...hardDismissed, ...keep];
}

// ── Main Integration: applyMemoryToDecisions ─────────────────────────────────

/**
 * Full pipeline V3:
 * 1. Decay
 * 2. Generation block (confidence < 0.3, hard block, hard dismiss)
 * 3. Cooldown
 * 4. Root cause suppression
 * 5. Pattern suppression (context-specific)
 * 6. Context-aware outcome filtering
 * 7. Priority adaptation (outcome-aware + boosting)
 * 8. Confidence adaptation (learned + context boost)
 */
export function applyMemoryToDecisions(
  decisions: Decision[],
  memory: DecisionMemoryItem[],
  currentContext?: DecisionContext,
  now = Date.now(),
): Decision[] {
  const decayedMemory = memory.map((m) => applyDecay(m, now));
  const suppressedCauses = getSuppressedRootCauses(decayedMemory);
  const blockedIds = getBlockedDecisionIds(decayedMemory);

  return decisions
    .filter((d) => {
      // 1. Generation block
      if (blockedIds.has(d.id)) return false;
      // 2. Cooldown
      if (isInCooldown(decayedMemory, d.id, now)) return false;
      // 3. Root cause suppression (high priority bypasses)
      if (d.priority !== 'high' && suppressedCauses.has(d.rootCauseKey)) return false;
      // 4. Pattern suppression
      if (currentContext && d.priority !== 'high') {
        if (isPatternSuppressed(decayedMemory, d.rootCauseKey, currentContext.loadLevel)) return false;
      }
      // 5. Context-aware outcome filtering
      if (currentContext) {
        const { include } = applyContextLearning(d, decayedMemory, currentContext);
        if (!include) return false;
      }
      return true;
    })
    .map((d) => {
      const priority = adaptPriority(d.priority, decayedMemory, d.id);
      let confidence = adaptConfidence(d.confidence, decayedMemory, d.id);
      if (currentContext) {
        const { confidenceAdjust } = applyContextLearning(d, decayedMemory, currentContext);
        confidence = clamp01(confidence + confidenceAdjust);
      }
      return { ...d, priority, confidence };
    });
}

// ── Helpers ──────────────────────────────────────────────────────────────────

function clamp01(v: number): number {
  return Math.max(0, Math.min(1, Math.round(v * 100) / 100));
}
