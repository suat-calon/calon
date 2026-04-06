'use client';

import { useQuery } from '@tanstack/react-query';
import apiClient from '@/lib/api-client';

// ── Admin API client — uses same JWT/cookie session as main app ─────────────
// No separate admin key needed. Access is controlled by SUPER_ADMIN role in JWT.
// TenantGuard parses JWT → AdminGuard checks role === SUPER_ADMIN.

// ── Types ───────────────────────────────────────────────────────────────────

export interface AdminOverview {
  totalTenants:    number;
  activeTenants:   number;
  trialTenants:    number;
  suspendedTenants: number;
}

export interface AdminTenant {
  id:        string;
  name:      string;
  slug:      string;
  plan:      string;
  status:    string;
  createdAt: string;
  ownerEmail?: string;
  billingStatus?: string;
}

export interface AdminTenantDetail extends AdminTenant {
  timezone?: string;
  locale?: string;
  currency?: string;
  locations?: Array<{ id: string; name: string; city: string; phone: string }>;
  staffCount?: number;
  serviceCount?: number;
  appointmentCount?: number;
  customerCount?: number;
}

export interface GrowthMetrics {
  totalSalons:              number;
  activeSalons?:            number;  // Not returned by API — derived if needed
  newSalonsThisMonth:       number;
  bookingsToday:            number;
  activationRateThisMonth?: number;
  estimatedMRR?:            number;  // API field name (was monthlyRecurringRevenue)
  monthlyRecurringRevenue?: number;  // Alias kept for backward compat
  planDistribution?:        Record<string, number>;  // Not returned by growth endpoint
}

export interface BillingTenant {
  id:             string;
  tenantId:       string;
  plan:           string;
  cycle:          string;
  status:         string;
  trialEndsAt?:   string;
  nextBillingAt?: string;
}

export interface BillingMetrics {
  totalActive:  number;
  totalRevenue: number;
  pastDue:      number;
}

export interface HealthStatus {
  status:    string;
  service?:  string;
  timestamp: string;
  checks?: {
    database: { status: string; latencyMs: number };
    redis:    { status: string; latencyMs: number };
  };
}

export interface VersionInfo {
  version:     string;
  commit:      string;
  buildTime:   string;
  nodeVersion: string;
  environment: string;
}

// ── Queries ─────────────────────────────────────────────────────────────────

export function useAdminOverview() {
  return useQuery<AdminOverview, Error>({
    queryKey: ['admin', 'overview'],
    queryFn: () => apiClient.get('/admin/tenants/overview').then(r => r.data?.data ?? r.data),
    retry: false,
  });
}

export function useAdminTenants() {
  return useQuery<AdminTenant[], Error>({
    queryKey: ['admin', 'tenants'],
    queryFn: () => apiClient.get('/admin/tenants?limit=100').then(r => {
      const body = r.data?.data ?? r.data;
      const items = Array.isArray(body) ? body : (body?.items ?? []);
      // Normalize: backend returns billing as nested object, flatten status for UI
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      return (items as any[]).map((t: any) => ({
        ...t,
        status: t.billing?.status ?? t.status ?? 'UNKNOWN',
      })) as AdminTenant[];
    }),
    retry: false,
  });
}

export function useAdminTenantDetail(tenantId: string | null) {
  return useQuery<AdminTenantDetail, Error>({
    queryKey: ['admin', 'tenant', tenantId],
    queryFn: () => apiClient.get(`/admin/tenants/${tenantId}`).then(r => r.data?.data ?? r.data),
    enabled: !!tenantId,
    retry: false,
  });
}

export function useGrowthMetrics() {
  return useQuery<GrowthMetrics, Error>({
    queryKey: ['admin', 'growth'],
    queryFn: () => apiClient.get('/admin/dashboard/metrics').then(r => r.data),
    retry: false,
  });
}

export function useBillingTenants() {
  return useQuery<BillingTenant[], Error>({
    queryKey: ['admin', 'billing', 'tenants'],
    queryFn: () => apiClient.get('/admin/billing/tenants').then(r => r.data),
    retry: false,
  });
}

export function useBillingMetrics() {
  // Billing KPI'ları tenant listesinden client-side derive edilir.
  // /admin/billing/metrics endpoint'i platform ops metrikleri dönüyor (requestMetrics, queueStats),
  // billing summary (totalActive, totalRevenue, pastDue) için ayrı endpoint yok.
  return useQuery<BillingMetrics, Error>({
    queryKey: ['admin', 'billing', 'metrics'],
    queryFn: async () => {
      const r = await apiClient.get('/admin/billing/tenants');
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const tenants: any[] = Array.isArray(r.data) ? r.data : (r.data?.data ?? []);
      return {
        totalActive: tenants.filter(t => t.status === 'ACTIVE').length,
        totalRevenue: 0, // No revenue tracking endpoint yet
        pastDue: tenants.filter(t => t.status === 'PAST_DUE').length,
      };
    },
    retry: false,
  });
}

export function useHealthStatus() {
  return useQuery<HealthStatus, Error>({
    queryKey: ['admin', 'health'],
    queryFn: () => apiClient.get('/health/ready').then(r => r.data),
    refetchInterval: 30_000,
  });
}

export function useVersionInfo() {
  return useQuery<VersionInfo, Error>({
    queryKey: ['admin', 'version'],
    queryFn: () => apiClient.get('/health/version').then(r => r.data),
  });
}
