'use client';

import { useQuery } from '@tanstack/react-query';
import apiClient from '@/lib/api-client';

export interface AuthUser {
  userId:   string;
  tenantId: string;
  role:     string;
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
