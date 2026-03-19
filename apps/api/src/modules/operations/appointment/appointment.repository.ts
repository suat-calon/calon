/**
 * APPOINTMENT REPOSITORY — Prisma Implementation
 *
 * All appointment DB operations are here.
 * Uses txContext to auto-detect the active transaction.
 * Maps Prisma errors to domain errors.
 */

import { Injectable }      from '@nestjs/common';
import { Prisma }          from '@prisma/client';
import { Appointment }     from '@calon/database';
import {
  GistExclusionError,
  DeadlockError,
  mapToDomainError,
} from '@calon/database';

import { PrismaService } from '../../../common/prisma.service';
import { getActiveTxClient } from '../../../common/tx.context';
import {
  IAppointmentRepository,
  AppointmentCreateInput,
  AppointmentUpdateInput,
  AppointmentFilters,
  AppointmentWithRelations,
} from './appointment.repository.interface';

@Injectable()
export class PrismaAppointmentRepository implements IAppointmentRepository {
  constructor(private readonly prisma: PrismaService) {}

  /** Returns the active tx client or falls back to PrismaService. */
  private get db(): Prisma.TransactionClient {
    return getActiveTxClient(this.prisma as unknown as Prisma.TransactionClient);
  }

  // ── Queries ────────────────────────────────────────────────────────────────

  async findById(id: string, tenantId: string): Promise<Appointment | null> {
    return this.db.appointment.findFirst({
      where: { id, tenantId, isDeleted: false },
    });
  }

  async findByIdWithRelations(
    id: string,
    tenantId: string,
  ): Promise<AppointmentWithRelations | null> {
    return this.db.appointment.findFirst({
      where: { id, tenantId, isDeleted: false },
      include: {
        customer: { select: { id: true, firstName: true, lastName: true, phone: true, email: true } },
        service:  { select: { id: true, name: true, description: true, durationMin: true, price: true } },
        staff:    { select: { id: true, firstName: true, lastName: true } },
        room:     { select: { id: true, name: true, capacity: true } },
      },
    }) as Promise<AppointmentWithRelations | null>;
  }

  async findAll(
    tenantId: string,
    filters:  AppointmentFilters = {},
  ): Promise<AppointmentWithRelations[]> {
    const where: Record<string, unknown> = { tenantId, isDeleted: false };

    if (filters.startDate || filters.endDate) {
      where['startTime'] = {
        ...(filters.startDate ? { gte: new Date(filters.startDate) } : {}),
        ...(filters.endDate   ? { lte: new Date(filters.endDate) }   : {}),
      };
    }
    if (filters.status)     where['status']     = filters.status;
    if (filters.staffId)    where['staffId']    = filters.staffId;
    if (filters.customerId) where['customerId'] = filters.customerId;

    return this.db.appointment.findMany({
      where,
      orderBy: { startTime: 'asc' },
      include: {
        customer: { select: { id: true, firstName: true, lastName: true, phone: true } },
        service:  { select: { id: true, name: true, durationMin: true, price: true } },
        staff:    { select: { id: true, firstName: true, lastName: true } },
        room:     { select: { id: true, name: true } },
      },
    }) as Promise<AppointmentWithRelations[]>;
  }

  // ── Mutations ──────────────────────────────────────────────────────────────

  async create(data: AppointmentCreateInput): Promise<Appointment> {
    try {
      return await this.db.appointment.create({
        data: {
          tenantId:      data.tenantId,
          customerId:    data.customerId ?? null,
          staffId:       data.staffId    ?? null,
          serviceId:     data.serviceId  ?? null,
          locationId:    data.locationId ?? null,
          roomId:        data.roomId     ?? null,
          startTime:     data.startTime,
          endTime:       data.endTime,
          source:        data.source     as never,
          notes:         data.notes      ?? null,
          internalNotes: data.internalNotes ?? null,
          totalPrice:    data.totalPrice  as never ?? null,
          depositPaid:   data.depositPaid as never ?? null,
          ...(data.status          !== undefined && { status: data.status }),
          ...(data.isTestBooking   === true      && { isTestBooking: true }),
        },
      });
    } catch (err) {
      throw mapToDomainError(err);
    }
  }

  async update(id: string, data: AppointmentUpdateInput): Promise<Appointment> {
    try {
      return await this.db.appointment.update({
        where: { id },
        data:  data as never,
      });
    } catch (err) {
      throw mapToDomainError(err);
    }
  }

  // ── Domain queries ─────────────────────────────────────────────────────────

  async hasOverlap(
    tenantId:   string,
    staffId:    string,
    startTime:  Date,
    endTime:    Date,
    excludeId?: string,
  ): Promise<boolean> {
    try {
      const rows = excludeId
        ? await this.db.$queryRaw<{ id: string }[]>`
            SELECT id FROM appointments
            WHERE
              "tenantId" = ${tenantId}::uuid
              AND "staffId" = ${staffId}::uuid
              AND "isDeleted" = false
              AND status NOT IN ('CANCELLED', 'NO_SHOW', 'COMPLETED')
              AND tstzrange("startTime", "endTime") && tstzrange(${startTime}::timestamptz, ${endTime}::timestamptz)
              AND id <> ${excludeId}::uuid
            LIMIT 1
          `
        : await this.db.$queryRaw<{ id: string }[]>`
            SELECT id FROM appointments
            WHERE
              "tenantId" = ${tenantId}::uuid
              AND "staffId" = ${staffId}::uuid
              AND "isDeleted" = false
              AND status NOT IN ('CANCELLED', 'NO_SHOW', 'COMPLETED')
              AND tstzrange("startTime", "endTime") && tstzrange(${startTime}::timestamptz, ${endTime}::timestamptz)
            LIMIT 1
          `;
      return rows.length > 0;
    } catch (err) {
      if (err instanceof GistExclusionError || err instanceof DeadlockError) throw err;
      throw mapToDomainError(err);
    }
  }
}
