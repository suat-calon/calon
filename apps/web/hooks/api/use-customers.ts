'use client';

import { useQuery } from '@tanstack/react-query';
import apiClient from '@/lib/api-client';

export interface Customer {
  id:            string;
  tenantId:      string;
  firstName:     string;
  lastName:      string;
  email?:        string | null;
  phone?:        string | null;
  dateOfBirth?:  string | null;
  gender?:       string | null;
  notes?:        string | null;
  loyaltyTier:   string;
  loyaltyPoints: number;
  referralCode?: string | null;
  consentGiven:  boolean;
  isDeleted:     boolean;
  createdAt:     string;
  updatedAt:     string;
}

interface CustomerListResponse {
  data:  Customer[];
  total: number;
  take:  number;
  skip:  number;
}

export function useCustomers(search?: string) {
  return useQuery<CustomerListResponse, Error>({
    queryKey: ['customers', search ?? ''],
    queryFn: () => {
      const params = new URLSearchParams();
      params.set('take', '100');
      if (search) params.set('search', search);
      return apiClient.get<CustomerListResponse>(`/customers?${params}`).then((r) => r.data);
    },
  });
}

export function useCustomer(id: string | null) {
  return useQuery<Customer, Error>({
    queryKey: ['customer', id],
    queryFn: () => apiClient.get<Customer>(`/customers/${id}`).then((r) => r.data),
    enabled: !!id,
  });
}
