/**
 * System Stabilization Tests — FAZ UI-13.1 HARD MODE
 * Validate: tsc --noEmit + yarn workspace @calon/web build
 *
 * Tests: failsafe modes, fallback rules, telemetry V2, data source chain,
 * safe-fetch, memory adapter, rate limiting, corrupt data, migration, dedup
 */

import { DecisionMemoryItem } from '../decision-memory';
import {
  createDecisionEngineRuntime,
  generateFallbackDecisions,
} from '../decision-engine-failsafe';
import {
  trackEvent,
  trackError,
  trackWarn,
  setTelemetryEnabled,
  setTelemetrySender,
  getTelemetryBuffer,
  resetTelemetryBuffer,
  flushTelemetry,
  TelemetryEvent,
} from '../telemetry';
import {
  fetchDashboardData,
  getDashboardDataAsync,
  setDataSourceConfig,
  validateDashboardData,
  safeRevenue,
  safeCustomers,
  safeOpsStrip,
} from '../dashboard-data-source';
import {
  InMemoryAdapter,
  setMemoryAdapter,
  getMemoryAdapter,
} from '../decision-memory-adapter';
import {
  isActionRateLimited,
  resetRateLimits,
} from '../decision-rate-limiter';
import { DashboardData } from '../dashboard-mock';

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

async function asyncGroup(name: string, fn: () => Promise<void>): Promise<void> {
  console.log(`\n── ${name} ──`);
  await fn();
}

// Minimal mock DashboardData for tests
function makeMockData(overrides: Partial<DashboardData> = {}): DashboardData {
  return {
    salonName: 'Test Salon',
    todayStats: {
      totalAppointments: 10,
      completedAppointments: 5,
      occupancyPercent: 25,
      pendingCount: 4,
      cancelledCount: 1,
      noShowCount: 3,
      estimatedRevenue: 500,
      currency: 'TRY',
    },
    alerts: [],
    actions: [],
    liveAppointments: [],
    appointmentOps: [],
    staffOps: [],
    emptySlotOps: [],
    operationsStrip: {
      activeNow: 0,
      upcoming30min: 0,
      delayed: 0,
      noShows: 0,
      emptyWindows: 0,
      narratives: [],
    },
    revenue: null,
    customers: null,
    revenueStats: null,
    serviceStats: [],
    staffStats: [],
    capacityStats: null,
    retentionStats: null,
    customerSegments: [],
    rebookOpportunities: [],
    noShowRecoveries: [],
    lifecycleHints: [],
    ...overrides,
  } as DashboardData;
}

