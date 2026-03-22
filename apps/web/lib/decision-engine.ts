/**
 * Decision Engine V2 — Contextual Decision System
 * FAZ UI-11.1: Root cause grouping, conflict resolution, deterministic confidence
 *
 * Principles:
 * - No fake AI — all decisions are heuristic, data-driven
 * - Every decision has a rootCauseKey for grouping
 * - Conflicting decisions are resolved by confidence + impact
 * - Max 3 decisions shown — strongest per root cause
 * - Every decision carries context-aware action payloads
 */

import type { DashboardData } from './dashboard-mock';
import type { DecisionMemoryItem, DecisionContext } from './decision-memory';
import { applyMemoryToDecisions, getCurrentContext, getBlockedDecisionIds } from './decision-memory';
import {
  createDecisionEngineRuntime,
  generateFallbackDecisions,
  type DecisionEngineRuntime,
} from './decision-engine-failsafe';
import { trackDecisionGenerated, trackError } from './telemetry';

// ── Types ────────────────────────────────────────────────────────────────────

export type DecisionType = 'revenue' | 'capacity' | 'staff' | 'service' | 'retention' | 'growth';
export type DecisionPriority = 'high' | 'medium' | 'low';
export type ImpactType = 'revenue' | 'efficiency' | 'retention';
export type ActionKind = 'navigate' | 'inline' | 'modal';

export interface Decision {
  id: string;
  type: DecisionType;
  priority: DecisionPriority;
  /** Deterministic confidence: 0–1 */
  confidence: number;
  title: string;
  description: string;
  reason: string;
  /** Explainability — what data produced this decision */
  explainability: string;
  /** Grouping key — same root cause won't spam multiple cards */
  rootCauseKey: string;
  impact: {
    type: ImpactType;
    direction: 'positive' | 'negative';
    /** Heuristic feedback text — no fake numbers */
    feedback: string;
  };
  context: {
    targetDate?: string;
    targetSlots?: string[];
    targetStaffId?: string;
    targetServiceId?: string;
  };
  action: {
    label: string;
    type: ActionKind;
    payload?: {
      route?: string;
      filters?: Record<string, unknown>;
      sheet?: string;
      focusId?: string;
    };
  };
}

/** Session-level tracking for applied decisions */
export interface AppliedDecision {
  id: string;
  appliedAt: number;
}

/** Session-level tracking for deferred decisions */
export interface DeferredDecision {
  id: string;
  deferredAt: number;
}

// ── Confidence Calculation ───────────────────────────────────────────────────

interface ConfidenceInput {
  /** 0-1: how complete is the data for this signal */
  dataCompleteness: number;
  /** 0-1: how far from the threshold is the signal */
  signalStrength: number;
  /** 0-1: how many corroborating signals exist */
  corroboration: number;
}

export function calculateConfidence(input: ConfidenceInput): number {
  const { dataCompleteness, signalStrength, corroboration } = input;
  // Weighted: data 30%, signal 50%, corroboration 20%
  const raw = dataCompleteness * 0.3 + signalStrength * 0.5 + corroboration * 0.2;
  return Math.round(raw * 100) / 100;
}

function clamp01(v: number): number {
  return Math.max(0, Math.min(1, v));
}

// ── Priority Calculation ─────────────────────────────────────────────────────

function derivePriority(confidence: number, impactDirection: 'positive' | 'negative'): DecisionPriority {
  if (impactDirection === 'negative' && confidence >= 0.6) return 'high';
  if (confidence >= 0.7) return 'high';
  if (confidence >= 0.4) return 'medium';
  return 'low';
}

// ── Decision Generators ──────────────────────────────────────────────────────

