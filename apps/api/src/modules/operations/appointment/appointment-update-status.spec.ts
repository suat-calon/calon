/**
 * AppointmentService — updateStatus: totalPrice null guard
 * ─────────────────────────────────────────────────────────
 * Doğrulama hedefi (Bug #3 fix):
 *   updateStatus(COMPLETED) çağrıldığında appt.totalPrice null ise
 *   → BadRequestException fırlatılır, ledger kaydı oluşturulmaz.
 */

// appointment.machine bağımsız — transition her zaman geçerli kabul edilir
jest.mock('./appointment.machine', () => ({
  isValidTransition: jest.fn().mockReturnValue(true),
}));

import { Test }                               from '@nestjs/testing';
import { BadRequestException }                from '@nestjs/common';
import { AppointmentStatus, AppointmentSource } from '@calon/database';
import { getQueueToken }                       from '@nestjs/bull';

import { AppointmentService }                  from './appointment.service';
import { PrismaService }                       from '../../../common/prisma.service';
import { LedgerService }                       from '../../finance/ledger.service';
import { CommissionService }                   from '../../staff/commission.service';
import { AppointmentLockService }              from './appointment-lock.service';
import { AppointmentAvailabilityService }      from './appointment-availability.service';
import { EventProducerService }                from '../../event/event-producer.service';
import { OutboxRepository }                    from '../../event/outbox.repository';
import { APPOINTMENT_REPO }                    from './appointment.repository.interface';
import { QUEUE_NAMES }                         from '../../../common/queue/queue-names';

// ── Sabitler ──────────────────────────────────────────────────────────────────
// Tanımlar kullanımdan ÖNCE gelmelidir (MOCK_CREATED_APPT bunlara referans verir)

const TENANT_ID = 'aaaaaaaa-0000-0000-0000-000000000001';
const APPT_ID   = 'bbbbbbbb-0000-0000-0000-000000000001';
const STAFF_ID  = 'cccccccc-0000-0000-0000-000000000001';

// ── Shared appointment stub ───────────────────────────────────────────────────

const MOCK_CREATED_APPT = {
  id:            'new-appt-id',
  tenantId:      TENANT_ID,
  staffId:       STAFF_ID,
  customerId:    null,
  serviceId:     null,
  startTime:     new Date('2026-03-15T10:00:00Z'),
  endTime:       new Date('2026-03-15T11:00:00Z'),
  status:        AppointmentStatus.PENDING,
  isDeleted:     false,
  totalPrice:    null,
  depositPaid:   null,
  isTestBooking: false,
  source:        'RECEPTIONIST',
  notes:         null,
  internalNotes: null,
  createdAt:     new Date(),
  updatedAt:     new Date(),
};

// ── Builder for create() tests ────────────────────────────────────────────────

async function buildModuleForCreate(overrides: {
  releaseSlot?:   jest.Mock;
  hasOverlap?:    jest.Mock;
  repoCreate?:    jest.Mock;
}) {
  const txStub = {
    $queryRaw:   jest.fn().mockResolvedValue([]),
    appointment: { create: jest.fn().mockResolvedValue(MOCK_CREATED_APPT) },
  };

  const prismaStub = {
    customer:      { findFirst: jest.fn().mockResolvedValue(null) },
    staffProfile:  { findFirst: jest.fn().mockResolvedValue(null) },
    service:       { findFirst: jest.fn().mockResolvedValue(null) },
    location:      { findFirst: jest.fn().mockResolvedValue(null) },
    appointment:   { findFirst: jest.fn().mockResolvedValue(null) },
    $tenantTransaction: jest.fn().mockImplementation(
      (fn: (tx: unknown) => Promise<unknown>) => fn(txStub),
    ),
  };

  const lockStub = {
    acquireConcurrencyLock: jest.fn().mockResolvedValue('lock-key'),
    releaseConcurrencyLock: jest.fn().mockResolvedValue(undefined),
    releaseSlot:            overrides.releaseSlot ?? jest.fn().mockResolvedValue(undefined),
  };

  const appointmentRepoStub = {
    hasOverlap: overrides.hasOverlap ?? jest.fn().mockResolvedValue(false),
    create:     overrides.repoCreate ?? jest.fn().mockResolvedValue(MOCK_CREATED_APPT),
    findAll:    jest.fn(),
    findByIdWithRelations: jest.fn(),
  };

  const mod = await Test.createTestingModule({
    providers: [
      AppointmentService,
      { provide: PrismaService,         useValue: prismaStub },
      { provide: LedgerService,         useValue: { record: jest.fn() } },
      { provide: CommissionService,     useValue: {} },
      { provide: AppointmentLockService, useValue: lockStub },
      { provide: AppointmentAvailabilityService,
        useValue: { invalidate: jest.fn().mockResolvedValue(undefined) } },
      { provide: EventProducerService,
        useValue: {
          bookingCreated:           jest.fn().mockResolvedValue(undefined),
          bookingReminderScheduled: jest.fn().mockResolvedValue(undefined),
        },
      },
      { provide: OutboxRepository,      useValue: {} },
      { provide: APPOINTMENT_REPO,      useValue: appointmentRepoStub },
      { provide: getQueueToken(QUEUE_NAMES.STOCK_DEDUCT), useValue: { add: jest.fn() } },
      { provide: getQueueToken(QUEUE_NAMES.LOYALTY_EARN), useValue: { add: jest.fn() } },
    ],
  }).compile();

  return { svc: mod.get(AppointmentService), lockStub, appointmentRepoStub, prismaStub };
}

