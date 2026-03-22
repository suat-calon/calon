/**
 * Decision Engine Failsafe — Runtime Factory + Static Fallback Rules
 * FAZ UI-13 TASK 2-3 + FAZ UI-13.3 TASK 2: Runtime isolation
 *
 * Architecture:
 * - createDecisionEngineRuntime() → isolated runtime instance
 * - No module-level mutable state
 * - Each consumer creates/receives its own runtime
 * - Tests cannot leak state between runs
 *
 * Modes:
 * - full:     Normal engine — generators + memory + learning
 * - fallback: Static rules only — no generators, no memory dependency
 * - off:      No decisions at all
 *
 * Recovery Policy (VISIBLE):
 *   1 generator fail    → skip, continue others
 *   3 consecutive fail  → AUTO fallback (AUTO_FALLBACK_THRESHOLD)
 *   6 consecutive fail  → AUTO off (AUTO_OFF_THRESHOLD)
 *   5 min cooldown      → AUTO recovery attempt
 *   Success             → Reset counter to 0
 */

import type { Decision, DecisionPriority } from './decision-engine';
import type { DashboardData } from './dashboard-mock';
import { trackEngineMode, trackError } from './telemetry';

// ── Types ────────────────────────────────────────────────────────────────────

export type EngineMode = 'full' | 'fallback' | 'off';

export interface EngineState {
  mode: EngineMode;
  reason?: string;
  failedAt?: number;
  consecutiveFailures: number;
}

// ── Constants ────────────────────────────────────────────────────────────────

/** After this many consecutive full-mode failures, auto-downgrade to fallback */
const AUTO_FALLBACK_THRESHOLD = 3;

/** After this many total consecutive failures, force off mode */
const AUTO_OFF_THRESHOLD = 6;

/** Auto-recovery cooldown: try full mode again after 5 minutes */
const AUTO_RECOVERY_MS = 5 * 60 * 1000;

// ── Runtime Interface ────────────────────────────────────────────────────────

export interface DecisionEngineRuntime {
  getState(): EngineState;
  getMode(): EngineMode;
  setMode(mode: EngineMode, reason?: string): void;
  reportFailure(error: unknown): void;
  reportSuccess(): void;
  shouldAttemptRecovery(): boolean;
  attemptRecovery(): void;
  generateFallbackDecisions(data: DashboardData): Decision[];
}

// ── Factory ──────────────────────────────────────────────────────────────────

/**
 * Create an isolated decision engine runtime.
 * All state is closure-scoped — no module-level mutation.
 * Each caller gets a fully independent instance.
 */
export function createDecisionEngineRuntime(): DecisionEngineRuntime {
  let state: EngineState = {
    mode: 'full',
    consecutiveFailures: 0,
  };

  const runtime: DecisionEngineRuntime = {
    getState(): EngineState {
      return { ...state };
    },

    getMode(): EngineMode {
      return state.mode;
    },

    setMode(mode: EngineMode, reason?: string): void {
      const prev = state.mode;
      state = { ...state, mode, reason };
      if (mode !== prev) {
        trackEngineMode(mode, reason);
      }
    },

    reportFailure(error: unknown): void {
      state.consecutiveFailures += 1;
      state.failedAt = Date.now();

      trackError('engine', 'generator_failure', error, {
        consecutiveFailures: state.consecutiveFailures,
        mode: state.mode,
      });

      // POLICY: repeated cycle failure → off mode (total shutdown)
      if (state.consecutiveFailures >= AUTO_OFF_THRESHOLD) {
        runtime.setMode('off', `Auto-shutdown after ${state.consecutiveFailures} consecutive failures`);
        return;
      }

      // POLICY: multiple failures → fallback mode
      if (
        state.mode === 'full' &&
        state.consecutiveFailures >= AUTO_FALLBACK_THRESHOLD
      ) {
        runtime.setMode('fallback', `Auto-degraded after ${state.consecutiveFailures} consecutive failures`);
      }
    },

    reportSuccess(): void {
      state.consecutiveFailures = 0;
    },

    shouldAttemptRecovery(): boolean {
      if (state.mode !== 'fallback') return false;
      if (!state.failedAt) return false;
      return Date.now() - state.failedAt >= AUTO_RECOVERY_MS;
    },

    attemptRecovery(): void {
      if (state.mode !== 'fallback') return;
      state.consecutiveFailures = 0;
      runtime.setMode('full', 'Auto-recovery attempt');
    },

    generateFallbackDecisions: generateFallbackDecisions,
  };

  return runtime;
}