function generateCapacityGap(data: DashboardData): Decision | null {
  const capacity = data.capacityStats;
  const occupancy = data.todayStats.occupancyPercent;

  if (!capacity || occupancy >= 40) return null;

  const emptyHours = capacity.hourSlots.filter((s) => s.occupancy === 0);
  if (emptyHours.length === 0) return null;

  const emptySlotLabels = emptyHours.map((s) => `${String(s.hour).padStart(2, '0')}:00`);
  const contiguousRange = buildContiguousRange(emptyHours.map((h) => h.hour));

  const hasIdleStaff = (data.staffStats ?? []).some((s) => s.availability === 'available');
  const hasEmptySlots = (data.emptySlotOps ?? []).length > 0;

  const confidence = calculateConfidence({
    dataCompleteness: 1,
    signalStrength: clamp01((40 - occupancy) / 40),
    corroboration: clamp01(
      (hasIdleStaff ? 0.4 : 0) + (hasEmptySlots ? 0.3 : 0) + (emptyHours.length >= 3 ? 0.3 : 0),
    ),
  });

  return {
    id: 'decision-capacity-gap',
    type: 'capacity',
    priority: derivePriority(confidence, 'negative'),
    confidence,
    title: `Bugün ${contiguousRange} arası düşük doluluk var`,
    description: `Doluluk oranı %${occupancy}. ${emptyHours.length} saatlik zaman diliminde hiç randevu yok.`,
    reason: `Genel doluluk %40'ın altında ve ${emptyHours.length} saat tamamen boş.`,
    explainability: 'Bu öneri doluluk oranı, saat bazlı kapasite ve boş slot verilerine göre oluşturuldu.',
    rootCauseKey: 'low-capacity',
    impact: {
      type: 'revenue',
      direction: 'negative',
      feedback: 'Bu karar boş kapasiteyi görünür hale getirmeyi hedefler.',
    },
    context: { targetDate: 'today', targetSlots: emptySlotLabels },
    action: {
      label: `${contiguousRange} arası boş saatleri takvimde göster`,
      type: 'navigate',
      payload: {
        route: '/calendar',
        filters: { date: 'today', emptyOnly: true, hours: emptySlotLabels },
      },
    },
  };
}

function generateIdleStaff(data: DashboardData): Decision | null {
  const staffOps = data.staffOps ?? [];
  const idleStaff = staffOps.filter((s) => s.currentStatus === 'available' && s.emptySlots >= 3);

  if (idleStaff.length === 0) return null;

  const mostIdle = [...idleStaff].sort((a, b) => b.emptySlots - a.emptySlots)[0];
  const hasLowOccupancy = data.todayStats.occupancyPercent < 60;
  const totalEmptySlots = (data.emptySlotOps ?? []).length;

  const confidence = calculateConfidence({
    dataCompleteness: 1,
    signalStrength: clamp01(mostIdle.emptySlots / 6),
    corroboration: clamp01(
      (hasLowOccupancy ? 0.5 : 0) + (totalEmptySlots >= 3 ? 0.3 : 0) + (idleStaff.length >= 2 ? 0.2 : 0),
    ),
  });

  return {
    id: `decision-idle-staff-${mostIdle.id}`,
    type: 'staff',
    priority: derivePriority(confidence, 'negative'),
    confidence,
    title: `${mostIdle.name} bugün yeterince dolu değil`,
    description: `${mostIdle.emptySlots} boş slotu var. Bugün ${mostIdle.todayAppointments} randevudan ${mostIdle.completedAppointments} tanesini tamamlamış.`,
    reason: `${mostIdle.name} boş slot sayısı (${mostIdle.emptySlots}) eşik değerinin üzerinde.`,
    explainability: 'Bu öneri uzman boş slot sayısı ve günlük randevu yoğunluğuna göre oluşturuldu.',
    rootCauseKey: 'low-capacity',
    impact: {
      type: 'efficiency',
      direction: 'negative',
      feedback: 'Bu aksiyon uzman kapasitesinin daha iyi kullanılmasını hedefler.',
    },
    context: { targetStaffId: mostIdle.id },
    action: {
      label: `${mostIdle.name} boşluklarını takvimde göster`,
      type: 'navigate',
      payload: {
        route: '/calendar',
        filters: { staffId: mostIdle.id, staffName: mostIdle.name, emptyOnly: true, date: 'today' },
      },
    },
  };
}

