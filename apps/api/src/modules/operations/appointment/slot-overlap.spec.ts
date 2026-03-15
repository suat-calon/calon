/**
 * AppointmentService — Slot Overlap Tests  (MVP-EXIT-CORE §1)
 * ──────────────────────────────────────────────────────────────────────────────
 * Doğrulama hedefleri:
 *   Test 1 — Slot Overlap Reject
 *     Aynı personel için çakışan randevu → checkOverlapRaw ConflictException fırlatır.
 *
 *   Test 2 — Touching (Bitişik) Aralık İzin Verilir
 *     [10:00,11:00) ile [11:00,12:00) → tsrange && = false → ikisi birlikte kabul edilir.
 *
 *   Test 3 — Farklı Personel, Aynı Saat
 *     STAFF_A dolu iken STAFF_B için aynı saat → kabul edilir.
 *
 *   Test 4 — Paralel Yarış: GIST 23P01 → ConflictException
 *     Yazılımsal kontrol geçse bile DB'den 23P01 gelirse isGistExclusionViolation()
 *     ConflictException'a dönüştürür; race-condition güvenliği DB katmanındadır.
 *
 * Mimari notu:
 *   checkOverlapRaw, AppointmentService içinde module-scope private bir fonksiyondur;
 *   doğrudan test edilemez. Bunun yerine svc.create() çağrılır ve Prisma tx stub'ının
 *   $queryRaw mock'u kontrol edilerek davranış doğrulanır.
 *
 * DB constraint (referans):
 *   appt_staff_overlap_excl — EXCLUDE USING gist("tenantId" WITH =, "staffId" WITH =,
 *     tsrange("startTime","endTime") WITH &&)
 *     WHERE status NOT IN ('CANCELLED','NO_SHOW','COMPLETED') AND isDeleted=false
 * ──────────────────────────────────────────────────────────────────────────────
 */

import { Test }                           from '@nestjs/testing';
import { ConflictException }              from '@nestjs/common';
import { Prisma, AppointmentStatus, AppointmentSource } from '@prisma/client';
import { getQueueToken }                  from '@nestjs/bull';

import { AppointmentService }             from './appointment.service';
import { PrismaService }                  from '../../../common/prisma.service';
import { LedgerService }                  from '../../finance/ledger.service';
import { CommissionService }              from '../../staff/commission.service';
import { AppointmentLockService }         from './appointment-lock.service';
import { AppointmentAvailabilityService } from './appointment-availability.service';
import { EventProducerService }           from '../../event/event-producer.service';
import { OutboxRepository }               from '../../event/outbox.repository';
import { QUEUE_NAMES }                    from '../../../common/queue/queue-names';

// ── Sabitler ──────────────────────────────────────────────────────────────────

const TENANT_ID = 'aaaaaaaa-0000-0000-0000-000000000001';
const STAFF_A   = 'bbbbbbbb-0000-0000-0000-000000000001';
const STAFF_B   = 'bbbbbbbb-0000-0000-0000-000000000002';
const CUST_ID   = 'cccccccc-0000-0000-0000-000000000001';
const SVC_ID    = 'dddddddd-0000-0000-0000-000000000001';
const LOC_ID    = 'eeeeeeee-0000-0000-0000-000000000001';

/** Sabit zaman noktaları */
const T_10_00 = '2026-03-15T10:00:00.000Z';
const T_10_30 = '2026-03-15T10:30:00.000Z';
const T_11_00 = '2026-03-15T11:00:00.000Z';
const T_12_00 = '2026-03-15T12:00:00.000Z';

/** Temel DTO (zaman override'larıyla kullanılır) */
const BASE_DTO = {
  customerId: CUST_ID,
  staffId:    STAFF_A,
  serviceId:  SVC_ID,
  locationId: LOC_ID,
  source:     AppointmentSource.RECEPTIONIST,
};

/** Başarılı appointment.create mock dönüşü */
const MOCK_APPT = {
  id:         'appt-new-001',
  tenantId:   TENANT_ID,
  staffId:    STAFF_A,
  customerId: CUST_ID,
  serviceId:  SVC_ID,
  locationId: LOC_ID,
  roomId:     null,
  startTime:  new Date(T_10_00),
  endTime:    new Date(T_11_00),
  status:     AppointmentStatus.PENDING,
  isDeleted:  false,
  source:     AppointmentSource.RECEPTIONIST,
  notes:      null,
  internalNotes: null,
  totalPrice: null,
  depositPaid: null,
  isTestBooking: false,
  createdAt:  new Date(),
  updatedAt:  new Date(),
};

