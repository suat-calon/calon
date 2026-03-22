/**
 * Decision Engine V2 — Tests
 * FAZ UI-11.1: Grouping, conflict resolution, confidence, action payloads
 */

import { describe, it, expect } from 'vitest';
import {
  generateDecisions,
  groupByRootCause,
  resolveConflicts,
  calculateConfidence,
  type Decision,
} from './decision-engine';
import {
  MOCK_DASHBOARD,
  MOCK_EMPTY,
  MOCK_HIGH_LOAD,
  MOCK_NULL_PARTIAL,
  type DashboardData,
} from './dashboard-mock';

// ── Helper: create test data from base ──────────────────────────────────────

function makeData(overrides: Partial<DashboardData>): DashboardData {
  return { ...MOCK_DASHBOARD, ...overrides };
}

// ── 1. Grouping ──────────────────────────────────────────────────────────────

describe('groupByRootCause', () => {
  it('groups decisions with same rootCauseKey into one', () => {
    const decisions: Decision[] = [
      makeFakeDecision({ id: 'a', rootCauseKey: 'low-capacity', confidence: 0.8, priority: 'high' }),
      makeFakeDecision({ id: 'b', rootCauseKey: 'low-capacity', confidence: 0.5, priority: 'medium' }),
      makeFakeDecision({ id: 'c', rootCauseKey: 'no-show-risk', confidence: 0.7, priority: 'high' }),
    ];

    const result = groupByRootCause(decisions);
    expect(result).toHaveLength(2);

    // low-capacity group: 'a' wins (higher confidence)
    const lcGroup = result.find((d) => d.rootCauseKey === 'low-capacity');
    expect(lcGroup?.id).toBe('a');
    // Should contain merged description
    expect(lcGroup?.description).toContain('Ayrıca:');
  });

  it('returns individual decisions for unique rootCauseKeys', () => {
    const decisions: Decision[] = [
      makeFakeDecision({ id: 'a', rootCauseKey: 'low-capacity' }),
      makeFakeDecision({ id: 'b', rootCauseKey: 'no-show-risk' }),
      makeFakeDecision({ id: 'c', rootCauseKey: 'service-concentration' }),
    ];

    const result = groupByRootCause(decisions);
    expect(result).toHaveLength(3);
  });
});

// ── 2. Conflict Resolution ───────────────────────────────────────────────────

describe('resolveConflicts', () => {
  it('removes lower confidence conflicting decision', () => {
    const decisions: Decision[] = [
      makeFakeDecision({ id: 'low', rootCauseKey: 'low-capacity', confidence: 0.6 }),
      makeFakeDecision({ id: 'high', rootCauseKey: 'high-capacity', confidence: 0.9 }),
    ];

    const result = resolveConflicts(decisions);
    expect(result).toHaveLength(1);
    expect(result[0].id).toBe('high');
  });

  it('keeps both when no conflict exists', () => {
    const decisions: Decision[] = [
      makeFakeDecision({ id: 'a', rootCauseKey: 'low-capacity', confidence: 0.8 }),
      makeFakeDecision({ id: 'b', rootCauseKey: 'no-show-risk', confidence: 0.7 }),
    ];

    const result = resolveConflicts(decisions);
    expect(result).toHaveLength(2);
  });
});

// ── 3. Confidence Calculation ────────────────────────────────────────────────

describe('calculateConfidence', () => {
  it('returns deterministic value between 0 and 1', () => {
    const c1 = calculateConfidence({ dataCompleteness: 1, signalStrength: 0.5, corroboration: 0.5 });
    const c2 = calculateConfidence({ dataCompleteness: 1, signalStrength: 0.5, corroboration: 0.5 });
    expect(c1).toBe(c2);
    expect(c1).toBeGreaterThanOrEqual(0);
    expect(c1).toBeLessThanOrEqual(1);
  });

  it('higher signals produce higher confidence', () => {
    const low = calculateConfidence({ dataCompleteness: 0.5, signalStrength: 0.2, corroboration: 0 });
    const high = calculateConfidence({ dataCompleteness: 1, signalStrength: 0.9, corroboration: 0.8 });
    expect(high).toBeGreaterThan(low);
  });

  it('weights signal strength most heavily (50%)', () => {
    const onlySignal = calculateConfidence({ dataCompleteness: 0, signalStrength: 1, corroboration: 0 });
    expect(onlySignal).toBe(0.5);
  });
});

// ── 4. Action Payloads ───────────────────────────────────────────────────────

