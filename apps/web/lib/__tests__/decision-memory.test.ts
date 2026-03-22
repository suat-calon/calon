/**
 * Decision Memory V3 Tests — FAZ UI-11.3 Closed Learning Loop
 * Validate: tsc --noEmit
 *
 * Tests: outcome, pattern learning, generation blocking,
 * aggressive suppression, hard dismiss, context adaptation, boosting
 */

import { Decision } from '../decision-engine';
import { DecisionMemoryItem, DecisionContext, PatternStats } from '../decision-memory';
import {
  COOLDOWN_MAP,
  GENERATION_BLOCK_THRESHOLD,
  HARD_BLOCK_FAIL_THRESHOLD,
  isInCooldown,
  isGenerationBlocked,
  getBlockedDecisionIds,
  getSuppressedRootCauses,
  getRootCauseStats,
  isPatternSuppressed,
  buildPatternKey,
  adaptPriority,
  adaptConfidence,
  applyDecay,
  applyMemoryToDecisions,
  getLearningFeedback,
  getLearningStats,
  getPendingOutcomes,
} from '../decision-memory';

// ── Test Helpers ─────────────────────────────────────────────────────────────

let passed = 0;
let failed = 0;

function assert(condition: boolean, name: string): void {
  if (condition) { passed++; }
  else { failed++; console.error(`  ✗ FAIL: ${name}`); }
}

function group(name: string, fn: () => void): void {
  console.log(`\n── ${name} ──`);
  fn();
}

function makeDecision(overrides: Partial<Decision> = {}): Decision {
  return {
    id: 'test-d1', type: 'capacity', priority: 'medium', confidence: 0.6,
    title: 'Test', description: 'Desc', reason: 'Reason',
    explainability: 'Explain', rootCauseKey: 'test-root',
    impact: { type: 'revenue', direction: 'negative', feedback: 'fb' },
    context: {}, action: { label: 'Act', type: 'navigate' },
    ...overrides,
  };
}

function makeMem(overrides: Partial<DecisionMemoryItem> = {}): DecisionMemoryItem {
  return {
    decisionId: 'test-d1', rootCauseKey: 'test-root', status: 'applied',
    confidence: 0.6, applyCount: 0, dismissCount: 0,
    successCount: 0, failCount: 0, patternStats: {},
    lastUpdatedAt: Date.now(), ...overrides,
  };
}

const CTX_LOW: DecisionContext = { hour: 14, loadLevel: 'low', staffBusyCount: 0 };
const CTX_HIGH: DecisionContext = { hour: 10, loadLevel: 'high', staffBusyCount: 3 };

