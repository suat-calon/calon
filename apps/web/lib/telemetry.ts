/**
 * Telemetry V2 — Buffer + Batch + Flush + Dedup
 * FAZ UI-13.1 TASK 5-6: Real observability layer
 *
 * Architecture:
 * trackEvent → dedup check → buffer → auto-flush at threshold → sendBatch
 *
 * Guarantees:
 * - No console.log in production
 * - Events buffered, not fire-and-forget
 * - Dedup prevents spam (5s window per key)
 * - Failed flush retains buffer
 * - Adapter pattern: noop sender default, swappable to server sender
 */

// ── Types ────────────────────────────────────────────────────────────────────

export type TelemetryLevel = 'info' | 'warn' | 'error';

export type TelemetryCategory =
  | 'decision'
  | 'memory'
  | 'outcome'
  | 'engine'
  | 'data'
  | 'ui'
  | 'auth'
  | 'system';

export interface TelemetryEvent {
  category: TelemetryCategory;
  action: string;
  level: TelemetryLevel;
  /** Structured metadata */
  meta?: Record<string, unknown>;
  /** Error object if applicable */
  error?: Error;
  /** Timestamp */
  ts: number;
}

/**
 * Adapter interface for sending telemetry batches.
 * Default: NoopSender (buffer only, no I/O).
 * Future: ServerSender (POST to /api/telemetry).
 */
export interface TelemetrySender {
  sendBatch(events: TelemetryEvent[]): Promise<boolean>;
}

// ── Constants ────────────────────────────────────────────────────────────────

/** Auto-flush when buffer reaches this size */
const AUTO_FLUSH_THRESHOLD = 50;

/** Max buffer size — drop oldest if exceeded */
const MAX_BUFFER_SIZE = 500;

/** Dedup window — suppress identical events within this window */
const DEDUP_WINDOW_MS = 5_000;

/** Rate limit per category per minute */
const RATE_LIMIT_WINDOW_MS = 60_000;
const RATE_LIMIT_MAX_PER_CATEGORY = 100;

// ── Noop Sender (default) ────────────────────────────────────────────────────

class NoopSender implements TelemetrySender {
  async sendBatch(_events: TelemetryEvent[]): Promise<boolean> {
    // In dev, optionally log to console for visibility
    if (process.env.NODE_ENV === 'development' && _events.length > 0) {
      // Controlled dev output — not console.log spam
      for (const e of _events) {
        if (e.level === 'error') {
          console.error(`[Calon] [${e.category}] ${e.action}`, e.meta ?? '', e.error ?? '');
        } else if (e.level === 'warn') {
          console.warn(`[Calon] [${e.category}] ${e.action}`, e.meta ?? '');
        }
        // info events are silent even in dev — check buffer via debug controls
      }
    }
    return true;
  }
}

// ── State ────────────────────────────────────────────────────────────────────

let buffer: TelemetryEvent[] = [];
let sender: TelemetrySender = new NoopSender();
let enabled = true;
let flushing = false;
/** Generation counter — incremented on reset to invalidate in-flight flushes */
let flushGeneration = 0;

// Dedup map: key → last timestamp
const dedupMap = new Map<string, number>();

// Rate limit map: category → { count, windowStart }
const rateLimitMap = new Map<string, { count: number; windowStart: number }>();

// ── Dedup ────────────────────────────────────────────────────────────────────

function buildDedupKey(category: string, action: string, meta?: Record<string, unknown>): string {
  // Use decisionId or 'global' for dedup grouping
  const id = meta?.decisionId ?? 'global';
  return `${category}:${action}:${id}`;
}

function isDuplicate(key: string, now: number): boolean {
  const last = dedupMap.get(key);
  if (last && now - last < DEDUP_WINDOW_MS) return true;
  dedupMap.set(key, now);
  return false;
}

// ── Rate Limiting ────────────────────────────────────────────────────────────

function isRateLimited(category: string): boolean {
  const now = Date.now();
  const entry = rateLimitMap.get(category);

  if (!entry || now - entry.windowStart > RATE_LIMIT_WINDOW_MS) {
    rateLimitMap.set(category, { count: 1, windowStart: now });
    return false;
  }

  if (entry.count >= RATE_LIMIT_MAX_PER_CATEGORY) return true;
  entry.count += 1;
  return false;
}

// ── Buffer Management ────────────────────────────────────────────────────────

/** Tracks how many events were pruned due to buffer overflow */
let totalPruned = 0;