const EXISTING = {
  id:         APPT_ID,
  tenantId:   TENANT_ID,
  staffId:    STAFF_ID,
  customerId: null,
  serviceId:  null,
  startTime:  new Date('2026-03-15T10:00:00Z'),
  endTime:    new Date('2026-03-15T11:00:00Z'),
  status:     AppointmentStatus.CONFIRMED,
  isDeleted:  false,
  totalPrice: null,
  depositPaid: null,
};

// ── Builder ───────────────────────────────────────────────────────────────────

async function buildModule(txAppointmentUpdate: jest.Mock) {
  const txStub = {
    appointment: { update: txAppointmentUpdate },
    auditLog:    { create: jest.fn().mockResolvedValue({}) },
  };

  const prismaStub = {
    appointment:  { findFirst: jest.fn().mockResolvedValue(EXISTING) },
    customer:     { findFirst: jest.fn().mockResolvedValue(null) },
    staffProfile: { findFirst: jest.fn().mockResolvedValue(null) },
    service:      { findFirst: jest.fn().mockResolvedValue(null) },
    $tenantTransaction: jest.fn().mockImplementation(
      (fn: (tx: unknown) => Promise<unknown>) => fn(txStub),
    ),
  };

  const ledgerSpy = jest.fn();

  const mod = await Test.createTestingModule({
    providers: [
      AppointmentService,
      { provide: PrismaService,                  useValue: prismaStub },
      { provide: LedgerService,                  useValue: { record: ledgerSpy } },
      { provide: CommissionService,              useValue: {} },
      { provide: AppointmentLockService,         useValue: {} },
      { provide: AppointmentAvailabilityService,
        useValue: { invalidate: jest.fn(), invalidateMany: jest.fn() } },
      { provide: EventProducerService,
        useValue: {
          bookingCompleted: jest.fn().mockResolvedValue(undefined),
          bookingCancelled: jest.fn().mockResolvedValue(undefined),
          bookingNoShow:    jest.fn().mockResolvedValue(undefined),
        },
      },
      { provide: OutboxRepository,
        useValue: { cancelByAggregateId: jest.fn().mockResolvedValue(undefined) } },
      { provide: APPOINTMENT_REPO,
        useValue: { findAll: jest.fn(), findByIdWithRelations: jest.fn() } },
      { provide: getQueueToken(QUEUE_NAMES.STOCK_DEDUCT), useValue: { add: jest.fn() } },
      { provide: getQueueToken(QUEUE_NAMES.LOYALTY_EARN), useValue: { add: jest.fn() } },
    ],
  }).compile();

  return { svc: mod.get(AppointmentService), prismaStub, ledgerSpy, txStub };
}

// ─────────────────────────────────────────────────────────────────────────────
// Suite: Redis failure → create() must still succeed (Bug #2)
// ─────────────────────────────────────────────────────────────────────────────

