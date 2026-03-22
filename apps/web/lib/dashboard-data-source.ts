/**
 * Dashboard Data Source — Real Chain
 * FAZ UI-13.1 TASK 3: api → hybrid → mock data source with fallback
 *
 * Modes:
 * - api:    Fetch from API, fail on error
 * - hybrid: Fetch from API, fallback to mock on failure
 * - mock:   Direct mock data
 *
 * Guarantees:
 * - Page NEVER imports mock directly
 * - Null/corrupt data → safe fallback or null
 * - Every source switch logged to telemetry
 */

import {
  MOCK_DASHBOARD,
  MOCK_EMPTY,
  MOCK_HIGH_LOAD,
  EMPTY_REVENUE,
  EMPTY_CUSTOMERS,
  EMPTY_OPS_STRIP,
  type DashboardData,
  type RevenuePulse,
  type CustomerInsight,
  type OperationsStrip,
} from './dashboard-mock';
import { safeFetchJson } from './safe-fetch';
import { trackDataSource, trackError, trackWarn } from './telemetry';

// ── Types ────────────────────────────────────────────────────────────────────

export type DataSourceMode = 'api' | 'hybrid' | 'mock';
export type MockScenario = 'default' | 'empty' | 'high-load';

export interface DataSourceConfig {
  mode: DataSourceMode;
  /** Mock scenario — used in mock mode or as hybrid fallback */
  mockScenario?: MockScenario;
  /** API endpoint for dashboard data */
  apiUrl?: string;
  /** API timeout in ms */
  apiTimeoutMs?: number;
}

export interface DashboardDataResult {
  data: DashboardData | null;
  source: 'api' | 'mock';
  /** Whether this was a fallback (hybrid mode API fail → mock) */
  fallback: boolean;
  error?: string;
}

// ── Config ────────────────────────────────────────────────────────────────────

let config: DataSourceConfig = {
  mode: 'hybrid',
  mockScenario: 'default',
  apiUrl: '/api/dashboard',
  apiTimeoutMs: 10_000,
};

export function setDataSourceConfig(c: Partial<DataSourceConfig>): void {
  config = { ...config, ...c };
}

export function getDataSourceConfig(): DataSourceConfig {
  return { ...config };
}

// ── Safe Data Accessors ──────────────────────────────────────────────────────

export function safeRevenue(data: DashboardData | null): RevenuePulse {
  return data?.revenue ?? EMPTY_REVENUE;
}

export function safeCustomers(data: DashboardData | null): CustomerInsight {
  return data?.customers ?? EMPTY_CUSTOMERS;
}

export function safeOpsStrip(data: DashboardData | null): OperationsStrip {
  return data?.operationsStrip ?? EMPTY_OPS_STRIP;
}

// ── Validation ───────────────────────────────────────────────────────────────

/**
 * Validate critical dashboard data fields.
 * Returns true if data is safe to use.
 */
export function validateDashboardData(data: unknown): data is DashboardData {
  if (!data || typeof data !== 'object') return false;

  const d = data as Record<string, unknown>;

  // todayStats is required
  if (!d.todayStats || typeof d.todayStats !== 'object') return false;

  const stats = d.todayStats as Record<string, unknown>;
  if (typeof stats.totalAppointments !== 'number') return false;
  if (typeof stats.occupancyPercent !== 'number') return false;

  return true;
}

// ── Mock Data ────────────────────────────────────────────────────────────────

function getMockData(scenario: MockScenario): DashboardData {
  switch (scenario) {
    case 'empty':     return MOCK_EMPTY;
    case 'high-load': return MOCK_HIGH_LOAD;
    default:          return MOCK_DASHBOARD;
  }
}

function fetchMock(scenario: MockScenario): DashboardDataResult {
  const data = getMockData(scenario);
  if (!validateDashboardData(data)) {
    trackError('data', 'mock_validation_failed', new Error('Mock data invalid'));
    return { data: null, source: 'mock', fallback: false, error: 'Mock data validation failed' };
  }
  return { data, source: 'mock', fallback: false };
}