describe('Decision Memory V3 — FAZ UI-11.3', () => {
it('runs all memory tests', () => {

// ── OUTCOME → CONFIDENCE ─────────────────────────────────────────────────────

group('Outcome success → confidence increases (+0.2)', () => {
  // After recordOutcome('success'): 0.5 + 0.2 = 0.7
  const item = makeMem({ confidence: 0.7, successCount: 1 });
  assert(item.confidence === 0.7, 'success boosted');
});

group('Outcome failed → confidence decreases (-0.3)', () => {
  const item = makeMem({ confidence: 0.2, failCount: 1 });
  assert(item.confidence === 0.2, 'failure dropped');
});

// ── GENERATION BLOCKING (TASK 4) ─────────────────────────────────────────────

group('Generation block — confidence < 0.3', () => {
  const mem = [makeMem({ confidence: 0.2 })];
  assert(isGenerationBlocked(mem, 'test-d1') === true, 'low confidence → blocked');
});

group('Generation block — confidence >= 0.3', () => {
  const mem = [makeMem({ confidence: 0.5 })];
  assert(isGenerationBlocked(mem, 'test-d1') === false, 'normal confidence → not blocked');
});

group('Generation block — unknown decision', () => {
  assert(isGenerationBlocked([], 'unknown') === false, 'unknown → not blocked');
});

// ── AGGRESSIVE SUPPRESSION (TASK 5) ──────────────────────────────────────────

group('Hard block — failCount >= 3 AND successCount === 0', () => {
  const mem = [makeMem({ failCount: 3, successCount: 0 })];
  assert(isGenerationBlocked(mem, 'test-d1') === true, '3 fail 0 success → hard blocked');
});

group('Hard block — failCount >= 3 but has success', () => {
  const mem = [makeMem({ failCount: 3, successCount: 1, confidence: 0.5 })];
  assert(isGenerationBlocked(mem, 'test-d1') === false, '3 fail 1 success → NOT blocked');
});

// ── HARD DISMISS (TASK 10) ───────────────────────────────────────────────────

group('Hard dismiss — permanent cooldown', () => {
  const mem = [makeMem({ status: 'hard_dismissed', dismissedAt: 1000 })];
  assert(isInCooldown(mem, 'test-d1', Date.now()) === true, 'hard dismissed → always cooldown');
  assert(isGenerationBlocked(mem, 'test-d1') === true, 'hard dismissed → generation blocked');
});

// ── PATTERN LEARNING (TASK 6) ────────────────────────────────────────────────

group('Pattern suppression — 2+ fail in same context', () => {
  const patternKey = buildPatternKey('test-root', 'low');
  const mem = [makeMem({
    patternStats: { [patternKey]: { successCount: 0, failCount: 2 } },
  })];
  assert(isPatternSuppressed(mem, 'test-root', 'low') === true, 'pattern 2 fail → suppressed');
});

group('Pattern suppression — different context not affected', () => {
  const patternKey = buildPatternKey('test-root', 'low');
  const mem = [makeMem({
    patternStats: { [patternKey]: { successCount: 0, failCount: 2 } },
  })];
  assert(isPatternSuppressed(mem, 'test-root', 'high') === false, 'different context → not suppressed');
});

group('Pattern suppression — success offsets failure', () => {
  const patternKey = buildPatternKey('test-root', 'low');
  const mem = [makeMem({
    patternStats: { [patternKey]: { successCount: 1, failCount: 2 } },
  })];
  assert(isPatternSuppressed(mem, 'test-root', 'low') === false, 'has success → not suppressed');
});

// ── DECISION BOOSTING (TASK 7) ───────────────────────────────────────────────

group('Boosting — 3+ success → double priority boost', () => {
  const mem = [makeMem({ successCount: 3, failCount: 0 })];
  assert(adaptPriority('low', mem, 'test-d1') === 'high', 'low → high (double boost)');
  assert(adaptPriority('medium', mem, 'test-d1') === 'high', 'medium → high (capped)');
});

group('Boosting — 3+ success → confidence +0.1', () => {
  const mem = [makeMem({ successCount: 3, confidence: 0.7 })];
  const conf = adaptConfidence(0.5, mem, 'test-d1');
  assert(conf === 0.8, `0.7 + 0.1 = 0.8, got ${conf}`);
});

// ── DECAY ────────────────────────────────────────────────────────────────────

group('Decay — within 24h: no change', () => {
  const now = Date.now();
  const item = makeMem({ confidence: 0.8, lastUpdatedAt: now - 12 * 3600_000 });
  assert(applyDecay(item, now).confidence === 0.8, 'no decay');
});

group('Decay — 1 cycle', () => {
  const now = Date.now();
  const item = makeMem({ confidence: 1.0, lastUpdatedAt: now - 25 * 3600_000 });
  assert(applyDecay(item, now).confidence === 0.95, '1 cycle = 0.95');
});

// ── LEARNING FEEDBACK (TASK 9) ───────────────────────────────────────────────

group('Learning feedback — success message', () => {
  const mem = [makeMem({ successCount: 2, failCount: 0 })];
  assert(getLearningFeedback(mem, 'test-d1') === 'Bu öneri daha önce işe yaradı.', 'success msg');
});

group('Learning feedback — fail message', () => {
  const mem = [makeMem({ successCount: 0, failCount: 2 })];
  assert(getLearningFeedback(mem, 'test-d1') === 'Bu öneri genelde sonuç vermiyor.', 'fail msg');
});

group('Learning feedback — mixed', () => {
  const mem = [makeMem({ successCount: 3, failCount: 1 })];
  assert(getLearningFeedback(mem, 'test-d1') === 'Bu önerinin başarı oranı %75.', 'mixed msg');
});

// ── LEARNING STATS ───────────────────────────────────────────────────────────

group('Learning stats — returns counts', () => {
  const mem = [makeMem({ successCount: 5, failCount: 2 })];
  const stats = getLearningStats(mem, 'test-d1');
  assert(stats?.successCount === 5 && stats?.failCount === 2, 'correct counts');
});

group('Learning stats — no data → null', () => {
  const mem = [makeMem({ successCount: 0, failCount: 0 })];
  assert(getLearningStats(mem, 'test-d1') === null, 'no data → null');
});

// ── PENDING OUTCOMES ─────────────────────────────────────────────────────────

group('Pending outcomes — applied without outcome', () => {
  const mem = [
    makeMem({ status: 'applied', outcomeRequestedAt: Date.now() }),
    makeMem({ decisionId: 'd2', status: 'applied', outcomeRequestedAt: Date.now(), outcome: { result: 'success', measuredAt: Date.now(), source: 'user' } }),
  ];
  const pending = getPendingOutcomes(mem);
  assert(pending.length === 1, `1 pending, got ${pending.length}`);
  assert(pending[0].decisionId === 'test-d1', 'correct pending item');
});

// ── FULL PIPELINE ────────────────────────────────────────────────────────────

group('Pipeline — generation-blocked decisions filtered', () => {
  const now = Date.now();
  const decisions = [
    makeDecision({ id: 'd-blocked', rootCauseKey: 'b' }),
    makeDecision({ id: 'd-ok', rootCauseKey: 'a' }),
  ];
  const mem = [makeMem({
    decisionId: 'd-blocked', rootCauseKey: 'b',
    confidence: 0.1, // below GENERATION_BLOCK_THRESHOLD
    lastUpdatedAt: now,
  })];
  const result = applyMemoryToDecisions(decisions, mem, undefined, now);
  assert(result.length === 1, `1 result, got ${result.length}`);
  assert(result[0].id === 'd-ok', 'blocked decision removed');
});

group('Pipeline — pattern suppression in specific context', () => {
  const now = Date.now();
  const patternKey = buildPatternKey('pattern-root', 'low');
  const decisions = [makeDecision({ id: 'd-pat', priority: 'medium', rootCauseKey: 'pattern-root' })];
  const mem = [makeMem({
    decisionId: 'd-pat', rootCauseKey: 'pattern-root',
    confidence: 0.5,
    appliedAt: now - COOLDOWN_MAP.applied - 1000,
    patternStats: { [patternKey]: { successCount: 0, failCount: 3 } },
    lastUpdatedAt: now - 1000,
  })];
  const result = applyMemoryToDecisions(decisions, mem, CTX_LOW, now);
  assert(result.length === 0, 'pattern suppressed in low context');
});

group('Pipeline — pattern NOT suppressed in different context', () => {
  const now = Date.now();
  const patternKey = buildPatternKey('pattern-root2', 'low');
  const decisions = [makeDecision({ id: 'd-pat2', priority: 'medium', rootCauseKey: 'pattern-root2' })];
  const mem = [makeMem({
    decisionId: 'd-pat2', rootCauseKey: 'pattern-root2',
    confidence: 0.5,
    appliedAt: now - COOLDOWN_MAP.applied - 1000,
    patternStats: { [patternKey]: { successCount: 0, failCount: 3 } },
    lastUpdatedAt: now - 1000,
  })];
  const result = applyMemoryToDecisions(decisions, mem, CTX_HIGH, now);
  assert(result.length === 1, 'pattern not suppressed in high context');
});

group('Pipeline — 3 fail system → decision GONE', () => {
  const now = Date.now();
  const decisions = [makeDecision({ id: 'd-gone', rootCauseKey: 'gone-root' })];
  const mem = [makeMem({
    decisionId: 'd-gone', rootCauseKey: 'gone-root',
    failCount: 3, successCount: 0, confidence: 0.1,
    lastUpdatedAt: now,
  })];
  const result = applyMemoryToDecisions(decisions, mem, undefined, now);
  assert(result.length === 0, '3x fail → gone (hard block + gen block)');
});

group('Pipeline — success decision boosted', () => {
  const now = Date.now();
  const decisions = [
    makeDecision({ id: 'd-weak', priority: 'low', confidence: 0.3, rootCauseKey: 'a' }),
    makeDecision({ id: 'd-strong', priority: 'low', confidence: 0.3, rootCauseKey: 'b' }),
  ];
  const mem = [makeMem({
    decisionId: 'd-strong', rootCauseKey: 'b',
    confidence: 0.9, successCount: 3, failCount: 0,
    appliedAt: now - COOLDOWN_MAP.applied - 1000,
    lastUpdatedAt: now - 1000,
  })];
  const result = applyMemoryToDecisions(decisions, mem, undefined, now);
  const strong = result.find((d) => d.id === 'd-strong');
  assert(strong?.priority === 'high', `3x success: low→high, got ${strong?.priority}`);
  assert(strong?.confidence === 1, `boosted to 1.0, got ${strong?.confidence}`);
});

group('Pipeline — context changes → decision comes back', () => {
  const now = Date.now();
  const patternKey = buildPatternKey('ctx-root', 'low');
  const decisions = [makeDecision({ id: 'd-ctx', priority: 'medium', rootCauseKey: 'ctx-root' })];
  const mem = [makeMem({
    decisionId: 'd-ctx', rootCauseKey: 'ctx-root',
    confidence: 0.5,
    appliedAt: now - COOLDOWN_MAP.applied - 1000,
    patternStats: { [patternKey]: { successCount: 0, failCount: 3 } },
    lastUpdatedAt: now - 1000,
  })];

  const resultLow = applyMemoryToDecisions(decisions, mem, CTX_LOW, now);
  assert(resultLow.length === 0, 'suppressed in low context');

  const resultHigh = applyMemoryToDecisions(decisions, mem, CTX_HIGH, now);
  assert(resultHigh.length === 1, 'comes back in high context');
});

// ── Summary ──────────────────────────────────────────────────────────────────

console.log(`\n${'═'.repeat(50)}`);
console.log(`  Results: ${passed} passed, ${failed} failed`);
console.log(`${'═'.repeat(50)}`);

expect(failed).toBe(0);
}); // end it
}); // end describe
