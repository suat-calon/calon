'use client';

/**
 * useRealtimeDashboard — Production-grade smart polling hook
 * FAZ UI-REALTIME-01.3 (v5 — visibility-hardened)
 *
 * Guarantees:
 * 1. Single-flight: fetchingRef + ownership via requestId — only owner releases lock
 * 2. AbortController: unmount/refetch aborts in-flight, AbortError never writes state
 * 3. Stale response drop: monotonic requestId — only latest writes state
 * 4. Self-controlled setTimeout loop: no setInterval, no overlap
 * 5. Visibility API: hidden=pause, visible=resume with REMAINING time preservation
 * 6. Adaptive interval: active=8s, idle=15s, fallback=60s, error=exponential backoff
 * 7. StrictMode safe: effectEpoch + owned lock — no orphan chains, no lock clobbering
 * 8. Explicit fallback semantics: mode + fallbackKind for UI differentiation
 * 9. Race-proof refetch: timer clear → abort → force-reset → fetch → reschedule
 *
 * Bugs fixed:
 * - v2: StrictMode cleanup reset fetchingRef → mount#1 clobbered mount#2's lock
 *   Fix: owned lock release (requestId === latestRequestRef)
 * - v3: Visibility handler did immediate doFetch on each visible event →
 *   rapid tab-toggle caused fetch storm.
 *   Fix: visibility handler only reschedules timer, no immediate fetch.
 * - v4: Fixed 5s cooldown still allowed ~6s fetch spam when browser rapidly toggles
 *   hidden/visible (headless, screen readers). The 60s timer was destroyed on each
 *   hidden event and recreated on visible, never completing.
 *   Fix: Track scheduled fire time (nextFetchAtRef). On visible, resume with
 *   REMAINING time — timer countdown survives visibility toggles.
 */

import { useState, useEffect, useRef, useCallback } from 'react';
import {
  getDashboardDataAsync,
  type DashboardData,
  type DashboardDataResult,
} from './dashboard-data-source';

// ── Types ────────────────────────────────────────────────────────────────────

export type FallbackKind = 'none' | 'endpoint-missing' | 'degraded' | 'unknown';
export type DashboardMode = 'loading' | 'active' | 'empty' | 'fallback' | 'error';

export interface RealtimeDashboardState {
  data: DashboardData | null;
  loading: boolean;
  error: boolean;
  errorMessage: string | null;
  isFallback: boolean;
  fallbackKind: FallbackKind;
  fallbackMessage: string | null;
  mode: DashboardMode;
  /** Manual refetch — call after mutations for instant UI update */
  refetch: () => void;
}

// ── Interval Strategy ────────────────────────────────────────────────────────

const INTERVAL_ACTIVE_MS   = 8_000;
const INTERVAL_IDLE_MS     = 15_000;
const INTERVAL_FALLBACK_MS = 60_000;
const INTERVAL_HIDDEN_MS   = 30_000;
const BACKOFF_BASE_MS      = 2_000;
const BACKOFF_MAX_MS       = 60_000;

function getAdaptiveInterval(data: DashboardData | null, fallbackKind: FallbackKind, isHidden: boolean): number {
  if (isHidden) return Math.max(INTERVAL_HIDDEN_MS, INTERVAL_FALLBACK_MS);
  if (fallbackKind !== 'none') return INTERVAL_FALLBACK_MS;
  if (!data) return INTERVAL_ACTIVE_MS;
  const count = data.todayStats?.totalAppointments ?? 0;
  if (count === 0) return INTERVAL_IDLE_MS;
  return INTERVAL_ACTIVE_MS;
}

function getBackoffInterval(consecutiveErrors: number): number {
  return Math.min(BACKOFF_MAX_MS, BACKOFF_BASE_MS * Math.pow(2, consecutiveErrors - 1));
}

function classifyFallback(result: DashboardDataResult): FallbackKind {
  if (!result.fallback) return 'none';
  const err = result.error ?? '';
  if (err.includes('404') || err.includes('Not Found')) return 'endpoint-missing';
  if (err.includes('timeout') || err.includes('timed out')) return 'degraded';
  if (err.includes('500') || err.includes('502') || err.includes('503')) return 'degraded';
  return 'unknown';
}

function deriveMode(data: DashboardData | null, loading: boolean, error: boolean, fallbackKind: FallbackKind): DashboardMode {
  if (loading) return 'loading';
  if (error) return 'error';
  if (fallbackKind !== 'none') return 'fallback';
  if (!data) return 'empty';
  return 'active';
}

function deriveFallbackMessage(kind: FallbackKind, rawError: string | null): string | null {
  switch (kind) {
    case 'none': return null;
    case 'endpoint-missing': return 'Dashboard API henüz aktif değil — önbellek verisi gösteriliyor.';
    case 'degraded': return 'API yanıt vermiyor — önbellek verisi gösteriliyor.';
    case 'unknown': return rawError ?? 'API bağlantısı kurulamadı — önbellek verisi gösteriliyor.';
  }
}

// ── Hook ─────────────────────────────────────────────────────────────────────

