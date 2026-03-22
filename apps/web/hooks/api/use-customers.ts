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
  loyaltyTier:   string;
  loyaltyPoints: number;
  referralCode?: string | null;
  createdAt:     string;
}

interface CustomerListResponse {
  data:  Customer[];
  total: number;
  take:  number;
  skip:  number;
}

export function useCustomers() {
  return useQuery<CustomerListResponse, Error>({
    queryKey: ['customers'],
    queryFn:  () => apiClient.get<CustomerListResponse>('/customers').then((r) => r.data),
  });
}