function generateHighNoShowStaff(data: DashboardData): Decision | null {
  const staffStats = data.staffStats ?? [];
  const staffOps = data.staffOps ?? [];

  const riskyStaff = staffStats.filter((s) => {
    if (s.todayAppointments === 0) return false;
    return (s.noShowCount / s.todayAppointments) >= 0.2;
  });

  if (riskyStaff.length === 0) return null;

  const worst = [...riskyStaff].sort((a, b) =>
    (b.noShowCount / b.todayAppointments) - (a.noShowCount / a.todayAppointments),
  )[0];

  const noShowRate = Math.round((worst.noShowCount / worst.todayAppointments) * 100);
  const hasGlobalNoShows = data.todayStats.noShowCount >= 2;
  const staffOp = staffOps.find((s) => s.name === worst.name);

  const confidence = calculateConfidence({
    dataCompleteness: 1,
    signalStrength: clamp01((noShowRate - 20) / 30),
    corroboration: clamp01(
      (hasGlobalNoShows ? 0.4 : 0) +
      (staffOp && staffOp.noShowCount >= 1 ? 0.3 : 0) +
      (worst.noShowCount >= 2 ? 0.3 : 0),
    ),
  });

  return {
    id: `decision-noshow-${worst.id}`,
    type: 'staff',
    priority: derivePriority(confidence, 'negative'),
    confidence,
    title: `${worst.name} için no-show oranı yüksek (%${noShowRate})`,
    description: `Bugün ${worst.todayAppointments} randevudan ${worst.noShowCount} tanesi no-show.`,
    reason: `No-show oranı (%${noShowRate}) eşik değer olan %20'nin üzerinde.`,
    explainability: 'Bu öneri uzman bazlı no-show oranı ve günlük randevu verilerine göre oluşturuldu.',
    rootCauseKey: 'no-show-risk',
    impact: {
      type: 'retention',
      direction: 'negative',
      feedback: 'Bu öneri no-show riskini kontrol etmenize yardımcı olabilir.',
    },
    context: { targetStaffId: worst.id },
    action: {
      label: `${worst.name} randevularını incele`,
      type: 'navigate',
      payload: {
        route: '/appointments',
        filters: { staffId: worst.id, staffName: worst.name, status: 'NO_SHOW', date: 'today' },
      },
    },
  };
}

function generateDominantServiceRisk(data: DashboardData): Decision | null {
  const services = data.serviceStats ?? [];
  if (services.length < 2) return null;

  const totalRevenue = services.reduce((sum, s) => sum + s.totalRevenue, 0);
  if (totalRevenue === 0) return null;

  const sorted = [...services].sort((a, b) => b.totalRevenue - a.totalRevenue);
  const top = sorted[0];
  const topPct = Math.round((top.totalRevenue / totalRevenue) * 100);

  if (topPct <= 60) return null;

  const hasRevenueData = data.revenueStats != null;
  const otherServicesLow = sorted.slice(1).filter((s) => s.appointmentCount <= 3).length >= 2;

  const confidence = calculateConfidence({
    dataCompleteness: hasRevenueData ? 1 : 0.5,
    signalStrength: clamp01((topPct - 60) / 25),
    corroboration: clamp01(
      (otherServicesLow ? 0.4 : 0) + (services.length >= 4 ? 0.3 : 0) + (topPct >= 70 ? 0.3 : 0),
    ),
  });

  return {
    id: 'decision-dominant-service',
    type: 'service',
    priority: derivePriority(confidence, 'negative'),
    confidence,
    title: `Gelirin %${topPct}'ı ${top.name} hizmetinden geliyor`,
    description: `Tek hizmete bağımlılık riski var. ${services.length} hizmetten yalnızca ${top.name} gelirin büyük kısmını oluşturuyor.`,
    reason: `${top.name} tek başına gelirin %${topPct}'ını oluşturuyor; bu %60 eşiğinin üzerinde.`,
    explainability: 'Bu öneri hizmet bazlı gelir dağılımı ve randevu sayılarına göre oluşturuldu.',
    rootCauseKey: 'service-concentration',
    impact: {
      type: 'revenue',
      direction: 'negative',
      feedback: 'Bu karar gelir çeşitliliğini artırmayı hedefler.',
    },
    context: { targetServiceId: top.id },
    action: {
      label: 'Hizmet performansını incele',
      type: 'navigate',
      payload: {
        route: '/services',
        filters: { sortBy: 'revenue', highlight: top.id },
      },
    },
  };
}

