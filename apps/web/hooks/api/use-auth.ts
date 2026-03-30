'use client';

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import apiClient from '@/lib/api-client';

export interface AuthUser {
  userId:   string;
  tenantId: string;
  role:     string;
}

export interface TenantLocation {
  id:       string;
  name:     string;
  address?: string | null;
  city?:    string | null;
  phone?:   string | null;
}

export interface Tenant {
  id:         string;
  name:       string;
  slug:       string;
  plan:       string;
  brandColor: string | null;
  logoUrl:    string | null;
  timezone:   string;
  locale:     string;
  currency:   string;
  createdAt:  string;
  location?:  TenantLocation | null;
}

export interface UpdateTenantProfilePayload {
  name?:       string;
  brandColor?: string;
  phone?:      string;
  address?:    string;
  city?:       string;
}

export function useAuth() {
  return useQuery<AuthUser, Error>({
    queryKey: ['auth', 'me'],
    queryFn:  () => apiClient.get<AuthUser>('/auth/me').then((r) => r.data),
    staleTime: 5 * 60 * 1000,
    retry: false,
  });
}

export function useTenant() {
  return useQuery<Tenant, Error>({
    queryKey: ['tenant', 'me'],
    queryFn:  () => apiClient.get<Tenant>('/tenants/me').then((r) => r.data),
    staleTime: 5 * 60 * 1000,
  });
}

export function useUpdateTenantProfile() {
  const qc = useQueryClient();
  return useMutation<Tenant, Error, UpdateTenantProfilePayload>({
    mutationFn: (payload) =>
      apiClient.patch<Tenant>('/tenants/me', payload).then((r) => r.data),
    onSuccess: () => { void qc.invalidateQueries({ queryKey: ['tenant', 'me'] }); },
  });
}