// ── Static Fallback Rules ──────────────────────────────────────────────────

/**
 * Static fallback rules — hardcoded heuristics that don't depend on
 * generators or memory. Used when engine is in 'fallback' mode.
 *
 * Pure function — no state dependency. Safe to share across runtimes.
 */
export function generateFallbackDecisions(data: DashboardData): Decision[] {
  const decisions: Decision[] = [];

  // Rule 1: Low occupancy alert
  try {
    if (data.todayStats.occupancyPercent < 30) {
      decisions.push(makeFallbackDecision({
        id: 'fallback-low-occupancy',
        type: 'capacity',
        priority: 'high',
        confidence: 0.8,
        title: `Doluluk çok düşük — %${data.todayStats.occupancyPercent}`,
        description: 'Bugün doluluk oranı kritik seviyede düşük. Müsait saatleri değerlendirin.',
        reason: 'Doluluk oranı %30\'un altında.',
        rootCauseKey: 'low-capacity',
      }));
    }
  } catch { /* skip rule */ }

  // Rule 2: Pending approvals
  try {
    if (data.todayStats.pendingCount >= 3) {
      decisions.push(makeFallbackDecision({
        id: 'fallback-pending',
        type: 'capacity',
        priority: 'high',
        confidence: 0.9,
        title: `${data.todayStats.pendingCount} randevu onay bekliyor`,
        description: 'Onaylanmamış randevular müşteri kaybına yol açabilir.',
        reason: `${data.todayStats.pendingCount} onay bekleyen randevu var.`,
        rootCauseKey: 'pending-approvals',
      }));
    }
  } catch { /* skip rule */ }

  // Rule 3: High no-show count
  try {
    if (data.todayStats.noShowCount >= 2) {
      decisions.push(makeFallbackDecision({
        id: 'fallback-noshow',
        type: 'staff',
        priority: 'medium',
        confidence: 0.7,
        title: `Bugün ${data.todayStats.noShowCount} no-show var`,
        description: 'Gelmeyenler nedeniyle boş slotlar oluşmuş olabilir.',
        reason: `${data.todayStats.noShowCount} randevu no-show olarak işaretlendi.`,
        rootCauseKey: 'no-show-risk',
      }));
    }
  } catch { /* skip rule */ }

  // Rule 4: Very high occupancy warning
  try {
    if (data.todayStats.occupancyPercent >= 95) {
      decisions.push(makeFallbackDecision({
        id: 'fallback-overbooked',
        type: 'capacity',
        priority: 'medium',
        confidence: 0.75,
        title: `Bugün çok yoğun — doluluk %${data.todayStats.occupancyPercent}`,
        description: 'Yeni randevu almamak veya ek personel planlamak gerekebilir.',
        reason: 'Doluluk oranı %95 üzerinde.',
        rootCauseKey: 'high-capacity',
      }));
    }
  } catch { /* skip rule */ }

  return decisions.slice(0, 3);
}

function makeFallbackDecision(partial: {
  id: string;
  type: Decision['type'];
  priority: DecisionPriority;
  confidence: number;
  title: string;
  description: string;
  reason: string;
  rootCauseKey: string;
}): Decision {
  return {
    ...partial,
    explainability: 'Bu öneri temel kurallar tarafından oluşturuldu (fallback modu).',
    impact: {
      type: 'efficiency',
      direction: 'negative',
      feedback: '',
    },
    context: {},
    action: {
      label: 'Takvimi göster',
      type: 'navigate',
      payload: { route: '/calendar' },
    },
  };
}