function generateRevenueDrop(data: DashboardData): Decision | null {
  const rev = data.revenueStats;
  if (!rev || rev.today >= rev.yesterday || rev.yesterday === 0) return null;

  const dropPct = Math.round(((rev.yesterday - rev.today) / rev.yesterday) * 100);
  if (dropPct < 10) return null;

  const hasEmptySlots = (data.emptySlotOps ?? []).length > 0;
  const occupancyLow = data.todayStats.occupancyPercent < 60;
  const hasCapacityData = data.capacityStats != null;

  const confidence = calculateConfidence({
    dataCompleteness: 1,
    signalStrength: clamp01(dropPct / 40),
    corroboration: clamp01(
      (hasEmptySlots ? 0.3 : 0) + (occupancyLow ? 0.4 : 0) + (hasCapacityData ? 0.3 : 0),
    ),
  });

  return {
    id: 'decision-revenue-drop',
    type: 'revenue',
    priority: derivePriority(confidence, 'negative'),
    confidence,
    title: `Gelir dünden %${dropPct} düşük`,
    description: `Bugünkü gelir (${fmtCurrency(rev.today)}) düne (${fmtCurrency(rev.yesterday)}) kıyasla geride.${hasEmptySlots ? ' Boş slotlar da mevcut.' : ''}`,
    reason: `Günlük gelir karşılaştırmasında %${dropPct} düşüş tespit edildi.`,
    explainability: 'Bu öneri günlük gelir karşılaştırması, doluluk ve boş slot verilerine göre oluşturuldu.',
    rootCauseKey: 'low-capacity',
    impact: {
      type: 'revenue',
      direction: 'negative',
      feedback: 'Bu aksiyon düşük doluluk saatlerine odaklanır.',
    },
    context: { targetDate: 'today' },
    action: {
      label: 'Boş saatleri incele',
      type: 'navigate',
      payload: {
        route: '/calendar',
        filters: { date: 'today', emptyOnly: true },
      },
    },
  };
}

function generateOverbookedWarning(data: DashboardData): Decision | null {
  const capacity = data.capacityStats;
  if (!capacity || capacity.overallOccupancy < 90) return null;

  const busyHours = capacity.hourSlots.filter((s) => s.occupancy >= 90);
  if (busyHours.length < 3) return null;

  const staffOps = data.staffOps ?? [];
  const staffBusy = staffOps.filter((s) => s.currentStatus === 'busy').length;
  const allBusy = staffOps.length > 0 && staffBusy === staffOps.length;

  const confidence = calculateConfidence({
    dataCompleteness: 1,
    signalStrength: clamp01((capacity.overallOccupancy - 90) / 10),
    corroboration: clamp01(
      (allBusy ? 0.5 : 0) + (busyHours.length >= 5 ? 0.3 : 0) + (data.todayStats.totalAppointments >= 15 ? 0.2 : 0),
    ),
  });

  const busyLabels = busyHours.map((h) => `${String(h.hour).padStart(2, '0')}:00`);

  return {
    id: 'decision-overbooked',
    type: 'capacity',
    priority: derivePriority(confidence, 'negative'),
    confidence,
    title: `Bugün çok yoğun — doluluk %${capacity.overallOccupancy}`,
    description: `${busyHours.length} saatte doluluk %90 üzeri.${allBusy ? ' Tüm uzmanlar şu an dolu.' : ''}`,
    reason: `Doluluk oranı %90'ın üzerinde ve ${busyHours.length} zaman dilimi neredeyse tam dolu.`,
    explainability: 'Bu öneri genel doluluk, saat bazlı kapasite ve uzman durumuna göre oluşturuldu.',
    rootCauseKey: 'high-capacity',
    impact: {
      type: 'efficiency',
      direction: 'negative',
      feedback: 'Bu uyarı aşırı yoğunluk kaynaklı hizmet kalitesi riskini hedefler.',
    },
    context: { targetDate: 'today', targetSlots: busyLabels },
    action: {
      label: 'Yoğun saatleri takvimde göster',
      type: 'navigate',
      payload: {
        route: '/calendar',
        filters: { date: 'today', busyOnly: true, hours: busyLabels },
      },
    },
  };
}

