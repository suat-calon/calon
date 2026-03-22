'use client';

import { useQuery } from '@tanstack/react-query';
import apiClient from '@/lib/api-client';

export interface StaffMember {
  id:             string;
  tenantId:       string;
  firstName:      string;
  lastName:       string;
  phone?:         string | null;
  title?:         string | null;
  colorHex?:      string | null;
  commissionRate: number;
  isActive:       boolean;
  createdAt:      string;
  workingHours?:  WorkingHour[];
}

export interface WorkingHour {
  dayOfWeek:    string;
  startTime:    string;
  endTime:      string;
  isWorkingDay: boolean;
  breakStart?:  string | null;
  breakEnd?:    string | null;
}

interface StaffListResponse {
  data:  StaffMember[];
  total: number;
  take:  number;
  skip:  number;
}

export function useStaff() {
  return useQuery<StaffListResponse, Error>({
    queryKey: ['staff'],
    queryFn:  () => apiClient.get<StaffListResponse>('/staff').then((r) => r.data),
  });
}