describe('action payload precision', () => {
  it('capacity gap includes specific hours in filters', () => {
    const lowCapData = makeData({
      todayStats: { ...MOCK_DASHBOARD.todayStats, occupancyPercent: 30 },
      capacityStats: {
        overallOccupancy: 30,
        hourSlots: [
          { hour: 9, occupancy: 80, appointments: 2 },
          { hour: 10, occupancy: 0, appointments: 0 },
          { hour: 11, occupancy: 0, appointments: 0 },
          { hour: 12, occupancy: 0, appointments: 0 },
        ],
        busiestHours: ['09:00'],
        emptiestHours: ['10:00', '11:00', '12:00'],
      },
    });

    const decisions = generateDecisions(lowCapData);
    const capDecision = decisions.find((d) => d.id === 'decision-capacity-gap');

    if (capDecision) {
      expect(capDecision.action.payload).toBeDefined();
      expect(capDecision.action.payload?.filters).toBeDefined();
      expect(capDecision.action.payload?.filters?.hours).toBeDefined();
      expect(capDecision.action.payload?.filters?.emptyOnly).toBe(true);
    }
  });
});

// ── 5. Applied/Dismissed/Deferred State ──────────────────────────────────────

describe('state filtering', () => {
  it('decisions can be filtered by dismissed set', () => {
    const decisions = generateDecisions(MOCK_DASHBOARD);
    const dismissed = new Set([decisions[0]?.id].filter(Boolean));
    const filtered = decisions.filter((d) => !dismissed.has(d.id));
    expect(filtered.length).toBeLessThan(decisions.length);
  });
});

// ── 6. Empty Scenario ────────────────────────────────────────────────────────

describe('empty scenario', () => {
  it('produces zero decisions for empty data', () => {
    const decisions = generateDecisions(MOCK_EMPTY);
    expect(decisions).toHaveLength(0);
  });
});

// ── 7. Mixed Scenario ────────────────────────────────────────────────────────

describe('main scenario (MOCK_DASHBOARD)', () => {
  it('produces at most 3 decisions', () => {
    const decisions = generateDecisions(MOCK_DASHBOARD);
    expect(decisions.length).toBeLessThanOrEqual(3);
    expect(decisions.length).toBeGreaterThan(0);
  });

  it('decisions are sorted by priority (high first)', () => {
    const decisions = generateDecisions(MOCK_DASHBOARD);
    const priorityOrder: Record<string, number> = { high: 0, medium: 1, low: 2 };
    for (let i = 1; i < decisions.length; i++) {
      expect(priorityOrder[decisions[i].priority]).toBeGreaterThanOrEqual(
        priorityOrder[decisions[i - 1].priority],
      );
    }
  });

  it('no two decisions share the same rootCauseKey', () => {
    const decisions = generateDecisions(MOCK_DASHBOARD);
    const keys = decisions.map((d) => d.rootCauseKey);
    expect(new Set(keys).size).toBe(keys.length);
  });

  it('every decision has non-empty action label', () => {
    const decisions = generateDecisions(MOCK_DASHBOARD);
    for (const d of decisions) {
      expect(d.action.label.length).toBeGreaterThan(0);
    }
  });

  it('every decision has explainability text', () => {
    const decisions = generateDecisions(MOCK_DASHBOARD);
    for (const d of decisions) {
      expect(d.explainability.length).toBeGreaterThan(0);
    }
  });

  it('every decision has impact feedback', () => {
    const decisions = generateDecisions(MOCK_DASHBOARD);
    for (const d of decisions) {
      expect(d.impact.feedback.length).toBeGreaterThan(0);
    }
  });
});

// ── 8. High Load Scenario ────────────────────────────────────────────────────

describe('high load scenario (MOCK_HIGH_LOAD)', () => {
  it('produces decisions without errors', () => {
    const decisions = generateDecisions(MOCK_HIGH_LOAD);
    expect(decisions.length).toBeLessThanOrEqual(3);
  });

  it('does not produce conflicting low-capacity + high-capacity', () => {
    const decisions = generateDecisions(MOCK_HIGH_LOAD);
    const keys = decisions.map((d) => d.rootCauseKey);
    const hasLow = keys.includes('low-capacity');
    const hasHigh = keys.includes('high-capacity');
    expect(hasLow && hasHigh).toBe(false);
  });
});

// ── 9. Null/Partial Scenario ─────────────────────────────────────────────────

describe('null/partial scenario (MOCK_NULL_PARTIAL)', () => {
  it('handles null revenue/capacity gracefully', () => {
    const decisions = generateDecisions(MOCK_NULL_PARTIAL);
    // Should not throw, may produce 0 or few decisions
    expect(decisions.length).toBeLessThanOrEqual(3);
  });
});

// ── Test Helper ──────────────────────────────────────────────────────────────

function makeFakeDecision(overrides: Partial<Decision>): Decision {
  return {
    id: 'test-decision',
    type: 'capacity',
    priority: 'medium',
    confidence: 0.5,
    title: 'Test decision',
    description: 'Test description',
    reason: 'Test reason',
    explainability: 'Test explainability',
    rootCauseKey: 'test-root',
    impact: {
      type: 'revenue',
      direction: 'negative',
      feedback: 'Test feedback',
    },
    context: {},
    action: {
      label: 'Test action',
      type: 'navigate',
      payload: { route: '/test' },
    },
    ...overrides,
  };
}