function generatePendingApprovals(data: DashboardData): Decision | null {
  const pendingCount = data.todayStats.pendingCount;
  if (pendingCount === 0) return null;

  const confidence = calculateConfidence({
    dataCompleteness: 1,
    signalStrength: clamp01(pendingCount / 5),
    corroboration: clamp01(pendingCount >= 3 ? 0.5 : 0.2),
  });

  return {
    id: 'decision-pending-approvals',
    type: 'capacity',
    priority: derivePriority(confidence, 'negative'),
    confidence,
    title: `${pendingCount} randevu onay bekliyor`,
    description: `Onaylanmamış randevular müşteri kaybına yol açabilir. Hemen onaylayın veya reddedin.`,
    reason: `${pendingCount} randevu henüz onaylanmadı.`,
    explainability: 'Bu öneri bekleyen randevu sayısına göre oluşturuldu.',
    rootCauseKey: 'pending-approvals',
    impact: {
      type: 'retention',
      direction: 'negative',
      feedback: 'Bu adım müşteri memnuniyetini korumayı hedefler.',
    },
    context: { targetDate: 'today' },
    action: {
      label: 'Onay bekleyenleri gör',
      type: 'navigate',
      payload: {
        route: '/appointments',
        filters: { status: 'PENDING', date: 'today' },
      },
    },
  };
}

// ── Helpers ──────────────────────────────────────────────────────────────────

function fmtCurrency(amount: number): string {
  return new Intl.NumberFormat('tr-TR', { style: 'currency', currency: 'TRY', maximumFractionDigits: 0 }).format(amount);
}

function buildContiguousRange(hours: number[]): string {
  if (hours.length === 0) return '';
  const sorted = [...hours].sort((a, b) => a - b);
  return `${String(sorted[0]).padStart(2, '0')}:00–${String(sorted[sorted.length - 1] + 1).padStart(2, '0')}:00`;
}

// ── Root Cause Grouping ──────────────────────────────────────────────────────

/**
 * Groups decisions by rootCauseKey and keeps the strongest per group.
 * Secondary decisions are merged as supporting context.
 */
export function groupByRootCause(decisions: Decision[]): Decision[] {
  const groups = new Map<string, Decision[]>();

  for (const d of decisions) {
    const existing = groups.get(d.rootCauseKey) ?? [];
    existing.push(d);
    groups.set(d.rootCauseKey, existing);
  }

  const result: Decision[] = [];

  for (const [, group] of groups) {
    const priorityOrder: Record<DecisionPriority, number> = { high: 0, medium: 1, low: 2 };
    group.sort((a, b) => {
      if (a.confidence !== b.confidence) return b.confidence - a.confidence;
      return priorityOrder[a.priority] - priorityOrder[b.priority];
    });

    const primary = { ...group[0] };

    if (group.length > 1) {
      const secondaryNotes = group.slice(1).map((d) => d.title).join('. ');
      primary.description = `${primary.description} Ayrıca: ${secondaryNotes}.`;
    }

    result.push(primary);
  }

  return result;
}

// ── Conflict Resolution ──────────────────────────────────────────────────────

/**
 * Conflicting root causes — can't coexist.
 * E.g., "overbooked" and "low capacity" are contradictions.
 */
const CONFLICT_PAIRS: [string, string][] = [
  ['low-capacity', 'high-capacity'],
];

export function resolveConflicts(decisions: Decision[]): Decision[] {
  const result = [...decisions];

  for (const [keyA, keyB] of CONFLICT_PAIRS) {
    const indexA = result.findIndex((d) => d.rootCauseKey === keyA);
    const indexB = result.findIndex((d) => d.rootCauseKey === keyB);

    if (indexA === -1 || indexB === -1) continue;

    const a = result[indexA];
    const b = result[indexB];

    // Keep higher confidence; on tie, keep higher priority
    if (a.confidence > b.confidence) {
      result.splice(indexB, 1);
    } else if (b.confidence > a.confidence) {
      result.splice(indexA, 1);
    } else {
      const priorityOrder: Record<DecisionPriority, number> = { high: 0, medium: 1, low: 2 };
      if (priorityOrder[a.priority] <= priorityOrder[b.priority]) {
        result.splice(indexB, 1);
      } else {
        result.splice(indexA, 1);
      }
    }
  }

  return result;
}