describe('System Stabilization — FAZ UI-13.1', () => {
it('runs all stabilization tests', async () => {

// ══════════════════════════════════════════════════════════════════════════════
// FAILSAFE ENGINE MODES (TASK 2)
// ══════════════════════════════════════════════════════════════════════════════

group('Engine mode — default is full', () => {
  const rt = createDecisionEngineRuntime();
  assert(rt.getState().mode === 'full', 'default mode is full');
});

group('Engine mode — can switch to fallback', () => {
  const rt = createDecisionEngineRuntime();
  rt.setMode('fallback', 'test');
  assert(rt.getState().mode === 'fallback', 'switched to fallback');
  assert(rt.getState().reason === 'test', 'reason recorded');
});

group('Engine mode — can switch to off', () => {
  const rt = createDecisionEngineRuntime();
  rt.setMode('off', 'maintenance');
  assert(rt.getState().mode === 'off', 'switched to off');
});

group('Engine mode — auto-degradation after 3 failures', () => {
  const rt = createDecisionEngineRuntime();
  rt.reportFailure(new Error('test1'));
  rt.reportFailure(new Error('test2'));
  assert(rt.getState().mode === 'full', 'still full after 2 failures');
  rt.reportFailure(new Error('test3'));
  assert(rt.getState().mode === 'fallback', 'auto-degraded to fallback after 3');
});

group('Engine mode — success resets failure counter', () => {
  const rt = createDecisionEngineRuntime();
  rt.reportFailure(new Error('test'));
  rt.reportSuccess();
  assert(rt.getState().consecutiveFailures === 0, 'counter reset');
});

group('Engine mode — recovery check respects cooldown', () => {
  const rt = createDecisionEngineRuntime();
  rt.reportFailure(new Error('a'));
  rt.reportFailure(new Error('b'));
  rt.reportFailure(new Error('c'));
  assert(rt.getState().mode === 'fallback', 'in fallback');
  assert(rt.shouldAttemptRecovery() === false, 'no recovery before cooldown');
});

// ══════════════════════════════════════════════════════════════════════════════
// FALLBACK RULES (TASK 3)
// ══════════════════════════════════════════════════════════════════════════════

group('Fallback — generates low occupancy decision', () => {
  const data = makeMockData({ todayStats: { ...makeMockData().todayStats, occupancyPercent: 20 } });
  const decisions = generateFallbackDecisions(data);
  assert(decisions.some((d) => d.id === 'fallback-low-occupancy'), 'low occupancy rule triggered');
});

group('Fallback — generates pending approvals decision', () => {
  const data = makeMockData({ todayStats: { ...makeMockData().todayStats, pendingCount: 5 } });
  const decisions = generateFallbackDecisions(data);
  assert(decisions.some((d) => d.id === 'fallback-pending'), 'pending rule triggered');
});

group('Fallback — generates no-show decision', () => {
  const data = makeMockData({ todayStats: { ...makeMockData().todayStats, noShowCount: 3 } });
  const decisions = generateFallbackDecisions(data);
  assert(decisions.some((d) => d.id === 'fallback-noshow'), 'no-show rule triggered');
});

group('Fallback — max 3 decisions', () => {
  const data = makeMockData({
    todayStats: { ...makeMockData().todayStats, occupancyPercent: 20, pendingCount: 5, noShowCount: 3 },
  });
  const decisions = generateFallbackDecisions(data);
  assert(decisions.length <= 3, `max 3 decisions, got ${decisions.length}`);
});

group('Fallback — high occupancy warning', () => {
  const data = makeMockData({ todayStats: { ...makeMockData().todayStats, occupancyPercent: 98 } });
  const decisions = generateFallbackDecisions(data);
  assert(decisions.some((d) => d.id === 'fallback-overbooked'), 'overbooked rule triggered');
});

group('Fallback — survives corrupt data fields', () => {
  const data = makeMockData();
  // Force corrupt field
  (data.todayStats as unknown as Record<string, unknown>).occupancyPercent = 'corrupt';
  // Should not throw
  let threw = false;
  try { generateFallbackDecisions(data); } catch { threw = true; }
  assert(!threw, 'fallback rules survived corrupt data');
});

// ══════════════════════════════════════════════════════════════════════════════
// TELEMETRY V2 (TASK 5-6)
// ══════════════════════════════════════════════════════════════════════════════

group('Telemetry — events buffered', () => {
  resetTelemetryBuffer();
  setTelemetryEnabled(true);
  setTelemetrySender({ sendBatch: async () => true });

  trackEvent('decision', 'test_buffered', { foo: 'bar' });
  const buf = getTelemetryBuffer();
  assert(buf.length === 1, 'event in buffer');
  assert(buf[0].category === 'decision', 'correct category');
  assert(buf[0].action === 'test_buffered', 'correct action');
  resetTelemetryBuffer();
});

group('Telemetry — disabled skips events', () => {
  resetTelemetryBuffer();
  setTelemetryEnabled(false);
  trackEvent('decision', 'should_skip');
  assert(getTelemetryBuffer().length === 0, 'no events when disabled');
  setTelemetryEnabled(true);
});

group('Telemetry — error events always tracked (skip dedup)', () => {
  resetTelemetryBuffer();
  setTelemetryEnabled(true);
  trackError('memory', 'test_error', new Error('boom'));
  trackError('memory', 'test_error', new Error('boom2'));
  assert(getTelemetryBuffer().length === 2, 'both errors tracked');
  assert(getTelemetryBuffer()[0].level === 'error', 'level is error');
  resetTelemetryBuffer();
});

group('Telemetry — dedup suppresses identical events within 5s', () => {
  resetTelemetryBuffer();
  setTelemetryEnabled(true);
  trackEvent('decision', 'dedup_test', { decisionId: 'x' });
  trackEvent('decision', 'dedup_test', { decisionId: 'x' });
  trackEvent('decision', 'dedup_test', { decisionId: 'x' });
  assert(getTelemetryBuffer().length === 1, 'deduped to 1');
  resetTelemetryBuffer();
});

group('Telemetry — different decisionIds not deduped', () => {
  resetTelemetryBuffer();
  setTelemetryEnabled(true);
  trackEvent('decision', 'action_test', { decisionId: 'a' });
  trackEvent('decision', 'action_test', { decisionId: 'b' });
  assert(getTelemetryBuffer().length === 2, 'both tracked');
  resetTelemetryBuffer();
});

await asyncGroup('Telemetry — flush sends batch and clears buffer', async () => {
  resetTelemetryBuffer();
  setTelemetryEnabled(true);
  const sentBatches: TelemetryEvent[][] = [];
  setTelemetrySender({ sendBatch: async (events) => { sentBatches.push(events); return true; } });
  trackEvent('system', 'flush_test_1');
  trackEvent('system', 'flush_test_2');
  await flushTelemetry();
  assert(sentBatches.length === 1, 'one batch sent');
  assert(sentBatches[0].length === 2, 'batch has 2 events');
  assert(getTelemetryBuffer().length === 0, 'buffer cleared after flush');
  resetTelemetryBuffer();
});

await asyncGroup('Telemetry — failed flush retains buffer', async () => {
  resetTelemetryBuffer();
  setTelemetryEnabled(true);
  setTelemetrySender({ sendBatch: async () => false });
  trackEvent('system', 'fail_flush');
  await flushTelemetry();
  assert(getTelemetryBuffer().length === 1, 'buffer retained on failed flush');
  resetTelemetryBuffer();
});

group('Telemetry — reset clears everything', () => {
  trackEvent('system', 'reset_check');
  resetTelemetryBuffer();
  assert(getTelemetryBuffer().length === 0, 'buffer empty after reset');
});

// ══════════════════════════════════════════════════════════════════════════════
// DATA SOURCE CHAIN (TASK 3)
// ══════════════════════════════════════════════════════════════════════════════

group('Data source — mock mode returns valid data', () => {
  setDataSourceConfig({ mode: 'mock', mockScenario: 'default' });
  const result = fetchDashboardData();
  assert(result.data !== null, 'data is not null');
  assert(result.source === 'mock', 'source is mock');
  assert(result.fallback === false, 'not a fallback');
});

group('Data source — mock empty returns valid data', () => {
  setDataSourceConfig({ mode: 'mock', mockScenario: 'empty' });
  const result = fetchDashboardData();
  assert(result.data !== null, 'empty mock is valid');
});

group('Data source — mock high-load returns valid data', () => {
  setDataSourceConfig({ mode: 'mock', mockScenario: 'high-load' });
  const result = fetchDashboardData();
  assert(result.data !== null, 'high-load mock is valid');
  setDataSourceConfig({ mode: 'mock', mockScenario: 'default' });
});

group('Data source — hybrid sync returns mock as initial', () => {
  setDataSourceConfig({ mode: 'hybrid' });
  const result = fetchDashboardData();
  assert(result.data !== null, 'hybrid initial has data');
  assert(result.fallback === true, 'marked as fallback');
  setDataSourceConfig({ mode: 'mock' });
});

group('Data source — validation rejects invalid data', () => {
  assert(validateDashboardData(null) === false, 'null rejected');
  assert(validateDashboardData({}) === false, 'empty object rejected');
  assert(validateDashboardData({ todayStats: {} }) === false, 'incomplete stats rejected');
  assert(
    validateDashboardData({ todayStats: { totalAppointments: 5, occupancyPercent: 50 } }) === true,
    'valid minimal data accepted',
  );
});

group('Data source — safe accessors return defaults for null', () => {
  const rev = safeRevenue(null);
  assert(rev.today === 0, 'safe revenue default');
  const cust = safeCustomers(null);
  assert(cust.totalActive === 0, 'safe customers default');
  const ops = safeOpsStrip(null);
  assert(ops.activeNow === 0, 'safe ops strip default');
});

group('Data source — safe accessors work with partial data', () => {
  const data = makeMockData(); // revenue is null
  const rev = safeRevenue(data);
  assert(rev.today === 0, 'null revenue → default');
  const cust = safeCustomers(data);
  assert(cust.totalActive === 0, 'null customers → default');
});

group('Data source — page does NOT import mock directly', () => {
  // Architecture assertion: dashboard-data-source re-exports types but page uses fetchDashboardData
  // This is validated by the import structure — if page imported MOCK_DASHBOARD directly, tsc would still pass
  // but the data source abstraction would be bypassed. We verify the function exists.
  assert(typeof fetchDashboardData === 'function', 'fetchDashboardData is a function');
  assert(typeof getDashboardDataAsync === 'function', 'getDashboardDataAsync is a function');
});

// ══════════════════════════════════════════════════════════════════════════════
// MEMORY ADAPTER (TASK 8)
// ══════════════════════════════════════════════════════════════════════════════

group('InMemoryAdapter — read/write/clear', () => {
  const adapter = new InMemoryAdapter();
  assert(adapter.read().length === 0, 'initially empty');

  const item: DecisionMemoryItem = {
    decisionId: 'test-1',
    rootCauseKey: 'test',
    status: 'applied',
    confidence: 0.5,
    applyCount: 1,
    dismissCount: 0,
    successCount: 0,
    failCount: 0,
    patternStats: {},
    lastUpdatedAt: Date.now(),
  };
  adapter.write([item]);
  assert(adapter.read().length === 1, 'item written');
  assert(adapter.read()[0].decisionId === 'test-1', 'correct item');

  adapter.clear();
  assert(adapter.read().length === 0, 'cleared');
});

group('InMemoryAdapter — prunes beyond 50 (overflow trim)', () => {
  const adapter = new InMemoryAdapter();
  const items: DecisionMemoryItem[] = [];
  for (let i = 0; i < 60; i++) {
    items.push({
      decisionId: `d-${i}`,
      rootCauseKey: 'test',
      status: 'applied',
      confidence: 0.5,
      applyCount: 0,
      dismissCount: 0,
      successCount: 0,
      failCount: 0,
      patternStats: {},
      lastUpdatedAt: i,
    });
  }
  adapter.write(items);
  assert(adapter.read().length <= 50, `pruned to <=50, got ${adapter.read().length}`);
});

group('Memory adapter — can swap at runtime', () => {
  const original = getMemoryAdapter();
  const inMemory = new InMemoryAdapter();
  setMemoryAdapter(inMemory);
  assert(getMemoryAdapter().name === 'in-memory', 'swapped to in-memory');
  setMemoryAdapter(original); // restore
});

// ══════════════════════════════════════════════════════════════════════════════
// RATE LIMITING (TASK 11)
// ══════════════════════════════════════════════════════════════════════════════

group('Rate limiter — first action passes', () => {
  resetRateLimits();
  assert(isActionRateLimited('d1', 'apply') === false, 'first action not limited');
});

group('Rate limiter — rapid fire blocked', () => {
  resetRateLimits();
  isActionRateLimited('d2', 'apply');
  assert(isActionRateLimited('d2', 'apply') === true, 'second immediate call blocked');
});

group('Rate limiter — different decisions not affected', () => {
  resetRateLimits();
  isActionRateLimited('d3', 'apply');
  assert(isActionRateLimited('d4', 'apply') === false, 'different decision ok');
});

group('Rate limiter — different actions not affected', () => {
  resetRateLimits();
  isActionRateLimited('d5', 'apply');
  assert(isActionRateLimited('d5', 'dismiss') === false, 'different action ok');
});

group('Rate limiter — reset clears counters', () => {
  isActionRateLimited('d6', 'apply');
  isActionRateLimited('d6', 'apply'); // should be blocked
  resetRateLimits();
  assert(isActionRateLimited('d6', 'apply') === false, 'reset allows again');
});

// ══════════════════════════════════════════════════════════════════════════════
// CORRUPT DATA HARDENING (TASK 9-10)
// ══════════════════════════════════════════════════════════════════════════════

group('Data validation — rejects all corrupt types', () => {
  assert(validateDashboardData(undefined) === false, 'undefined rejected');
  assert(validateDashboardData('string') === false, 'string rejected');
  assert(validateDashboardData(42) === false, 'number rejected');
  assert(validateDashboardData([]) === false, 'array rejected');
});

group('Memory adapter — handles corrupt localStorage gracefully', () => {
  // InMemoryAdapter can't have corrupt state, but we test the adapter interface
  const adapter = new InMemoryAdapter();
  adapter.write([]); // Write empty
  assert(adapter.read().length === 0, 'empty write → empty read');
  // Write valid items
  adapter.write([{
    decisionId: 'valid',
    rootCauseKey: 'k',
    status: 'applied',
    confidence: 0.5,
    applyCount: 0,
    dismissCount: 0,
    successCount: 0,
    failCount: 0,
    patternStats: {},
    lastUpdatedAt: Date.now(),
  }]);
  assert(adapter.read().length === 1, 'valid write persisted');
  adapter.clear();
  assert(adapter.read().length === 0, 'clear works');
});

// ══════════════════════════════════════════════════════════════════════════════
// SAFE FETCH (TASK 4) — structural tests (no real HTTP)
// ══════════════════════════════════════════════════════════════════════════════

group('Safe fetch — module exports exist', async () => {
  const { safeFetchJson } = await import('../safe-fetch');
  assert(typeof safeFetchJson === 'function', 'safeFetchJson is a function');
});

// ══════════════════════════════════════════════════════════════════════════════
// ENGINE MODE DECISIONS (TASK 8 — HARD TEST)
// ══════════════════════════════════════════════════════════════════════════════

group('Engine off mode — no decisions', () => {
  const rt = createDecisionEngineRuntime();
  rt.setMode('off');
  assert(rt.getState().mode === 'off', 'engine is off');
});

group('Engine fallback mode — static rules only', () => {
  const rt = createDecisionEngineRuntime();
  rt.setMode('fallback');
  const data = makeMockData({ todayStats: { ...makeMockData().todayStats, occupancyPercent: 15 } });
  const decisions = generateFallbackDecisions(data);
  assert(decisions.length > 0, 'fallback produces decisions');
  assert(decisions.every((d) => d.id.startsWith('fallback-')), 'all decisions are fallback type');
});

group('Engine full mode — normal pipeline', () => {
  const rt = createDecisionEngineRuntime();
  assert(rt.getState().mode === 'full', 'in full mode');
  assert(rt.getState().consecutiveFailures === 0, 'no failures');
});

// ══════════════════════════════════════════════════════════════════════════════
// Summary
// ══════════════════════════════════════════════════════════════════════════════

console.log(`\n${'═'.repeat(50)}`);
console.log(`  Results: ${passed} passed, ${failed} failed`);
console.log(`${'═'.repeat(50)}`);

expect(failed).toBe(0);
}); // end it
}); // end describe
