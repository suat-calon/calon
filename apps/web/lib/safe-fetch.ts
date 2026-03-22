/**
 * Safe Fetch — Defensive HTTP Wrapper
 * FAZ UI-13.1 TASK 4: Timeout, try/catch, invalid JSON safe fail
 *
 * Guarantees:
 * - Never throws
 * - Timeout support (default 10s)
 * - Invalid JSON → { ok: false }
 * - Non-200 → { ok: false, error }
 */

// ── Types ────────────────────────────────────────────────────────────────────

export interface SafeFetchResult<T> {
  ok: boolean;
  data: T | null;
  status?: number;
  error?: string;
}

export interface SafeFetchOptions extends Omit<RequestInit, 'signal'> {
  /** Timeout in milliseconds (default 10000) */
  timeoutMs?: number;
  /** External abort signal — combined with timeout signal */
  signal?: AbortSignal;
}

// ── Constants ────────────────────────────────────────────────────────────────

const DEFAULT_TIMEOUT_MS = 10_000;

// ── API ──────────────────────────────────────────────────────────────────────

/**
 * Fetch JSON from a URL with timeout and safe error handling.
 * Never throws — always returns a result object.
 */
export async function safeFetchJson<T>(
  url: string,
  options: SafeFetchOptions = {},
): Promise<SafeFetchResult<T>> {
  const { timeoutMs = DEFAULT_TIMEOUT_MS, signal: externalSignal, ...fetchOptions } = options;

  try {
    const timeoutSignal = AbortSignal.timeout(timeoutMs);
    const combinedSignal = externalSignal
      ? AbortSignal.any([timeoutSignal, externalSignal])
      : timeoutSignal;

    const response = await fetch(url, {
      ...fetchOptions,
      signal: combinedSignal,
      headers: {
        'Accept': 'application/json',
        ...fetchOptions.headers,
      },
    });

    if (!response.ok) {
      return {
        ok: false,
        data: null,
        status: response.status,
        error: `HTTP ${response.status}: ${response.statusText}`,
      };
    }

    // Safe JSON parse
    const text = await response.text();
    try {
      const data = JSON.parse(text) as T;
      return { ok: true, data, status: response.status };
    } catch {
      return {
        ok: false,
        data: null,
        status: response.status,
        error: 'Invalid JSON response',
      };
    }
  } catch (err) {
    const name = err instanceof Error ? err.name : '';
    if (name === 'AbortError' || name === 'TimeoutError') {
      return {
        ok: false,
        data: null,
        error: `Request timed out after ${timeoutMs}ms`,
      };
    }

    const message = err instanceof Error ? err.message : String(err);
    return {
      ok: false,
      data: null,
      error: `Fetch failed: ${message}`,
    };
  }
}