// ── Yardımcı: GIST 23P01 hatası ─────────────────────────────────────────────

/**
 * Prisma P2010 + meta.code='23P01' — GIST exclusion constraint ihlali.
 * PostgreSQL çalışma zamanında döner; checkOverlapRaw'dan SONRA DB'de tetiklenir.
 */
function makeGistViolation(): Prisma.PrismaClientKnownRequestError {
  return new Prisma.PrismaClientKnownRequestError(
    'raw query failed',
    {
      code:          'P2010',
      clientVersion: '5.x',
      meta:          {
        code:    '23P01',
        message: 'conflicting key value violates exclusion constraint "appt_staff_overlap_excl"',
      },
    },
  );
}

// ── Module builder ────────────────────────────────────────────────────────────

interface BuildOptions {
  /** $queryRaw'ın her çağrıda döndüreceği sonuçlar (sırayla tüketilir) */
  queryRawSequence?: ({ id: string }[] | Error)[];
  /** appointment.create'in döndüreceği sonuç veya fırlattığı hata */
  createResult?:     typeof MOCK_APPT | Error;
}

async function buildModule(opts: BuildOptions = {}) {
  let qrIdx = 0;
  const queryRawMock = jest.fn().mockImplementation(() => {
    const r = (opts.queryRawSequence ?? [[]])[qrIdx] ?? [];
    qrIdx++;
    return r instanceof Error ? Promise.reject(r) : Promise.resolve(r);
  });

  const createMock = jest.fn().mockImplementation(() => {
    const r = opts.createResult ?? MOCK_APPT;
    return r instanceof Error ? Promise.reject(r) : Promise.resolve(r);
  });

  const txStub = {
    $queryRaw:   queryRawMock,
    appointment: { create: createMock },
  };

  const prismaStub = {
    $transaction:        jest.fn().mockImplementation((fn: (tx: unknown) => Promise<unknown>) => fn(txStub)),
    $tenantTransaction:  jest.fn().mockImplementation((fn: (tx: unknown) => Promise<unknown>) => fn(txStub)),
    customer:      { findFirst: jest.fn().mockResolvedValue(null) },
    staffProfile:  { findFirst: jest.fn().mockResolvedValue(null) },
    service:       { findFirst: jest.fn().mockResolvedValue(null) },
    location:      { findFirst: jest.fn().mockResolvedValue(null) },
    appointment:   { findFirst: jest.fn().mockResolvedValue(null) },
  };

  const lockStub = {
    acquireConcurrencyLock: jest.fn().mockResolvedValue('test-lock-key'),
    releaseConcurrencyLock: jest.fn().mockResolvedValue(undefined),
    releaseSlot:            jest.fn().mockResolvedValue(undefined),
  };

  const mod = await Test.createTestingModule({
    providers: [
      AppointmentService,
      { provide: PrismaService,                  useValue: prismaStub },
      { provide: LedgerService,                  useValue: {} },
      { provide: CommissionService,              useValue: {} },
      { provide: AppointmentLockService,         useValue: lockStub },
      {
        provide: AppointmentAvailabilityService,
        useValue: { invalidate: jest.fn().mockResolvedValue(undefined) },
      },
      {
        provide: EventProducerService,
        useValue: {
          bookingCreated:           jest.fn().mockResolvedValue(undefined),
          bookingReminderScheduled: jest.fn().mockResolvedValue(undefined),
        },
      },
      { provide: OutboxRepository,               useValue: {} },
      { provide: getQueueToken(QUEUE_NAMES.STOCK_DEDUCT), useValue: { add: jest.fn() } },
      { provide: getQueueToken(QUEUE_NAMES.LOYALTY_EARN), useValue: { add: jest.fn() } },
    ],
  }).compile();

  return {
    svc:          mod.get(AppointmentService),
    queryRawMock,
    createMock,
    prismaStub,
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// Test 1 — Slot Overlap Reject
// ─────────────────────────────────────────────────────────────────────────────

describe('AppointmentService — Test 1: Slot Overlap Reject', () => {
  it('$queryRaw sonuç döndürünce (overlap tespit) → ConflictException fırlatılır', async () => {
    const { svc } = await buildModule({
      queryRawSequence: [[{ id: 'blocking-appt-001' }]],
    });

    // [10:30, 12:00) → mevcut [10:00, 11:00) ile çakışır
    await expect(
      svc.create(TENANT_ID, { ...BASE_DTO, startTime: T_10_30, endTime: T_12_00 }),
    ).rejects.toBeInstanceOf(ConflictException);
  });

  it('hata mesajı "overlap" veya "müsait" içerir', async () => {
    const { svc } = await buildModule({
      queryRawSequence: [[{ id: 'blocking-appt-002' }]],
    });

    await expect(
      svc.create(TENANT_ID, { ...BASE_DTO, startTime: T_10_30, endTime: T_12_00 }),
    ).rejects.toThrow(/overlap|müsait/i);
  });

  it('appointment.create, overlap varken çağrılmaz ($transaction erken çıkar)', async () => {
    const { svc, createMock } = await buildModule({
      queryRawSequence: [[{ id: 'blocking-appt-003' }]],
    });

    await expect(
      svc.create(TENANT_ID, { ...BASE_DTO, startTime: T_10_30, endTime: T_12_00 }),
    ).rejects.toBeInstanceOf(ConflictException);

    expect(createMock).not.toHaveBeenCalled();
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Test 2 — Touching (Bitişik) Aralık İzin Verilir
// ─────────────────────────────────────────────────────────────────────────────

describe('AppointmentService — Test 2: Touching Aralık İzin Verilir', () => {
  /**
   * Karar: tsrange([10:00,11:00), []) && tsrange([11:00,12:00), []) = false
   * Half-open intervals: bitişik aralıklar ÇAKIŞMAZ → DB ikisini de kabul eder.
   * checkOverlapRaw bu senaryoda [] döner → appointment.create çağrılır.
   */
  it('[11:00, 12:00) sonraki slot → $queryRaw [] döner → randevu oluşturulur', async () => {
    const touchingAppt = { ...MOCK_APPT, startTime: new Date(T_11_00), endTime: new Date(T_12_00) };

    const { svc, createMock, queryRawMock } = await buildModule({
      queryRawSequence: [[]],   // Boş → overlap yok
      createResult:     touchingAppt,
    });

    const result = await svc.create(TENANT_ID, {
      ...BASE_DTO,
      startTime: T_11_00,
      endTime:   T_12_00,
    });

    expect(result.startTime).toEqual(new Date(T_11_00));
    expect(queryRawMock).toHaveBeenCalledTimes(1);
    expect(createMock).toHaveBeenCalledTimes(1);
  });

  it('[10:00, 11:00) ile [10:00, 11:00) tam çakışma → ConflictException', async () => {
    const { svc } = await buildModule({
      queryRawSequence: [[{ id: 'same-slot-appt' }]],
    });

    await expect(
      svc.create(TENANT_ID, { ...BASE_DTO, startTime: T_10_00, endTime: T_11_00 }),
    ).rejects.toBeInstanceOf(ConflictException);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Test 3 — Farklı Personel, Aynı Saat
// ─────────────────────────────────────────────────────────────────────────────

describe('AppointmentService — Test 3: Farklı Personel Aynı Saat', () => {
  it(`STAFF_B için aynı saat → $queryRaw [] döner (STAFF_B'ye ait randevu yok) → kabul`, async () => {
    const { svc, queryRawMock, createMock } = await buildModule({
      queryRawSequence: [[]],  // STAFF_B için overlap yok
      createResult:     { ...MOCK_APPT, staffId: STAFF_B },
    });

    await svc.create(TENANT_ID, {
      ...BASE_DTO,
      staffId:   STAFF_B,
      startTime: T_10_00,
      endTime:   T_11_00,
    });

    // checkOverlapRaw, STAFF_B ile $queryRaw çağırdı
    expect(queryRawMock).toHaveBeenCalledTimes(1);
    expect(createMock).toHaveBeenCalledTimes(1);
  });

  it(`STAFF_A dolu + STAFF_B'ye iki ayrı çağrı → her ikisi de başarılı (seri simülasyon)`, async () => {
    // İlk çağrı: STAFF_A için overlap var → reject
    // İkinci çağrı: STAFF_B için overlap yok → accept
    const { svc } = await buildModule({
      queryRawSequence: [
        [{ id: 'staff-a-existing' }],  // STAFF_A çağrısı → ConflictException
        [],                             // STAFF_B çağrısı → başarılı
      ],
      createResult: { ...MOCK_APPT, staffId: STAFF_B },
    });

    // STAFF_A → çakışma
    await expect(
      svc.create(TENANT_ID, { ...BASE_DTO, staffId: STAFF_A, startTime: T_10_00, endTime: T_11_00 }),
    ).rejects.toBeInstanceOf(ConflictException);

    // STAFF_B → başarılı
    await expect(
      svc.create(TENANT_ID, { ...BASE_DTO, staffId: STAFF_B, startTime: T_10_00, endTime: T_11_00 }),
    ).resolves.toMatchObject({ staffId: STAFF_B });
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Test 4 — Paralel Yarış: GIST 23P01 → ConflictException
// ─────────────────────────────────────────────────────────────────────────────

describe('AppointmentService — Test 4: Paralel Yarış (GIST 23P01)', () => {
  it('appointment.create P2010/23P01 fırlatırsa → isGistExclusionViolation → ConflictException', async () => {
    const { svc } = await buildModule({
      queryRawSequence: [[]],              // Yazılımsal check geçer
      createResult:     makeGistViolation(), // DB GIST constraint tetiklenir
    });

    await expect(
      svc.create(TENANT_ID, { ...BASE_DTO, startTime: T_10_00, endTime: T_11_00 }),
    ).rejects.toBeInstanceOf(ConflictException);
  });

  it('GIST hata mesajı "müsait değil" ile sonuçlanır', async () => {
    const { svc } = await buildModule({
      queryRawSequence: [[]],
      createResult:     makeGistViolation(),
    });

    await expect(
      svc.create(TENANT_ID, { ...BASE_DTO, startTime: T_10_00, endTime: T_11_00 }),
    ).rejects.toThrow(/müsait değil/i);
  });

  it('Promise.all 3 eş-zamanlı istek: 2 başarılı + 1 GIST reject → 1 ConflictException', async () => {
    // Her çağrı için bağımsız state gerekiyor — callIndex izliyoruz.
    let callIdx = 0;

    const qRaw = jest.fn().mockResolvedValue([]);
    const createFn = jest.fn().mockImplementation(() => {
      callIdx++;
      // 3. çağrı GIST ihlali simüle eder
      if (callIdx === 3) return Promise.reject(makeGistViolation());
      return Promise.resolve(MOCK_APPT);
    });

    const txStub = { $queryRaw: qRaw, appointment: { create: createFn } };

    const prismaStub = {
      $transaction:        jest.fn().mockImplementation((fn: (tx: unknown) => Promise<unknown>) => fn(txStub)),
      $tenantTransaction:  jest.fn().mockImplementation((fn: (tx: unknown) => Promise<unknown>) => fn(txStub)),
      customer:      { findFirst: jest.fn().mockResolvedValue(null) },
      staffProfile:  { findFirst: jest.fn().mockResolvedValue(null) },
      service:       { findFirst: jest.fn().mockResolvedValue(null) },
      location:      { findFirst: jest.fn().mockResolvedValue(null) },
      appointment:   { findFirst: jest.fn().mockResolvedValue(null) },
    };

    const mod = await Test.createTestingModule({
      providers: [
        AppointmentService,
        { provide: PrismaService,                  useValue: prismaStub },
        { provide: LedgerService,                  useValue: {} },
        { provide: CommissionService,              useValue: {} },
        {
          provide: AppointmentLockService,
          useValue: {
            acquireConcurrencyLock: jest.fn().mockResolvedValue('lk'),
            releaseConcurrencyLock: jest.fn().mockResolvedValue(undefined),
            releaseSlot:            jest.fn().mockResolvedValue(undefined),
          },
        },
        {
          provide: AppointmentAvailabilityService,
          useValue: { invalidate: jest.fn().mockResolvedValue(undefined) },
        },
        {
          provide: EventProducerService,
          useValue: {
            bookingCreated:           jest.fn().mockResolvedValue(undefined),
            bookingReminderScheduled: jest.fn().mockResolvedValue(undefined),
          },
        },
        { provide: OutboxRepository,               useValue: {} },
        { provide: getQueueToken(QUEUE_NAMES.STOCK_DEDUCT), useValue: { add: jest.fn() } },
        { provide: getQueueToken(QUEUE_NAMES.LOYALTY_EARN), useValue: { add: jest.fn() } },
      ],
    }).compile();

    const svc = mod.get(AppointmentService);
    const dto = { ...BASE_DTO, startTime: T_10_00, endTime: T_11_00 };

    const results = await Promise.allSettled([
      svc.create(TENANT_ID, dto),
      svc.create(TENANT_ID, dto),
      svc.create(TENANT_ID, dto),
    ]);

    const fulfilled = results.filter(r => r.status === 'fulfilled');
    const rejected  = results.filter(r => r.status === 'rejected') as PromiseRejectedResult[];

    expect(fulfilled.length).toBe(2);
    expect(rejected.length).toBe(1);
    expect(rejected[0].reason).toBeInstanceOf(ConflictException);
  });
});