function pushToBuffer(event: TelemetryEvent): void {
  buffer.push(event);

  // Drop oldest if buffer overflows — controlled prune
  if (buffer.length > MAX_BUFFER_SIZE) {
    const dropCount = buffer.length - MAX_BUFFER_SIZE;
    buffer = buffer.slice(dropCount);
    totalPruned += dropCount;
    // Log prune event (directly, to avoid recursion)
    buffer.push({
      category: 'system',
      action: 'telemetry_buffer_pruned',
      level: 'warn',
      meta: { dropped: dropCount, totalPruned, bufferSize: buffer.length },
      ts: Date.now(),
    });
  }

  // Auto-flush at threshold
  if (buffer.length >= AUTO_FLUSH_THRESHOLD) {
    void flushTelemetry();
  }
}

export function getTelemetryStats(): { bufferSize: number; totalPruned: number } {
  return { bufferSize: buffer.length, totalPruned };
}

// ── Public API ────────────────────────────────────────────────────────────────

export function setTelemetrySender(s: TelemetrySender): void {
  sender = s;
}

export function setTelemetryEnabled(v: boolean): void {
  enabled = v;
}

/** @deprecated Use setTelemetrySender instead. Kept for backward compat. */
export function setTelemetryAdapter(a: { track: (e: TelemetryEvent) => void; flush: () => void }): void {
  sender = {
    sendBatch: async (events) => {
      for (const e of events) a.track(e);
      return true;
    },
  };
}

export function trackEvent(
  category: TelemetryCategory,
  action: string,
  meta?: Record<string, unknown>,
  level: TelemetryLevel = 'info',
): void {
  if (!enabled) return;
  if (isRateLimited(category)) return;

  const now = Date.now();
  const dedupKey = buildDedupKey(category, action, meta);
  if (isDuplicate(dedupKey, now)) return;

  pushToBuffer({ category, action, level, meta, ts: now });
}

export function trackError(
  category: TelemetryCategory,
  action: string,
  error: unknown,
  meta?: Record<string, unknown>,
): void {
  if (!enabled) return;
  if (isRateLimited(`${category}:error`)) return;

  const now = Date.now();
  const err = error instanceof Error ? error : new Error(String(error));

  // Errors skip dedup — always log
  pushToBuffer({
    category,
    action,
    level: 'error',
    meta: { ...meta, message: err.message },
    error: err,
    ts: now,
  });
}

export function trackWarn(
  category: TelemetryCategory,
  action: string,
  meta?: Record<string, unknown>,
): void {
  if (!enabled) return;
  if (isRateLimited(`${category}:warn`)) return;

  const now = Date.now();
  const dedupKey = buildDedupKey(category, action, meta);
  if (isDuplicate(dedupKey, now)) return;

  pushToBuffer({ category, action, level: 'warn', meta, ts: now });
}

// ── Flush ─────────────────────────────────────────────────────────────────────

/**
 * Flush buffered events to the sender.
 * If flush fails, events stay in buffer for next attempt.
 */
export async function flushTelemetry(): Promise<void> {
  if (flushing || buffer.length === 0) return;
  flushing = true;

  const gen = flushGeneration;
  const batch = [...buffer];
  try {
    const success = await sender.sendBatch(batch);
    // Only modify buffer if this flush is still valid (not invalidated by reset)
    if (success && gen === flushGeneration) {
      buffer = buffer.slice(batch.length);
    }
  } catch {
    // Flush failed — events stay in buffer
  } finally {
    if (gen === flushGeneration) {
      flushing = false;
    }
  }
}

/**
 * Get current buffer contents (for debugging/testing).
 */
export function getTelemetryBuffer(): TelemetryEvent[] {
  return [...buffer];
}

/**
 * Reset buffer and dedup state (for testing/debug).
 */
export function resetTelemetryBuffer(): void {
  buffer = [];
  dedupMap.clear();
  rateLimitMap.clear();
  flushing = false;
  flushGeneration++; // Invalidate any in-flight flush from previous state
}

// ── Convenience: Decision Events ──────────────────────────────────────────────

export function trackDecisionGenerated(count: number, mode: string): void {
  trackEvent('decision', 'generated', { count, mode });
}

export function trackDecisionAction(
  decisionId: string,
  action: 'applied' | 'dismissed' | 'deferred' | 'hard_dismissed',
): void {
  trackEvent('decision', action, { decisionId });
}

export function trackOutcome(decisionId: string, result: string, source: string): void {
  trackEvent('outcome', 'recorded', { decisionId, result, source });
}

export function trackEngineMode(mode: string, reason?: string): void {
  trackEvent('engine', 'mode_change', { mode, reason }, 'warn');
}

export function trackMemoryCorruption(action: string, meta?: Record<string, unknown>): void {
  trackWarn('memory', action, meta);
}

export function trackDataSource(source: string, success: boolean, meta?: Record<string, unknown>): void {
  trackEvent('data', 'fetch', { source, success, ...meta });
}
