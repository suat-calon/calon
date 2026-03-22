/**
 * IAppointmentRepository — Domain repository contract.
 *
 * All appointment persistence operations go through this interface.
 * Implementations (PrismaAppointmentRepository) handle ORM details.
 * Services depend ONLY on this interface — never on Prisma directly.
 */

import { Appointment, AppointmentStatus } from '@calon/database';

export const APPOINTMENT_REPO = Symbol('IAppointmentRepository');

// ── Input types ───────────────────────────────────────────────────────────────

export interface AppointmentFilters {
  startDate?:  string;
  endDate?:    string;
  status?:     string;
  staffId?:    string;
  customerId?: string;
}

export interface AppointmentCreateInput {
  tenantId:      string;
  customerId:    string;
  staffId:       string;
  serviceId:     string;
  locationId:    string;
  roomId?:       string | null;
  startTime:     Date;
  endTime:       Date;
  source?:       string;
  notes?:        string | null;
  internalNotes?: string | null;
  totalPrice?:   number | string | null;
  depositPaid?:  number | string | null;
  status?:       AppointmentStatus;
  isTestBooking?: boolean;
}

export interface AppointmentUpdateInput {
  status?:      AppointmentStatus;
  totalPrice?:  unknown;   // Money or Decimal-compatible
  depositPaid?: unknown;
  staffId?:     string | null;
  startTime?:   Date;
  endTime?:     Date;
  notes?:       string | null;
}

// ── Result types (extend Prisma model with common relations) ──────────────────

export type AppointmentWithRelations = Appointment & {
  customer?: { id: string; firstName: string; lastName: string; phone: string | null; email: string | null } | null;
  service?:  { id: string; name: string; description: string | null; durationMin: number; price: unknown } | null;
  staff?:    { id: string; firstName: string; lastName: string } | null;
  room?:     { id: string; name: string; capacity?: number } | null;
};

// ── Interface ─────────────────────────────────────────────────────────────────

export interface IAppointmentRepository {
  // ── Queries ──────────────────────────────────────────────────────────────

  /** Find appointment by id + tenantId. Returns null if not found or deleted. */
  findById(id: string, tenantId: string): Promise<Appointment | null>;

  /** Find appointment with customer/service/staff/room relations included. */
  findByIdWithRelations(id: string, tenantId: string): Promise<AppointmentWithRelations | null>;

  /** List appointments with optional filters. Returns appointments with core relations. */
  findAll(tenantId: string, filters?: AppointmentFilters): Promise<AppointmentWithRelations[]>;

  // ── Mutations ─────────────────────────────────────────────────────────────

  /** Create a new appointment. Throws GistExclusionError on time-range overlap. */
  create(data: AppointmentCreateInput): Promise<Appointment>;

  /** Update appointment fields. */
  update(id: string, data: AppointmentUpdateInput): Promise<Appointment>;

  // ── Domain queries ────────────────────────────────────────────────────────

  /**
   * Check for time-range overlap for a staff member.
   * Returns true if overlap exists (appointment slot is taken).
   * @param excludeId  Existing appointment id to exclude (for reschedule)
   */
  hasOverlap(
    tenantId:  string,
    staffId:   string,
    startTime: Date,
    endTime:   Date,
    excludeId?: string,
  ): Promise<boolean>;
}