export function useRealtimeDashboard(): RealtimeDashboardState {
  const [data, setData] = useState<DashboardData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [fallbackKind, setFallbackKind] = useState<FallbackKind>('none');

  // Refs — mutable, no re-render
  const timerRef         = useRef<ReturnType<typeof setTimeout> | null>(null);
  const abortRef         = useRef<AbortController | null>(null);
  const fetchingRef      = useRef(false);
  const requestIdRef     = useRef(0);
  const latestRequestRef = useRef(0);
  const errCountRef      = useRef(0);
  const dataRef          = useRef<DashboardData | null>(null);
  const fallbackKindRef  = useRef<FallbackKind>('none');
  const mountedRef       = useRef(false);
  const effectEpochRef   = useRef(0);
  /** Timestamp when the next scheduled poll should fire */
  const nextFetchAtRef   = useRef(0);

  /**
   * Core fetch — single-flight with OWNED lock release + stale-response-drop
   */
  const doFetch = useCallback(async () => {
    if (fetchingRef.current) return;
    fetchingRef.current = true;

    requestIdRef.current += 1;
    const myId = requestIdRef.current;
    latestRequestRef.current = myId;

    abortRef.current?.abort();
    const controller = new AbortController();
    abortRef.current = controller;

    let result: DashboardDataResult;
    try {
      result = await getDashboardDataAsync(controller.signal);
    } catch {
      if (myId === latestRequestRef.current) fetchingRef.current = false;
      if (controller.signal.aborted) return;
      if (myId !== latestRequestRef.current) return;
      if (!mountedRef.current) return;

      errCountRef.current += 1;
      setError(true);
      setErrorMessage('Dashboard verisi yüklenemedi.');
      setLoading(false);
      return;
    }

    if (myId === latestRequestRef.current) fetchingRef.current = false;

    if (controller.signal.aborted) return;
    if (myId !== latestRequestRef.current) return;
    if (!mountedRef.current) return;

    if (result.error && !result.fallback) {
      errCountRef.current += 1;
      fallbackKindRef.current = 'none';
      setFallbackKind('none');
      setError(true);
      setErrorMessage(result.error);
      setData(null);
      dataRef.current = null;
    } else if (result.fallback) {
      errCountRef.current = 0;
      const kind = classifyFallback(result);
      fallbackKindRef.current = kind;
      setFallbackKind(kind);
      setErrorMessage(result.error ?? null);
      setError(false);
      setData(result.data);
      dataRef.current = result.data;
    } else {
      errCountRef.current = 0;
      fallbackKindRef.current = 'none';
      setFallbackKind('none');
      setData(result.data);
      dataRef.current = result.data;
      setError(false);
      setErrorMessage(null);
    }

    setLoading(false);
  }, []);

  // Schedule next poll — clears existing timer, epoch-scoped
  const scheduleNext = useCallback((epoch: number) => {
    if (!mountedRef.current) return;
    if (epoch !== effectEpochRef.current) return;

    if (timerRef.current) {
      clearTimeout(timerRef.current);
      timerRef.current = null;
    }

    const errs = errCountRef.current;
    const delay = errs > 0
      ? getBackoffInterval(errs)
      : getAdaptiveInterval(dataRef.current, fallbackKindRef.current, document.hidden);

    nextFetchAtRef.current = Date.now() + delay;

    timerRef.current = setTimeout(async () => {
      if (!mountedRef.current) return;
      if (epoch !== effectEpochRef.current) return;
      await doFetch();
      scheduleNext(epoch);
    }, delay);
  }, [doFetch]);

  // Race-proof refetch
  const refetch = useCallback(() => {
    const epoch = effectEpochRef.current;
    if (timerRef.current) {
      clearTimeout(timerRef.current);
      timerRef.current = null;
    }
    abortRef.current?.abort();
    fetchingRef.current = false;
    if (!mountedRef.current) return;
    doFetch().then(() => {
      if (mountedRef.current && epoch === effectEpochRef.current) {
        scheduleNext(epoch);
      }
    });
  }, [doFetch, scheduleNext]);

  useEffect(() => {
    mountedRef.current = true;
    effectEpochRef.current += 1;
    const myEpoch = effectEpochRef.current;
    fetchingRef.current = false;

    doFetch().then(() => {
      if (mountedRef.current && myEpoch === effectEpochRef.current) {
        scheduleNext(myEpoch);
      }
    });

    // ── Visibility API ──
    // On hidden: pause polling (clear timer, preserve nextFetchAtRef)
    // On visible: resume with REMAINING time — countdown survives toggles
    // If timer already expired while hidden: fetch immediately, then reschedule
    const handleVisibility = () => {
      if (myEpoch !== effectEpochRef.current) return;
      if (document.hidden) {
        // Pause: clear timer but keep nextFetchAtRef so we know how much time remains
        if (timerRef.current) {
          clearTimeout(timerRef.current);
          timerRef.current = null;
        }
      } else if (mountedRef.current && !timerRef.current) {
        // Resume: calculate remaining time from the original schedule
        const remaining = nextFetchAtRef.current - Date.now();
        if (remaining <= 0) {
          // Timer would have already fired while we were hidden — fetch now
          abortRef.current?.abort();
          fetchingRef.current = false;
          doFetch().then(() => {
            if (mountedRef.current && myEpoch === effectEpochRef.current) {
              scheduleNext(myEpoch);
            }
          });
        } else {
          // Timer hasn't expired — resume with remaining time, not a full interval
          timerRef.current = setTimeout(async () => {
            if (!mountedRef.current) return;
            if (myEpoch !== effectEpochRef.current) return;
            await doFetch();
            scheduleNext(myEpoch);
          }, remaining);
        }
      }
    };

    document.addEventListener('visibilitychange', handleVisibility);

    return () => {
      mountedRef.current = false;
      if (timerRef.current) {
        clearTimeout(timerRef.current);
        timerRef.current = null;
      }
      abortRef.current?.abort();
      document.removeEventListener('visibilitychange', handleVisibility);
    };
  }, [doFetch, scheduleNext]);

  const isFallback = fallbackKind !== 'none';
  const mode = deriveMode(data, loading, error, fallbackKind);
  const fallbackMessage = deriveFallbackMessage(fallbackKind, errorMessage);

  return { data, loading, error, errorMessage, isFallback, fallbackKind, fallbackMessage, mode, refetch };
}
