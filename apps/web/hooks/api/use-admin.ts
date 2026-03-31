'use client';

import { useQuery } from '@tanstack/react-query';
import axios from 'axios';

// ── Admin API client — uses x-admin-api-key header ──────────────────────────

const ADMIN_API_KEY = typeof window !== 'undefined'
  ? (window as unknown as Record<string, string>).__ADMIN_KEY__ ?? ''
  : '';

function getAdminKey(): string {
  if (typeof window === 'undefined') return '';
  return sessionStorage.getItem('calon_admin_key') ?? '';
}

const adminClient = axios.create({
  baseURL: '/api/v1',
  withCredentials: true,
});

adminClient.interceptors.request.use((config) => {
  const key = getAdminKey();
  if (key) config.headers['x-admin-api-key'] = key;
  return config;
});

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
  totalSalons:          number;
  activeSalons:         number;
  newSalonsThisMonth:   number;
  bookingsToday:        number;
  monthlyRecurringRevenue: number;
  planDistribution:     Record<string, number>;
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
    queryFn: () => adminClient.get('/admin/tenants/overview').then(r => r.data),
    retry: false,
  });
}

export function useAdminTenants() {
  return useQuery<AdminTenant[], Error>({
    queryKey: ['admin', 'tenants'],
    queryFn: () => adminClient.get('/admin/tenants').then(r => r.data),
    retry: false,
  });
}

export function useAdminTenantDetail(tenantId: string | null) {
  return useQuery<AdminTenantDetail, Error>({
    queryKey: ['admin', 'tenant', tenantId],
    queryFn: () => adminClient.get(`/admin/tenants/${tenantId}`).then(r => r.data),
    enabled: !!tenantId,
    retry: false,
  });
}

export function useGrowthMetrics() {
  return useQuery<GrowthMetrics, Error>({
    queryKey: ['admin', 'growth'],
    queryFn: () => adminClient.get('/admin/dashboard/metrics').then(r => r.data),
    retry: false,
  });
}

export function useBillingTenants() {
  return useQuery<BillingTenant[], Error>({
    queryKey: ['admin', 'billing', 'tenants'],
    queryFn: () => adminClient.get('/admin/billing/tenants').then(r => r.data),
    retry: false,
  });
}

export function useBillingMetrics() {
  return useQuery<BillingMetrics, Error>({
    queryKey: ['admin', 'billing', 'metrics'],
    queryFn: () => adminClient.get('/admin/billing/metrics').then(r => r.data),
    retry: false,
  });
}

export function useHealthStatus() {
  return useQuery<HealthStatus, Error>({
    queryKey: ['admin', 'health'],
    queryFn: () => adminClient.get('/health/ready').then(r => r.data),
    refetchInterval: 30_000,
  });
}

export function useVersionInfo() {
  return useQuery<VersionInfo, Error>({
    queryKey: ['admin', 'version'],
    queryFn: () => adminClient.get('/health/version').then(r => r.data),
  });
}