// ── API Fetch ────────────────────────────────────────────────────────────────

async function fetchApi(signal?: AbortSignal): Promise<DashboardDataResult> {
  const url = config.apiUrl ?? '/api/dashboard';
  const result = await safeFetchJson<DashboardData>(url, {
    timeoutMs: config.apiTimeoutMs ?? 10_000,
    credentials: 'include',
    signal,
  });

  if (!result.ok || !result.data) {
    return {
      data: null,
      source: 'api',
      fallback: false,
      error: result.error ?? `API failed with status ${result.status}`,
    };
  }

  if (!validateDashboardData(result.data)) {
    return {
      data: null,
      source: 'api',
      fallback: false,
      error: 'API response validation failed',
    };
  }

  return { data: result.data, source: 'api', fallback: false };
}

// ── Main Entry Points ────────────────────────────────────────────────────────

/**
 * Synchronous data fetch — for mock mode only.
 * Used when data is needed immediately (initial render).
 */
export function fetchDashboardData(): DashboardDataResult {
  try {
    if (config.mode === 'mock') {
      const result = fetchMock(config.mockScenario ?? 'default');
      trackDataSource('mock', result.data !== null, { scenario: config.mockScenario });
      return result;
    }

    // For api/hybrid modes in sync context, start with mock as initial data
    // The async version should be used for real API calls
    if (config.mode === 'hybrid') {
      const result = fetchMock(config.mockScenario ?? 'default');
      trackDataSource('mock', result.data !== null, { mode: 'hybrid_initial' });
      return { ...result, fallback: true };
    }

    // api mode sync — no data available without async
    trackDataSource('api', false, { reason: 'sync_context' });
    return { data: null, source: 'api', fallback: false, error: 'Use getDashboardDataAsync for API mode' };
  } catch (err) {
    trackError('data', 'fetch_failed', err);
    return { data: null, source: 'mock', fallback: false, error: String(err) };
  }
}

/**
 * Async data fetch — supports real API calls.
 *
 * api mode:    Fetch from API, fail on error
 * hybrid mode: Fetch from API, fallback to mock on failure
 * mock mode:   Return mock immediately
 */
export async function getDashboardDataAsync(signal?: AbortSignal): Promise<DashboardDataResult> {
  try {
    switch (config.mode) {
      case 'mock': {
        const result = fetchMock(config.mockScenario ?? 'default');
        trackDataSource('mock', result.data !== null, { scenario: config.mockScenario });
        return result;
      }

      case 'api': {
        const result = await fetchApi(signal);
        trackDataSource('api', result.data !== null, {
          error: result.error,
        });
        return result;
      }

      case 'hybrid': {
        const apiResult = await fetchApi(signal);
        if (apiResult.data) {
          trackDataSource('api', true, { mode: 'hybrid' });
          return apiResult;
        }

        // API failed → fallback to mock
        trackWarn('data', 'dashboard_data_fallback_used', {
          apiError: apiResult.error,
          scenario: config.mockScenario,
        });

        const mockResult = fetchMock(config.mockScenario ?? 'default');
        return {
          ...mockResult,
          fallback: true,
          error: `API failed (${apiResult.error}), using mock fallback`,
        };
      }

      default: {
        return { data: null, source: 'mock', fallback: false, error: `Unknown mode: ${config.mode}` };
      }
    }
  } catch (err) {
    trackError('data', 'fetch_failed', err);
    return { data: null, source: 'mock', fallback: false, error: String(err) };
  }
}

// ── Re-exports for migration convenience ──────────────────────────────────────

export { EMPTY_REVENUE, EMPTY_CUSTOMERS, EMPTY_OPS_STRIP };
export type {
  DashboardData,
  RevenuePulse,
  CustomerInsight,
  AppointmentOp,
  AppointmentStatus,
  ServiceStat,
  StaffStat,
  DashboardAction,
} from './dashboard-mock';