describe('AppointmentService — create: Redis releaseSlot failure (Bug #2)', () => {
  const BASE_DTO = {
    staffId:   STAFF_ID,
    startTime: '2026-03-15T10:00:00.000Z',
    endTime:   '2026-03-15T11:00:00.000Z',
    source:    'RECEPTIONIST' as const,
  };

  it('releaseSlot Redis hatası fırlatırsa → create() yine de appointment döner', async () => {
    const { svc } = await buildModuleForCreate({
      releaseSlot: jest.fn().mockRejectedValue(new Error('Redis ECONNREFUSED')),
    });

    const result = await svc.create(TENANT_ID, BASE_DTO);

    expect(result).toMatchObject({ id: MOCK_CREATED_APPT.id });
  });

  it('releaseSlot Redis hatası fırlatırsa → exception caller\'a iletilmez', async () => {
    const { svc } = await buildModuleForCreate({
      releaseSlot: jest.fn().mockRejectedValue(new Error('Redis timeout')),
    });

    await expect(
      svc.create(TENANT_ID, BASE_DTO),
    ).resolves.not.toThrow();
  });

  it('releaseSlot başarılıysa → create() normal çalışır', async () => {
    const { svc, lockStub } = await buildModuleForCreate({});

    await svc.create(TENANT_ID, BASE_DTO);

    expect(lockStub.releaseSlot).toHaveBeenCalledTimes(1);
    expect(lockStub.releaseSlot).toHaveBeenCalledWith(
      TENANT_ID,
      STAFF_ID,
      expect.any(String),
    );
  });

  it('releaseSlot hata verse de appointmentRepo.create bir kez çağrılmış olur', async () => {
    const { svc, appointmentRepoStub } = await buildModuleForCreate({
      releaseSlot: jest.fn().mockRejectedValue(new Error('Redis gone')),
    });

    await svc.create(TENANT_ID, BASE_DTO);

    expect(appointmentRepoStub.create).toHaveBeenCalledTimes(1);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Suite: totalPrice null → BadRequestException
// ─────────────────────────────────────────────────────────────────────────────

describe('AppointmentService — updateStatus: totalPrice null guard (Bug #3)', () => {

  it('totalPrice null → BadRequestException fırlatılır', async () => {
    const { svc } = await buildModule(
      jest.fn().mockResolvedValue({ ...EXISTING, status: AppointmentStatus.COMPLETED, totalPrice: null }),
    );

    await expect(
      svc.updateStatus(TENANT_ID, APPT_ID, { status: AppointmentStatus.COMPLETED }),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('totalPrice null → hata mesajı "toplam tutar" içerir', async () => {
    const { svc } = await buildModule(
      jest.fn().mockResolvedValue({ ...EXISTING, status: AppointmentStatus.COMPLETED, totalPrice: null }),
    );

    await expect(
      svc.updateStatus(TENANT_ID, APPT_ID, { status: AppointmentStatus.COMPLETED }),
    ).rejects.toThrow(/toplam tutar/i);
  });

  it('totalPrice null → ledger.record çağrılmaz', async () => {
    const { svc, ledgerSpy } = await buildModule(
      jest.fn().mockResolvedValue({ ...EXISTING, status: AppointmentStatus.COMPLETED, totalPrice: null }),
    );

    await expect(
      svc.updateStatus(TENANT_ID, APPT_ID, { status: AppointmentStatus.COMPLETED }),
    ).rejects.toBeInstanceOf(BadRequestException);

    expect(ledgerSpy).not.toHaveBeenCalled();
  });

  it('totalPrice set ise → BadRequestException fırlatılmaz, ledger.record çağrılır', async () => {
    const { svc, ledgerSpy } = await buildModule(
      jest.fn().mockResolvedValue({
        ...EXISTING,
        status:     AppointmentStatus.COMPLETED,
        totalPrice: '500.00',
        staffId:    null, // commission atlanır
        customerId: null,
      }),
    );

    await expect(
      svc.updateStatus(TENANT_ID, APPT_ID, { status: AppointmentStatus.COMPLETED }),
    ).resolves.toBeDefined();

    expect(ledgerSpy).toHaveBeenCalledTimes(1);
  });
});
