'use client';

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import apiClient from '@/lib/api-client';

// ── Tipler ────────────────────────────────────────────────────────────────────

export interface Product {
  id:           string;
  tenantId:     string;
  name:         string;
  sku?:         string | null;
  unit:         string;
  stockAmount:  string; // Prisma Decimal → JSON string
  minStock:     string; // Prisma Decimal → JSON string
  costPrice:    string; // Prisma Decimal → JSON string
  isActive:     boolean;
  isDeleted:    boolean;
  createdAt:    string;
  updatedAt:    string;
}

export interface CreateProductPayload {
  name:         string;
  sku?:         string;
  unit?:        string;
  stockAmount?: number;
  minStock?:    number;
  costPrice?:   number;
}

export interface UpdateProductPayload {
  name?:        string;
  sku?:         string;
  unit?:        string;
  stockAmount?: number;
  minStock?:    number;
  costPrice?:   number;
  isActive?:    boolean;
}

// ── Sorgular ──────────────────────────────────────────────────────────────────

export function useProducts() {
  return useQuery<Product[], Error>({
    queryKey: ['products'],
    queryFn:  () =>
      apiClient.get<Product[]>('/products').then((r) => r.data),
  });
}

// ── Mutasyonlar ───────────────────────────────────────────────────────────────

export function useCreateProduct() {
  const qc = useQueryClient();
  return useMutation<Product, Error, CreateProductPayload>({
    mutationFn: (payload) =>
      apiClient.post<Product>('/products', payload).then((r) => r.data),
    onSuccess: () => { void qc.invalidateQueries({ queryKey: ['products'] }); },
  });
}

export function useUpdateProduct() {
  const qc = useQueryClient();
  return useMutation<Product, Error, { id: string } & UpdateProductPayload>({
    mutationFn: ({ id, ...payload }) =>
      apiClient.patch<Product>(`/products/${id}`, payload).then((r) => r.data),
    onSuccess: () => { void qc.invalidateQueries({ queryKey: ['products'] }); },
  });
}

export function useDeleteProduct() {
  const qc = useQueryClient();
  return useMutation<void, Error, string>({
    mutationFn: (id) => apiClient.delete(`/products/${id}`).then(() => {}),
    onSuccess: () => { void qc.invalidateQueries({ queryKey: ['products'] }); },
  });
}
