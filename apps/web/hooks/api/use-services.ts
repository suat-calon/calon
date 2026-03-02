'use client';

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import apiClient from '@/lib/api-client';

// ── Tipler ────────────────────────────────────────────────────────────────────

export interface Service {
  id:           string;
  tenantId:     string;
  categoryId:   string;
  name:         string;
  description?: string | null;
  durationMin:  number;
  price:        string; // Prisma Decimal → JSON string
  currency:     string;
  depositRate:  string; // Prisma Decimal → JSON string
  isActive:     boolean;
  createdAt:    string;
  updatedAt:    string;
}

export interface CreateServicePayload {
  categoryId:   string;
  name:         string;
  description?: string;
  durationMin:  number;
  price:        number;
  currency?:    string;
  depositRate?: number;
}

// ── Sorgular ──────────────────────────────────────────────────────────────────

export function useServices() {
  return useQuery<Service[], Error>({
    queryKey: ['services'],
    queryFn:  () =>
      apiClient.get<Service[]>('/services').then((r) => r.data),
  });
}

// ── Mutasyonlar ───────────────────────────────────────────────────────────────

export function useCreateService() {
  const qc = useQueryClient();

  return useMutation<Service, Error, CreateServicePayload>({
    mutationFn: (payload) =>
      apiClient.post<Service>('/services', payload).then((r) => r.data),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['services'] });
    },
  });
}