// ── Main: Generate Decisions ─────────────────────────────────────────────────

const MAX_DECISIONS = 3;

/**
 * Generate prioritized, grouped, conflict-resolved decisions from dashboard data.
 * Returns max 3 decisions.
 *
 * Pipeline V2:
 * generate → group → conflict → applyMemory(context+outcome+decay) → sort → slice
 *
 * @param data Dashboard data
 * @param memory Optional decision memory for cooldown/adaptation/learning (UI-11.2 V2)
 * @param runtime Optional engine runtime for failsafe state (creates ephemeral if omitted)
 */
export function generateDecisions(
  data: DashboardData,
  memory?: DecisionMemoryItem[],
  runtime?: DecisionEngineRuntime,
): Decision[] {
  const rt = runtime ?? createDecisionEngineRuntime();
  const mode = rt.getMode();

  if (mode === 'off') {
    trackDecisionGenerated(0, 'off');
    return [];
  }

  // Auto-recovery attempt
  if (mode === 'fallback' && rt.shouldAttemptRecovery()) {
    rt.attemptRecovery();
  }

  if (rt.getMode() === 'fallback') {
    const fallbackResults = generateFallbackDecisions(data);
    trackDecisionGenerated(fallbackResults.length, 'fallback');
    return fallbackResults;
  }

  // Full mode — normal pipeline with error protection
  try {
    const result = generateDecisionsFull(data, memory);
    rt.reportSuccess();
    trackDecisionGenerated(result.length, 'full');
    return result;
  } catch (err) {
    rt.reportFailure(err);
    trackError('engine', 'full_mode_failure', err);
    const fallbackResults = generateFallbackDecisions(data);
    trackDecisionGenerated(fallbackResults.length, 'fallback_immediate');
    return fallbackResults;
  }
}

/**
 * Full pipeline — all generators + memory + learning.
 * Separated to allow failsafe wrapping.
 */
function generateDecisionsFull(data: DashboardData, memory?: DecisionMemoryItem[]): Decision[] {
  const generators = [
    generateCapacityGap,
    generateIdleStaff,
    generateHighNoShowStaff,
    generateDominantServiceRisk,
    generateRevenueDrop,
    generateOverbookedWarning,
    generatePendingApprovals,
  ];

  // 0. Get blocked IDs from memory (TASK 4: confidence < 0.3 or hard blocked)
  const blockedIds = memory ? getBlockedDecisionIds(memory) : new Set<string>();

  // 1. Collect candidates — skip blocked decisions at generation level
  // Each generator is individually protected
  const candidates: Decision[] = [];
  for (const gen of generators) {
    try {
      const d = gen(data);
      if (d && !blockedIds.has(d.id)) candidates.push(d);
    } catch (err) {
      trackError('engine', `generator_error:${gen.name}`, err);
      // Skip this generator, continue with others
    }
  }

  if (candidates.length === 0) return [];

  // 2. Group by root cause
  const grouped = groupByRootCause(candidates);

  // 3. Resolve conflicts
  const resolved = resolveConflicts(grouped);

  // 4. Apply memory: cooldown + context learning + outcome learning + decay
  let processed: Decision[];
  if (memory && memory.length > 0) {
    const context: DecisionContext = getCurrentContext(data);
    processed = applyMemoryToDecisions(resolved, memory, context);
  } else {
    processed = resolved;
  }

  // 5. Sort by priority then confidence
  const priorityOrder: Record<DecisionPriority, number> = { high: 0, medium: 1, low: 2 };
  processed.sort((a, b) => {
    if (a.priority !== b.priority) return priorityOrder[a.priority] - priorityOrder[b.priority];
    return b.confidence - a.confidence;
  });

  // 6. Take top N
  return processed.slice(0, MAX_DECISIONS);
}
