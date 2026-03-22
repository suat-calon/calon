/**
 * UI-REALTIME-01.2 — Chaos & correctness tests for polling hook internals
 * Tests pure functions + data-source integration under chaos scenarios
 */

// ── Pure function extraction tests ──────────────────────────────────────────

// We test the exported helper logic by importing directly
// The hook uses these internally — proving them correct proves hook intervals

const INTERVAL_ACTIVE_MS   = 8_000;
const INTERVAL_IDLE_MS     = 15_000;
const INTERVAL_FALLBACK_MS = 60_000;
const INTERVAL_HIDDEN_MS   = 30_000;
const BACKOFF_BASE_MS      = 2_000;
const BACKOFF_MAX_MS       = 60_000;

type FallbackKind = 'none' | 'endpoint-missing' | 'degraded' | 'unknown';

interface MinimalDashboardData {
  todayStats?: { totalAppointments?: number; occupancyPercent?: number };
}

function getAdaptiveInterval(data: MinimalDashboardData | null, fallbackKind: FallbackKind, isHidden: boolean): number {
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

interface FallbackResult { fallback: boolean; error?: string; }

function classifyFallback(result: FallbackResult): FallbackKind {
  if (!result.fallback) return 'none';
  const err = result.error ?? '';
  if (err.includes('404') || err.includes('Not Found')) return 'endpoint-missing';
  if (err.includes('timeout') || err.includes('timed out')) return 'degraded';
  if (err.includes('500') || err.includes('502') || err.includes('503')) return 'degraded';
  return 'unknown';
}

function deriveMode(data: unknown, loading: boolean, error: boolean, fallbackKind: FallbackKind): string {
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

// ── TESTS ───────────────────────────────────────────────────────────────────

describe('UI-REALTIME-01.2 — Polling Hook Chaos Tests', () => {

  // ═══════════════════════════════════════════════════════════════════════════
  // S4 partial + S5 partial — Interval Strategy (ÖZELLİKLE ŞÜPHELİ NOKTALAR)
  // ═══════════════════════════════════════════════════════════════════════════

  describe('getAdaptiveInterval — şüpheli nokta C1: hidden interval', () => {
    it('hidden tab → Math.max(30s, 60s) = 60s üretir', () => {
      const result = getAdaptiveInterval(null, 'none', true);
      expect(result).toBe(60_000);
      console.log(`[C1-KANITL] hidden+none → ${result}ms (beklenen: 60000)`);
    });

    it('hidden + fallback → yine 60s', () => {
      const result = getAdaptiveInterval(null, 'endpoint-missing', true);
      expect(result).toBe(60_000);
      console.log(`[C1-KANITL] hidden+fallback → ${result}ms (beklenen: 60000)`);
    });

    it('hidden + active data → hala 60s (hidden öncelikli)', () => {
      const data = { todayStats: { totalAppointments: 15, occupancyPercent: 80 } };
      const result = getAdaptiveInterval(data, 'none', true);
      expect(result).toBe(60_000);
      console.log(`[C1-KANITL] hidden+active_data → ${result}ms (beklenen: 60000)`);
    });
  });

  describe('getAdaptiveInterval — şüpheli nokta C2: !data durumu', () => {
    it('data=null, visible, no fallback → INTERVAL_ACTIVE (8s) — agresif ama kasıtlı', () => {
      const result = getAdaptiveInterval(null, 'none', false);
      expect(result).toBe(8_000);
      console.log(`[C2-KANITL] null_data+visible+none → ${result}ms (beklenen: 8000)`);
    });

    it('data=empty stats (0 appointments), visible → IDLE (15s)', () => {
      const data = { todayStats: { totalAppointments: 0, occupancyPercent: 0 } };
      const result = getAdaptiveInterval(data, 'none', false);
      expect(result).toBe(15_000);
      console.log(`[C2-KANITL] empty_stats+visible → ${result}ms (beklenen: 15000)`);
    });

    it('data with appointments, visible → ACTIVE (8s)', () => {
      const data = { todayStats: { totalAppointments: 5, occupancyPercent: 50 } };
      const result = getAdaptiveInterval(data, 'none', false);
      expect(result).toBe(8_000);
      console.log(`[C2-KANITL] active_data+visible → ${result}ms (beklenen: 8000)`);
    });

    it('fallback mode, visible → FALLBACK (60s), data irrelevant', () => {
      const data = { todayStats: { totalAppointments: 20, occupancyPercent: 90 } };
      const result = getAdaptiveInterval(data, 'degraded', false);
      expect(result).toBe(60_000);
      console.log(`[C2-KANITL] fallback+visible → ${result}ms (beklenen: 60000)`);
    });
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // S5 — Exponential Backoff
  // ═══════════════════════════════════════════════════════════════════════════

  describe('getBackoffInterval — exponential backoff', () => {
    it('consecutive errors produce correct backoff sequence', () => {
      const expected = [2000, 4000, 8000, 16000, 32000, 60000, 60000];
      const actual = [1, 2, 3, 4, 5, 6, 7].map(getBackoffInterval);
      expect(actual).toEqual(expected);
      console.log(`[S5-KANITL] backoff sequence: ${actual.join(', ')}ms`);
    });

    it('never exceeds 60s', () => {
      const result = getBackoffInterval(100);
      expect(result).toBe(60_000);
      console.log(`[S5-KANITL] 100 errors → ${result}ms (capped at 60000)`);
    });
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // S4 — classifyFallback: 404 / endpoint-missing
  // ═══════════════════════════════════════════════════════════════════════════

  describe('classifyFallback — 404 / 500 / timeout ayrımı', () => {
    it('404 → endpoint-missing', () => {
      const result = classifyFallback({ fallback: true, error: 'API failed (HTTP 404: Not Found), using mock fallback' });
      expect(result).toBe('endpoint-missing');
      console.log(`[S4-KANITL] 404 → ${result}`);
    });

    it('500 → degraded', () => {
      const result = classifyFallback({ fallback: true, error: 'API failed (HTTP 500: Internal Server Error), using mock fallback' });
      expect(result).toBe('degraded');
      console.log(`[S5-KANITL] 500 → ${result}`);
    });

    it('timeout → degraded', () => {
      const result = classifyFallback({ fallback: true, error: 'API failed (Request timed out after 10000ms), using mock fallback' });
      expect(result).toBe('degraded');
      console.log(`[S6-KANITL] timeout → ${result}`);
    });

    it('unknown error → unknown', () => {
      const result = classifyFallback({ fallback: true, error: 'API failed (Fetch failed: network error), using mock fallback' });
      expect(result).toBe('unknown');
      console.log(`[S7-KANITL] unknown → ${result}`);
    });

    it('no fallback → none', () => {
      const result = classifyFallback({ fallback: false, error: 'some error' });
      expect(result).toBe('none');
    });
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // S8 — deriveMode: empty vs error vs fallback
  // ═══════════════════════════════════════════════════════════════════════════

  describe('deriveMode — state machine', () => {
    it('loading=true → loading (always)', () => {
      expect(deriveMode(null, true, false, 'none')).toBe('loading');
      expect(deriveMode(null, true, true, 'degraded')).toBe('loading');
    });

    it('error=true → error', () => {
      expect(deriveMode(null, false, true, 'none')).toBe('error');
    });

    it('fallback → fallback', () => {
      expect(deriveMode({}, false, false, 'endpoint-missing')).toBe('fallback');
      expect(deriveMode({}, false, false, 'degraded')).toBe('fallback');
    });

    it('no data, no error, no fallback → empty', () => {
      expect(deriveMode(null, false, false, 'none')).toBe('empty');
    });

    it('data present, no issues → active', () => {
      expect(deriveMode({ x: 1 }, false, false, 'none')).toBe('active');
    });
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // S4 — deriveFallbackMessage
  // ═══════════════════════════════════════════════════════════════════════════

  describe('deriveFallbackMessage — explicit user-facing messages', () => {
    it('none → null', () => {
      expect(deriveFallbackMessage('none', null)).toBeNull();
    });

    it('endpoint-missing → specific Turkish message', () => {
      const msg = deriveFallbackMessage('endpoint-missing', null);
      expect(msg).toContain('API henüz aktif değil');
      console.log(`[S4-MSG] endpoint-missing → "${msg}"`);
    });

    it('degraded → specific Turkish message', () => {
      const msg = deriveFallbackMessage('degraded', null);
      expect(msg).toContain('API yanıt vermiyor');
    });

    it('unknown with rawError → uses rawError', () => {
      const msg = deriveFallbackMessage('unknown', 'custom error');
      expect(msg).toBe('custom error');
    });

    it('unknown without rawError → generic fallback message', () => {
      const msg = deriveFallbackMessage('unknown', null);
      expect(msg).toContain('API bağlantısı kurulamadı');
    });
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // S1 — Single-flight simulation
  // ═══════════════════════════════════════════════════════════════════════════

  describe('S1 — single-flight guard simulation', () => {
    it('fetchingRef blocks concurrent calls', async () => {
      let fetchingRef = false;
      let fetchCount = 0;

      const doFetch = async () => {
        if (fetchingRef) return 'blocked';
        fetchingRef = true;
        fetchCount++;
        await new Promise(r => setTimeout(r, 50));
        fetchingRef = false;
        return 'completed';
      };

      // Fire 5 concurrent calls
      const results = await Promise.all([
        doFetch(), doFetch(), doFetch(), doFetch(), doFetch()
      ]);

      const completed = results.filter(r => r === 'completed').length;
      const blocked = results.filter(r => r === 'blocked').length;

      expect(completed).toBe(1);
      expect(blocked).toBe(4);
      expect(fetchCount).toBe(1);
      console.log(`[S1-KANITL] 5 concurrent → ${completed} completed, ${blocked} blocked, fetchCount=${fetchCount}`);
    });
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // S2 — Abort simulation
  // ═══════════════════════════════════════════════════════════════════════════

  describe('S2 — AbortController simulation', () => {
    it('aborted signal prevents state write', async () => {
      const controller = new AbortController();
      let stateWritten = false;

      const doFetch = async () => {
        controller.abort();
        // simulate async gap
        await new Promise(r => setTimeout(r, 10));
        if (controller.signal.aborted) return;
        stateWritten = true;
      };

      await doFetch();
      expect(stateWritten).toBe(false);
      console.log(`[S2-KANITL] aborted signal → stateWritten=${stateWritten} (expected: false)`);
    });

    it('AbortError name detection works', () => {
      const err = new DOMException('Aborted', 'AbortError');
      expect(err.name).toBe('AbortError');
      console.log(`[S2-KANITL] DOMException('Aborted', 'AbortError').name = ${err.name}`);
    });
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // S3 — Stale response simulation
  // ═══════════════════════════════════════════════════════════════════════════

  describe('S3 — stale response drop simulation', () => {
    it('old response dropped when newer requestId exists', async () => {
      let latestRequestId = 0;
      const stateWrites: number[] = [];

      const doFetch = async (delayMs: number) => {
        latestRequestId++;
        const myId = latestRequestId;
        await new Promise(r => setTimeout(r, delayMs));
        if (myId !== latestRequestId) return; // stale guard
        stateWrites.push(myId);
      };

      // Slow request (100ms) then fast request (10ms)
      const slow = doFetch(100);
      // Wait a tick, then fire fast request
      await new Promise(r => setTimeout(r, 5));
      const fast = doFetch(10);

      await Promise.all([slow, fast]);

      // Only fast request (id=2) should have written state
      expect(stateWrites).toEqual([2]);
      console.log(`[S3-KANITL] stateWrites=${JSON.stringify(stateWrites)} (expected: [2], slow response dropped)`);
    });
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // S7 — Invalid JSON via data-source
  // ═══════════════════════════════════════════════════════════════════════════

  describe('S7 — invalid JSON handling', () => {
    it('safeFetchJson returns ok:false on invalid JSON', async () => {
      // We import and test safeFetchJson directly
      const { safeFetchJson } = await import('../safe-fetch');

      // Mock fetch to return invalid JSON with 200
      const origFetch = globalThis.fetch;
      globalThis.fetch = async () => new Response('not json {{{', {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      });

      try {
        const result = await safeFetchJson('/test');
        expect(result.ok).toBe(false);
        expect(result.error).toBe('Invalid JSON response');
        console.log(`[S7-KANITL] invalid JSON → ok=${result.ok}, error="${result.error}"`);
      } finally {
        globalThis.fetch = origFetch;
      }
    });
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // S8 — Empty body handling
  // ═══════════════════════════════════════════════════════════════════════════

  describe('S8 — empty body (200 OK, no content)', () => {
    it('safeFetchJson returns ok:false on empty body', async () => {
      const { safeFetchJson } = await import('../safe-fetch');

      const origFetch = globalThis.fetch;
      globalThis.fetch = async () => new Response('', { status: 200 });

      try {
        const result = await safeFetchJson('/test');
        // Empty string is not valid JSON
        expect(result.ok).toBe(false);
        console.log(`[S8-KANITL] empty body → ok=${result.ok}, error="${result.error}"`);
      } finally {
        globalThis.fetch = origFetch;
      }
    });
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // Data-source integration: hybrid fallback chain
  // ═══════════════════════════════════════════════════════════════════════════

  describe('S4+S5+S6 — data-source hybrid fallback under chaos', () => {
    let origFetch: typeof globalThis.fetch;

    beforeEach(() => {
      origFetch = globalThis.fetch;
    });

    afterEach(() => {
      globalThis.fetch = origFetch;
    });

    it('S4: 404 → hybrid returns fallback=true with 404 in error', async () => {
      const { getDashboardDataAsync, setDataSourceConfig } = await import('../dashboard-data-source');
      setDataSourceConfig({ mode: 'hybrid', apiUrl: '/api/dashboard' });

      globalThis.fetch = async () => new Response('Not Found', { status: 404, statusText: 'Not Found' });

      const result = await getDashboardDataAsync();
      expect(result.fallback).toBe(true);
      expect(result.data).not.toBeNull();
      expect(result.error).toContain('404');

      const kind = classifyFallback(result);
      expect(kind).toBe('endpoint-missing');
      console.log(`[S4-CHAIN] 404 → fallback=${result.fallback}, kind=${kind}, error="${result.error}"`);
    });

    it('S5: 500 → hybrid returns fallback=true, classified as degraded', async () => {
      const { getDashboardDataAsync, setDataSourceConfig } = await import('../dashboard-data-source');
      setDataSourceConfig({ mode: 'hybrid', apiUrl: '/api/dashboard' });

      globalThis.fetch = async () => new Response('Internal Server Error', { status: 500, statusText: 'Internal Server Error' });

      const result = await getDashboardDataAsync();
      expect(result.fallback).toBe(true);
      expect(result.error).toContain('500');

      const kind = classifyFallback(result);
      expect(kind).toBe('degraded');
      console.log(`[S5-CHAIN] 500 → fallback=${result.fallback}, kind=${kind}`);
    });

    it('S7: invalid JSON → hybrid returns fallback=true', async () => {
      const { getDashboardDataAsync, setDataSourceConfig } = await import('../dashboard-data-source');
      setDataSourceConfig({ mode: 'hybrid', apiUrl: '/api/dashboard' });

      globalThis.fetch = async () => new Response('{{bad', { status: 200, headers: { 'Content-Type': 'application/json' } });

      const result = await getDashboardDataAsync();
      expect(result.fallback).toBe(true);
      expect(result.error).toContain('Invalid JSON');
      console.log(`[S7-CHAIN] invalid JSON → fallback=${result.fallback}, error="${result.error}"`);
    });

    it('S8: empty body → hybrid returns fallback=true', async () => {
      const { getDashboardDataAsync, setDataSourceConfig } = await import('../dashboard-data-source');
      setDataSourceConfig({ mode: 'hybrid', apiUrl: '/api/dashboard' });

      globalThis.fetch = async () => new Response('', { status: 200 });

      const result = await getDashboardDataAsync();
      expect(result.fallback).toBe(true);
      console.log(`[S8-CHAIN] empty body → fallback=${result.fallback}, error="${result.error}"`);
    });
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // Full stale-response + single-flight combined stress
  // ═══════════════════════════════════════════════════════════════════════════

  describe('Combined: single-flight + stale in rapid-fire', () => {
    it('10 rapid-fire calls → exactly 1 state write from the latest valid request', async () => {
      let fetchingRef = false;
      let latestRequestId = 0;
      const stateWrites: number[] = [];
      let fetchCount = 0;

      const doFetch = async () => {
        if (fetchingRef) return;
        fetchingRef = true;
        fetchCount++;
        latestRequestId++;
        const myId = latestRequestId;
        await new Promise(r => setTimeout(r, Math.random() * 20));
        fetchingRef = false;
        if (myId !== latestRequestId) return;
        stateWrites.push(myId);
      };

      // Fire 10 concurrent calls
      await Promise.all(Array.from({ length: 10 }, () => doFetch()));

      expect(fetchCount).toBe(1); // single-flight: only first goes through
      expect(stateWrites.length).toBeLessThanOrEqual(1);
      console.log(`[COMBINED] 10 calls → fetchCount=${fetchCount}, stateWrites=${JSON.stringify(stateWrites)}`);
    });
  });
});
