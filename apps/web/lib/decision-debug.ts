/**
 * Decision Debug Controls — Dev-Only Utilities
 * FAZ UI-13 TASK 12: Reset/debug controls for development
 *
 * All functions are dev-only and should NEVER be called in production.
 * Exposed on window.__calon_debug in development.
 */

import { resetDecisionMemory, getDecisionMemory, saveDecisionMemory, type DecisionMemoryItem } from './decision-memory';
import { createDecisionEngineRuntime, type EngineMode, type DecisionEngineRuntime } from './decision-engine-failsafe';
import { getDataSourceConfig, setDataSourceConfig, type MockScenario } from './dashboard-data-source';
import { setTelemetryEnabled } from './telemetry';
import { resetRateLimits } from './decision-rate-limiter';

// ── Debug Interface ──────────────────────────────────────────────────────────

export interface CalonDebug {
  /** View current decision memory */
  getMemory(): DecisionMemoryItem[];
  /** Reset all decision memory */
  resetMemory(): void;
  /** View engine state */
  getEngineState(): import('./decision-engine-failsafe').EngineState;
  /** Force engine mode */
  setEngineMode(mode: EngineMode): void;
  /** Switch mock scenario */
  setMockScenario(scenario: MockScenario): void;
  /** Get current data source config */
  getDataSourceConfig(): ReturnType<typeof getDataSourceConfig>;
  /** Toggle telemetry */
  setTelemetry(enabled: boolean): void;
  /** Reset rate limits */
  resetRateLimits(): void;
  /** Force corrupt memory (for testing error handling) */
  corruptMemory(): void;
  /** Inject fake memory items */
  injectMemory(items: DecisionMemoryItem[]): void;
  /** Print system status summary */
  status(): void;
}

// ── Implementation ───────────────────────────────────────────────────────────

/** @internal — Runtime is injected via installDebugControls(runtime). */
let debugRuntime: DecisionEngineRuntime = createDecisionEngineRuntime();

const debug: CalonDebug = {
  getMemory: () => getDecisionMemory(),
  resetMemory: () => {
    resetDecisionMemory();
    console.log('[Calon Debug] Memory reset');
  },
  getEngineState: () => debugRuntime.getState(),
  setEngineMode: (mode) => {
    debugRuntime.setMode(mode, 'debug_override');
    console.log(`[Calon Debug] Engine mode → ${mode}`);
  },
  setMockScenario: (scenario) => {
    setDataSourceConfig({ mode: 'mock', mockScenario: scenario });
    console.log(`[Calon Debug] Mock scenario → ${scenario}`);
  },
  getDataSourceConfig: () => getDataSourceConfig(),
  setTelemetry: (enabled) => {
    setTelemetryEnabled(enabled);
    console.log(`[Calon Debug] Telemetry → ${enabled ? 'ON' : 'OFF'}`);
  },
  resetRateLimits: () => {
    resetRateLimits();
    console.log('[Calon Debug] Rate limits reset');
  },
  corruptMemory: () => {
    if (typeof window !== 'undefined') {
      localStorage.setItem('calon.decision.memory.v3', '{corrupt data!!!');
      console.log('[Calon Debug] Memory corrupted for testing');
    }
  },
  injectMemory: (items) => {
    saveDecisionMemory(items);
    console.log(`[Calon Debug] Injected ${items.length} memory items`);
  },
  status: () => {
    const mem = getDecisionMemory();
    const engine = debugRuntime.getState();
    const ds = getDataSourceConfig();
    console.table({
      'Engine Mode': engine.mode,
      'Engine Failures': engine.consecutiveFailures,
      'Memory Items': mem.length,
      'Data Source': ds.mode,
      'Mock Scenario': ds.mockScenario ?? 'default',
      'Hard Dismissed': mem.filter((m) => m.status === 'hard_dismissed').length,
      'Pending Outcomes': mem.filter((m) => m.status === 'applied' && m.outcomeRequestedAt && !m.outcome).length,
    });
  },
};

// ── Initialization ───────────────────────────────────────────────────────────

/**
 * Install debug controls on window.__calon_debug.
 * Only in development mode.
 */
export function installDebugControls(runtime?: DecisionEngineRuntime): void {
  if (process.env.NODE_ENV !== 'development') return;
  if (typeof window === 'undefined') return;

  // Bind to the provided runtime (or keep the default)
  if (runtime) debugRuntime = runtime;

  (window as unknown as Record<string, unknown>).__calon_debug = debug;

  console.log(
    '%c[Calon] Debug controls available: window.__calon_debug',
    'color: #7c3aed; font-weight: bold',
  );
  console.log(
    '%cCommands: .status() .getMemory() .resetMemory() .setEngineMode("fallback") .setMockScenario("empty")',
    'color: #6b7280; font-size: 11px',
  );
}
