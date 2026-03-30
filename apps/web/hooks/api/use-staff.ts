'use client';

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import apiClient from '@/lib/api-client';

export interface StaffMember {
  id:             string;
  tenantId:       string;
  locationId?:    string | null;
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

export interface WorkingHourEntry {
  dayOfWeek:    string;
  startTime:    string;
  endTime:      string;
  isWorkingDay: boolean;
  breakStart?:  string;
  breakEnd?:    string;
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

export function useSetWorkingHours() {
  const qc = useQueryClient();
  return useMutation<WorkingHour[], Error, { staffId: string; hours: WorkingHourEntry[] }>({
    mutationFn: ({ staffId, hours }) =>
      apiClient.put<WorkingHour[]>(`/staff/${staffId}/working-hours`, { hours }).then((r) => r.data),
    onSuccess: () => { void qc.invalidateQueries({ queryKey: ['staff'] }); },
  });
}
