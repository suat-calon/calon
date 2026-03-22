/**
 * Chaos Engineering — Controlled Crash & Failure Simulation
 * FAZ UI-13.2: Stress + torture testing for production readiness
 *
 * Dev-only module. Never imported in production code paths.
 * Used by debug controls and chaos test suite.
 */

import { setTelemetrySender, type TelemetrySender, type TelemetryEvent } from './telemetry';
import type { DecisionEngineRuntime } from './decision-engine-failsafe';
import { setMemoryAdapter, type DecisionMemoryAdapter } from './decision-memory-adapter';
import type { DecisionMemoryItem } from './decision-memory';

// ── Types ────────────────────────────────────────────────────────────────────

export type CrashBlock = 'decision' | 'revenue' | 'staff' | 'timeline' | 'capacity' | 'operations';

export interface ChaosConfig {
  /** Force a specific block to crash during render */
  forceCrashBlock?: CrashBlock;
  /** Simulate API failures */
  simulateApiFail?: boolean;
  /** Force engine mode override */
  forceEngineMode?: 'full' | 'fallback' | 'off';
}

// ── State ────────────────────────────────────────────────────────────────────

let chaosConfig: ChaosConfig = {};

export function setChaosConfig(config: ChaosConfig): void {
  chaosConfig = config;
}

export function getChaosConfig(): ChaosConfig {
  return { ...chaosConfig };
}

export function clearChaos(): void {
  chaosConfig = {};
}

// ── Block Crash ──────────────────────────────────────────────────────────────

/**
 * Check if a block should crash. Called inside SafeBlock children.
 * Throws if the block matches forceCrashBlock.
 */
export function checkBlockCrash(blockName: string): void {
  if (process.env.NODE_ENV !== 'development') return;
  if (chaosConfig.forceCrashBlock && blockName.includes(chaosConfig.forceCrashBlock)) {
    throw new Error(`FORCE_CRASH_${blockName.toUpperCase().replace(/-/g, '_')}`);
  }
}

// ── Network Chaos ────────────────────────────────────────────────────────────

export interface NetworkChaosScenario {
  name: string;
  handler: () => Promise<Response>;
}

export const NETWORK_SCENARIOS: Record<string, NetworkChaosScenario> = {
  timeout: {
    name: 'Timeout (10s)',
    handler: () => Promise.reject(new DOMException('Aborted', 'AbortError')),
  },
  server500: {
    name: 'Server 500',
    handler: async () => new Response('Internal Server Error', { status: 500, statusText: 'Internal Server Error' }),
  },
  invalidJson: {
    name: 'Invalid JSON',
    handler: async () => new Response('not json {{{', { status: 200, headers: { 'Content-Type': 'application/json' } }),
  },
  emptyBody: {
    name: 'Empty Body',
    handler: async () => new Response('', { status: 200 }),
  },
  validSuccess: {
    name: 'Valid 200',
    handler: async () => new Response(JSON.stringify({ todayStats: { totalAppointments: 5, occupancyPercent: 50 } }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    }),
  },
};

// ── Telemetry Chaos ──────────────────────────────────────────────────────────

/**
 * Create a test sender that captures all events for inspection.
 */
export function createCaptureSender(): TelemetrySender & { events: TelemetryEvent[]; failNext: boolean } {
  const capture = {
    events: [] as TelemetryEvent[],
    failNext: false,
    sendBatch: async (events: TelemetryEvent[]) => {
      if (capture.failNext) {
        capture.failNext = false;
        return false;
      }
      capture.events.push(...events);
      return true;
    },
  };
  return capture;
}

// ── Memory Chaos ─────────────────────────────────────────────────────────────

/**
 * Create a corrupt memory adapter that returns bad data.
 */
export function createCorruptAdapter(scenario: 'bad_json' | 'not_array' | 'invalid_items' | 'half_valid' | 'oversized'): DecisionMemoryAdapter {
  return {
    name: `corrupt-${scenario}`,
    read(): DecisionMemoryItem[] {
      switch (scenario) {
        case 'bad_json':
          // Simulate what happens when JSON.parse fails — adapter catches this
          throw new Error('Unexpected token in JSON');
        case 'not_array':
          // Return what a corrupt parse might give
          return [] as DecisionMemoryItem[];
        case 'invalid_items':
          // Items with missing required fields — should be filtered by migrateItem
          return [
            { decisionId: '', rootCauseKey: '', status: 'applied', confidence: -1, applyCount: 0, dismissCount: 0, successCount: 0, failCount: 0, patternStats: {}, lastUpdatedAt: 0 } as DecisionMemoryItem,
          ];
        case 'half_valid':
          return [
            { decisionId: 'valid-1', rootCauseKey: 'k', status: 'applied', confidence: 0.5, applyCount: 1, dismissCount: 0, successCount: 0, failCount: 0, patternStats: {}, lastUpdatedAt: Date.now() },
            { decisionId: '', rootCauseKey: '', status: 'invalid_status' as 'applied', confidence: 99, applyCount: -1, dismissCount: -1, successCount: 0, failCount: 0, patternStats: {}, lastUpdatedAt: -1 } as DecisionMemoryItem,
          ];
        case 'oversized':
          // Generate 200 items
          return Array.from({ length: 200 }, (_, i) => ({
            decisionId: `d-${i}`,
            rootCauseKey: `k-${i}`,
            status: 'applied' as const,
            confidence: 0.5,
            applyCount: 0,
            dismissCount: 0,
            successCount: 0,
            failCount: 0,
            patternStats: {},
            lastUpdatedAt: Date.now() - i * 1000,
          }));
        default:
          return [];
      }
    },
    write(): void { /* noop for chaos adapter */ },
    clear(): void { /* noop */ },
  };
}

// ── Engine Chaos ─────────────────────────────────────────────────────────────

/**
 * Simulate engine generator failures.
 * Requires an explicit runtime — no global state.
 */
export function simulateEngineFailures(count: number, runtime: DecisionEngineRuntime): void {
  for (let i = 0; i < count; i++) {
    runtime.reportFailure(new Error(`Simulated generator failure ${i + 1}`));
  }
}

/**
 * Get engine recovery info.
 * Requires an explicit runtime — no global state.
 */
export function getEngineRecoveryInfo(runtime: DecisionEngineRuntime): {
  mode: string;
  failures: number;
  canRecover: boolean;
} {
  const state = runtime.getState();
  return {
    mode: state.mode,
    failures: state.consecutiveFailures,
    canRecover: state.mode === 'fallback',
  };
}
