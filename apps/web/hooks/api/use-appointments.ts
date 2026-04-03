'use client';

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import apiClient from '@/lib/api-client';

// ── Tipler ────────────────────────────────────────────────────────────────────

export type AppointmentStatus =
  | 'PENDING'
  | 'CONFIRMED'
  | 'CHECKED_IN'
  | 'IN_SERVICE'
  | 'COMPLETED'
  | 'CANCELLED'
  | 'NO_SHOW';

export type AppointmentSource =
  | 'WALK_IN'
  | 'PHONE'
  | 'WHATSAPP'
  | 'ONLINE'
  | 'AI_ASSISTANT'
  | 'RECEPTIONIST';

export interface Appointment {
  id:             string;
  tenantId:       string;
  customerId:     string;
  staffId:        string;
  serviceId:      string;
  locationId:     string;
  roomId?:        string | null;
  startTime:      string; // ISO8601
  endTime:        string; // ISO8601
  status:         AppointmentStatus;
  source:         AppointmentSource;
  notes?:         string | null;
  internalNotes?: string | null;
  totalPrice?:    string | null; // Prisma Decimal → JSON string
  depositPaid?:   string | null;
  createdAt:          string;
  updatedAt:          string;
  cancelledAt?:       string | null;
  cancellationReason?: string | null;
  // Nested relations (populated by API)
  customer?: { id: string; firstName: string; lastName: string; phone?: string };
  service?:  { id: string; name: string; durationMin: number; price?: string };
  staff?:    { id: string; firstName: string; lastName: string };
}

export interface CreateAppointmentPayload {
  customerId:     string;
  staffId:        string;
  serviceId:      string;
  locationId:     string;
  roomId?:        string;
  startTime:      string; // ISO8601
  endTime:        string; // ISO8601
  source?:        AppointmentSource;
  notes?:         string;
  internalNotes?: string;
  totalPrice?:    number;
  depositPaid?:   number;
}

// ── Sorgular ──────────────────────────────────────────────────────────────────

/** Server-side filtre parametreleri — backend GET /appointments kontratı */
export interface AppointmentFilters {
  startDate?:  string; // ISO8601
  endDate?:    string; // ISO8601
  status?:     AppointmentStatus;
  staffId?:    string;
  customerId?: string;
}

/**
 * Randevu listesi — server-side filtering.
 * Filtre parametreleri backend'e query param olarak gönderilir.
 * Query key filtre state'ini içerir → filtre değişince otomatik refetch.
 */
export function useAppointments(filters: AppointmentFilters = {}) {
  return useQuery<Appointment[], Error>({
    queryKey: ['appointments', filters],
    queryFn:  () => {
      const params = new URLSearchParams();
      if (filters.startDate)  params.set('startDate',  filters.startDate);
      if (filters.endDate)    params.set('endDate',    filters.endDate);
      if (filters.status)     params.set('status',     filters.status);
      if (filters.staffId)    params.set('staffId',    filters.staffId);
      if (filters.customerId) params.set('customerId', filters.customerId);
      const qs = params.toString();
      return apiClient
        .get<Appointment[]>(`/appointments${qs ? `?${qs}` : ''}`)
        .then((r) => r.data);
    },
  });
}

// ── Mutasyonlar ───────────────────────────────────────────────────────────────

export function useCreateAppointment() {
  const qc = useQueryClient();

  return useMutation<Appointment, Error, CreateAppointmentPayload>({
    mutationFn: (payload) =>
      apiClient.post<Appointment>('/appointments', payload).then((r) => r.data),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['appointments'] });
    },
  });
}

// ── Reschedule ────────────────────────────────────────────────────────────────

export interface ReschedulePayload {
  appointmentId: string;
  newStartTime:  string; // ISO8601
  newEndTime:    string; // ISO8601
  reason?:       string;
}

/**
 * Randevu yeniden planlama — PATCH /appointments/:id/reschedule
 * Sadece PENDING ve CONFIRMED statülerinde izin verilir.
 */
export function useRescheduleAppointment() {
  const qc = useQueryClient();

  return useMutation<Appointment, Error, ReschedulePayload>({
    mutationFn: ({ appointmentId, newStartTime, newEndTime, reason }) =>
      apiClient
        .patch<Appointment>(`/appointments/${appointmentId}/reschedule`, {
          newStartTime,
          newEndTime,
          ...(reason ? { reason } : {}),
        })
        .then((r) => r.data),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['appointments'] });
    },
  });
}

// ── Lifecycle ──────────────────────────────────────────────────────────────────

export interface UpdateStatusPayload {
  appointmentId:      string;
  status:             AppointmentStatus;
  cancellationReason?: string;
}

/**
 * Valid transitions enforced by backend state machine:
 *   PENDING    → CONFIRMED | CANCELLED | NO_SHOW
 *   CONFIRMED  → CHECKED_IN | CANCELLED | NO_SHOW
 *   CHECKED_IN → IN_SERVICE | CANCELLED | NO_SHOW
 *   IN_SERVICE → COMPLETED
 *   COMPLETED  → (terminal)
 *   CANCELLED  → (terminal)
 *   NO_SHOW    → (terminal)
 */
export const NEXT_ACTIONS: Record<AppointmentStatus, AppointmentStatus[]> = {
  PENDING:    ['CONFIRMED', 'CANCELLED', 'NO_SHOW'],
  CONFIRMED:  ['CHECKED_IN', 'CANCELLED', 'NO_SHOW'],
  CHECKED_IN: ['IN_SERVICE', 'CANCELLED', 'NO_SHOW'],
  IN_SERVICE: ['COMPLETED'],
  COMPLETED:  [],
  CANCELLED:  [],
  NO_SHOW:    [],
};

export function useUpdateAppointmentStatus() {
  const qc = useQueryClient();

  return useMutation<Appointment, Error, UpdateStatusPayload>({
    mutationFn: ({ appointmentId, status, cancellationReason }) =>
      apiClient
        .patch<Appointment>(`/appointments/${appointmentId}/status`, {
          status,
          ...(cancellationReason ? { cancellationReason } : {}),
        })
        .then((r) => r.data),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['appointments'] });
    },
  });
}
