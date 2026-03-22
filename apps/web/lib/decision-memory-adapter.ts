/**
 * Decision Memory Adapter — Storage Abstraction
 * FAZ UI-13 TASK 8: DecisionMemoryAdapter interface
 *
 * Implementations:
 * - LocalStorageAdapter: production default (browser localStorage)
 * - InMemoryAdapter: tests, SSR, fallback
 *
 * Principles:
 * - Memory module doesn't know about storage details
 * - Adapter handles serialization, corruption, quota errors
 * - Swappable at runtime (e.g., for tests)
 */

import type { DecisionMemoryItem } from './decision-memory';
import { trackError, trackMemoryCorruption } from './telemetry';

// ── Interface ─────────────────────────────────────────────────────────────────

export interface DecisionMemoryAdapter {
  /** Read all memory items */
  read(): DecisionMemoryItem[];
  /** Write all memory items (full replace) */
  write(items: DecisionMemoryItem[]): void;
  /** Clear all memory */
  clear(): void;
  /** Adapter name for debugging */
  readonly name: string;
}

// ── LocalStorage Adapter ──────────────────────────────────────────────────────

const STORAGE_KEY = 'calon.decision.memory.v3';
const MAX_ITEMS = 50;

export class LocalStorageAdapter implements DecisionMemoryAdapter {
  readonly name = 'localStorage';

  read(): DecisionMemoryItem[] {
    if (typeof window === 'undefined') return [];
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (!raw) return [];

      const parsed = JSON.parse(raw);
      if (!Array.isArray(parsed)) {
        trackMemoryCorruption('invalid_format', { type: typeof parsed });
        this.clear();
        return [];
      }

      // Validate each item has required fields
      const valid = parsed.filter((item: unknown) => {
        if (!item || typeof item !== 'object') return false;
        const i = item as Record<string, unknown>;
        return typeof i.decisionId === 'string' && typeof i.rootCauseKey === 'string';
      });

      if (valid.length !== parsed.length) {
        trackMemoryCorruption('partial_corruption', {
          total: parsed.length,
          valid: valid.length,
        });
      }

      return valid as DecisionMemoryItem[];
    } catch (err) {
      trackError('memory', 'read_failed', err);
      this.clear();
      return [];
    }
  }

  write(items: DecisionMemoryItem[]): void {
    if (typeof window === 'undefined') return;
    try {
      const pruned = pruneItems(items);
      const serialized = JSON.stringify(pruned);

      // Check approximate size before writing (5MB limit estimate)
      if (serialized.length > 4_500_000) {
        trackMemoryCorruption('quota_warning', { size: serialized.length });
        // Aggressive prune: keep only last 20
        const aggressivePruned = pruneItems(items, 20);
        localStorage.setItem(STORAGE_KEY, JSON.stringify(aggressivePruned));
        return;
      }

      localStorage.setItem(STORAGE_KEY, serialized);
    } catch (err) {
      trackError('memory', 'write_failed', err, {
        itemCount: items.length,
      });
      // On quota error, try aggressive prune
      try {
        const minimal = pruneItems(items, 10);
        localStorage.setItem(STORAGE_KEY, JSON.stringify(minimal));
      } catch {
        // Complete failure — memory will be lost
        trackError('memory', 'write_total_failure', err);
      }
    }
  }

  clear(): void {
    if (typeof window === 'undefined') return;
    try {
      localStorage.removeItem(STORAGE_KEY);
    } catch {
      // Can't clear — this is fine
    }
  }
}

// ── InMemory Adapter ──────────────────────────────────────────────────────────

export class InMemoryAdapter implements DecisionMemoryAdapter {
  readonly name = 'in-memory';
  private items: DecisionMemoryItem[] = [];

  read(): DecisionMemoryItem[] {
    return [...this.items];
  }

  write(items: DecisionMemoryItem[]): void {
    this.items = pruneItems([...items]);
  }

  clear(): void {
    this.items = [];
  }
}

// ── Shared Pruning ────────────────────────────────────────────────────────────

function pruneItems(items: DecisionMemoryItem[], maxItems = MAX_ITEMS): DecisionMemoryItem[] {
  if (items.length <= maxItems) return items;

  // Keep hard_dismissed items, prune oldest regular items
  const hardDismissed = items.filter((i) => i.status === 'hard_dismissed');
  const regular = items.filter((i) => i.status !== 'hard_dismissed');
  regular.sort((a, b) => a.lastUpdatedAt - b.lastUpdatedAt);

  const keepCount = Math.max(0, maxItems - hardDismissed.length);
  const kept = regular.slice(Math.max(0, regular.length - keepCount));
  return [...hardDismissed, ...kept];
}

// ── Singleton ─────────────────────────────────────────────────────────────────

let currentAdapter: DecisionMemoryAdapter = new LocalStorageAdapter();

export function getMemoryAdapter(): DecisionMemoryAdapter {
  return currentAdapter;
}

export function setMemoryAdapter(adapter: DecisionMemoryAdapter): void {
  currentAdapter = adapter;
}
