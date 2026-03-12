/**
 * PaymentService — Payment Create Idempotency  (MVP-EXIT-CORE §2a / Test 5)
 * ──────────────────────────────────────────────────────────────────────────────
 * Doğrulama hedefleri:
 *   Test 5a — Paralel Payment Create: İki eş-zamanlı istek → yalnızca 1 Iyzico çağrısı
 *     payments.appointmentId @unique (DB): ikinci stub insert P2002 alır →
 *     mevcut payment kaydı sorgulanır → paymentUrl hazırsa döndürülür.
 *
 *   Test 5b — Idempotent tekrar (URL mevcutsa): ikinci çağrı 200 + mevcut URL
 *
 *   Test 5c — In-flight (URL henüz yok): ikinci çağrı → 409 ConflictException
 *
 *   Test 5d — P2002 dışı hata → servis fırlatır (yutulmaz)
 *
 *   Test 5e — Iyzico başarısız → stub FAILED olarak güncellenir
 *
 * Güvenlik özeti:
 *   Eski akış (Faz 19): appointment check → Iyzico → payment INSERT
 *     Hata: Her iki paralel istek de Iyzico'yu çağırırdı; ikincisi P2002 500 alırdı.
 *
 *   Yeni akış (MVP-EXIT-CORE): payment stub INSERT (null URL) → Iyzico → stub UPDATE
 *     Sadece race'i kazanan stub'ı insert eder; kaybeden P2002 → idempotent path.
 *     Böylece Iyzico asla çift çağrılmaz (idempotency DB katmanında garanti edilir).
 * ──────────────────────────────────────────────────────────────────────────────
 */

import { Test }                    from '@nestjs/testing';
import { ConflictException, NotFoundException, BadRequestException } from '@nestjs/common';
import { AppointmentStatus, PaymentStatus, Prisma } from '@prisma/client';

import { PaymentService }          from './payment.service';
import { PrismaService }           from '../../common/prisma.service';
import { IyzicoService }           from './iyzico.service';
import { EventProducerService }    from '../event/event-producer.service';

// ── Sabitler ──────────────────────────────────────────────────────────────────

const TENANT_ID     = 'aaaa0000-0000-0000-0000-000000000001';
const APPOINTMENT_ID = 'bbbb0000-0000-0000-0000-000000000001';
const PAYMENT_ID    = 'cccc0000-0000-0000-0000-000000000001';
const PAYMENT_URL   = 'https://sandbox-cpp.iyzipay.com?token=test-token-001';

/** Başarılı Iyzico checkout form yanıtı */
const IYZICO_SUCCESS = {
  paymentPageUrl: PAYMENT_URL,
  token:          'test-token-001',
  status:         'success',
};

/** appointment.findFirst mock — PENDING_PAYMENT durumunda */
const MOCK_APPOINTMENT = {
  id:         APPOINTMENT_ID,
  status:     AppointmentStatus.PENDING_PAYMENT,
  customerId: 'cust-001',
  serviceId:  'svc-001',
  tenant: { id: TENANT_ID },
  service: {
    name:            'Saç Boyama',
    price:           '150.00',
    currency:        'TRY',
    requiresDeposit: false,
  },
  location: {
    city: 'Istanbul',
    name: 'Şişli Şubesi',
  },
};

/** Temel DTO */
const BASE_DTO = {
  appointmentId:    APPOINTMENT_ID,
  buyerName:        'Ayşe',
  buyerSurname:     'Kaya',
  buyerEmail:       'ayse@test.com',
  buyerIdentityNumber: '11111111111',
};

// ── P2002 yardımcısı ──────────────────────────────────────────────────────────

function makeP2002(): Prisma.PrismaClientKnownRequestError {
  return new Prisma.PrismaClientKnownRequestError(
    'Unique constraint failed on the fields: (`appointmentId`)',
    { code: 'P2002', clientVersion: '5.x', meta: { target: ['appointmentId'] } },
  );
}

// ── Module builder ────────────────────────────────────────────────────────────

interface BuildOptions {
  /** payment.create'in döndüreceği değer (stub insert) */
  paymentCreate?:    jest.Mock;
  /** payment.findFirst'ın döndüreceği değer (P2002 sonrası mevcut kayıt) */
  paymentFindFirst?: jest.Mock;
  /** payment.update mock */
  paymentUpdate?:    jest.Mock;
  /** appointment.findFirst mock */
  appointmentFindFirst?: jest.Mock;
  /** İyzico initializeCheckoutForm mock */
  iyzicoInit?:       jest.Mock;
}

async function buildModule(opts: BuildOptions = {}) {
  const prismaStub = {
    appointment: {
      findFirst: opts.appointmentFindFirst
        ?? jest.fn().mockResolvedValue(MOCK_APPOINTMENT),
    },
    payment: {
      create:    opts.paymentCreate    ?? jest.fn().mockResolvedValue({ id: PAYMENT_ID, paymentUrl: null }),
      findFirst: opts.paymentFindFirst ?? jest.fn().mockResolvedValue(null),
      update:    opts.paymentUpdate    ?? jest.fn().mockResolvedValue({}),
    },
    webhookEvent: { create: jest.fn() },
    $transaction: jest.fn(),
  };

  const iyzicoStub = {
    initializeCheckoutForm: opts.iyzicoInit
      ?? jest.fn().mockResolvedValue(IYZICO_SUCCESS),
    getCallbackUrl:         jest.fn().mockReturnValue('https://api.test.com/webhooks/iyzico'),
    verifyWebhookSignature: jest.fn().mockReturnValue(true),
  };

  const mod = await Test.createTestingModule({
    providers: [
      PaymentService,
      { provide: PrismaService,        useValue: prismaStub },
      { provide: IyzicoService,        useValue: iyzicoStub },
      { provide: EventProducerService, useValue: { paymentSucceeded: jest.fn() } },
    ],
  }).compile();

  return {
    svc:        mod.get(PaymentService),
    prismaStub,
    iyzicoStub,
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// Test 5a — Paralel Payment Create: Sadece 1 Iyzico çağrısı
// ─────────────────────────────────────────────────────────────────────────────

describe('PaymentService — Test 5a: Paralel Create (1× Iyzico)', () => {
  it(
    '2 eş-zamanlı istek: 1. insert başarılı (Iyzico çağrılır), ' +
    '2. P2002 (mevcut URL var) → Iyzico yalnızca 1× çağrılır',
    async () => {
      // 1. istek stub'ı başarıyla insert eder
      // 2. istek P2002 alır; sonrasında mevcut kaydı sorgular → URL mevcut → döndürür
      const paymentCreate = jest.fn()
        .mockResolvedValueOnce({ id: PAYMENT_ID, paymentUrl: null })    // 1. istek
        .mockRejectedValueOnce(makeP2002());                              // 2. istek

      const paymentFindFirst = jest.fn()
        .mockResolvedValue({ paymentUrl: PAYMENT_URL }); // 2. istek → URL hazır

      const iyzicoInit = jest.fn().mockResolvedValue(IYZICO_SUCCESS);

      const { svc } = await buildModule({ paymentCreate, paymentFindFirst, iyzicoInit });

      const [r1, r2] = await Promise.all([
        svc.createPayment(BASE_DTO),
        svc.createPayment(BASE_DTO),
      ]);

      // Her iki istek de başarılı paymentUrl döndürür
      expect(r1.paymentUrl).toBe(PAYMENT_URL);
      expect(r2.paymentUrl).toBe(PAYMENT_URL);

      // Iyzico yalnızca 1 kez çağrıldı (race kazananı olan 1. istek)
      expect(iyzicoInit).toHaveBeenCalledTimes(1);
    },
  );

  it('3 eş-zamanlı istek: ilk kazanır, sonraki 2 P2002 → Iyzico 1×', async () => {
    let createCount = 0;
    const paymentCreate = jest.fn().mockImplementation(() => {
      createCount++;
      if (createCount > 1) return Promise.reject(makeP2002());
      return Promise.resolve({ id: PAYMENT_ID, paymentUrl: null });
    });

    const paymentFindFirst = jest.fn().mockResolvedValue({ paymentUrl: PAYMENT_URL });
    const iyzicoInit       = jest.fn().mockResolvedValue(IYZICO_SUCCESS);

    const { svc } = await buildModule({ paymentCreate, paymentFindFirst, iyzicoInit });

    const results = await Promise.all([
      svc.createPayment(BASE_DTO),
      svc.createPayment(BASE_DTO),
      svc.createPayment(BASE_DTO),
    ]);

    results.forEach(r => expect(r.paymentUrl).toBe(PAYMENT_URL));
    expect(iyzicoInit).toHaveBeenCalledTimes(1);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Test 5b — Idempotent tekrar (URL mevcut): 200 + mevcut URL
// ─────────────────────────────────────────────────────────────────────────────

describe('PaymentService — Test 5b: Idempotent Tekrar (URL Hazır)', () => {
  it('P2002 sonrası mevcut paymentUrl varsa → ConflictException ATILMAZ, URL döndürülür', async () => {
    const paymentCreate    = jest.fn().mockRejectedValue(makeP2002());
    const paymentFindFirst = jest.fn().mockResolvedValue({ paymentUrl: PAYMENT_URL });
    const iyzicoInit       = jest.fn(); // Hiç çağrılmamalı

    const { svc } = await buildModule({ paymentCreate, paymentFindFirst, iyzicoInit });

    const result = await svc.createPayment(BASE_DTO);

    expect(result.paymentUrl).toBe(PAYMENT_URL);
    expect(result.paymentId).toBe(APPOINTMENT_ID);
    expect(iyzicoInit).not.toHaveBeenCalled();
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Test 5c — In-flight (URL henüz yok): 409 ConflictException
// ─────────────────────────────────────────────────────────────────────────────

describe('PaymentService — Test 5c: In-Flight (URL Henüz Yok → 409)', () => {
  it('P2002 sonrası mevcut paymentUrl null ise → ConflictException fırlatılır', async () => {
    const paymentCreate    = jest.fn().mockRejectedValue(makeP2002());
    const paymentFindFirst = jest.fn().mockResolvedValue({ paymentUrl: null }); // In-flight

    const { svc } = await buildModule({ paymentCreate, paymentFindFirst });

    await expect(svc.createPayment(BASE_DTO)).rejects.toBeInstanceOf(ConflictException);
  });

  it('P2002 sonrası payment kaydı hiç yoksa (findFirst null) → ConflictException', async () => {
    const paymentCreate    = jest.fn().mockRejectedValue(makeP2002());
    const paymentFindFirst = jest.fn().mockResolvedValue(null);

    const { svc } = await buildModule({ paymentCreate, paymentFindFirst });

    await expect(svc.createPayment(BASE_DTO)).rejects.toBeInstanceOf(ConflictException);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Test 5d — P2002 dışı hata yutulmaz
// ─────────────────────────────────────────────────────────────────────────────

describe('PaymentService — Test 5d: P2002 Dışı Hata Yutulmaz', () => {
  it('DB bağlantı hatası → fırlatılır', async () => {
    const paymentCreate = jest.fn().mockRejectedValue(new Error('connection refused'));

    const { svc } = await buildModule({ paymentCreate });

    await expect(svc.createPayment(BASE_DTO)).rejects.toThrow('connection refused');
  });

  it('P2003 (FK violation) → fırlatılır', async () => {
    const p2003 = new Prisma.PrismaClientKnownRequestError(
      'Foreign key constraint failed',
      { code: 'P2003', clientVersion: '5.x', meta: {} },
    );
    const paymentCreate = jest.fn().mockRejectedValue(p2003);

    const { svc } = await buildModule({ paymentCreate });

    await expect(svc.createPayment(BASE_DTO)).rejects.toThrow();
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Test 5e — Iyzico başarısız → stub FAILED olarak güncellenir
// ─────────────────────────────────────────────────────────────────────────────

describe('PaymentService — Test 5e: Iyzico Başarısız → Stub FAILED', () => {
  it('Iyzico exception → payment.update(FAILED) çağrılır, exception yeniden fırlatılır', async () => {
    const iyzicoError  = new Error('Iyzico API timeout');
    const iyzicoInit   = jest.fn().mockRejectedValue(iyzicoError);
    const paymentCreate = jest.fn().mockResolvedValue({ id: PAYMENT_ID, paymentUrl: null });
    const paymentUpdate = jest.fn().mockResolvedValue({});

    const { svc, prismaStub } = await buildModule({
      paymentCreate,
      paymentUpdate,
      iyzicoInit,
    });

    await expect(svc.createPayment(BASE_DTO)).rejects.toThrow('Iyzico API timeout');

    // Stub'ı FAILED yaptı mı?
    expect(prismaStub.payment.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: PAYMENT_ID },
        data:  { status: PaymentStatus.FAILED },
      }),
    );
  });

  it('Iyzico başarısız olduğunda appointment.update çağrılmaz (servis sınırları)', async () => {
    const iyzicoInit  = jest.fn().mockRejectedValue(new Error('timeout'));
    const paymentCreate = jest.fn().mockResolvedValue({ id: PAYMENT_ID, paymentUrl: null });

    const { svc, prismaStub } = await buildModule({ paymentCreate, iyzicoInit });

    await expect(svc.createPayment(BASE_DTO)).rejects.toThrow();

    // appointment update bu servis sınırında yapılmaz — webhook yapar
    expect(prismaStub.appointment.findFirst).toHaveBeenCalledTimes(1); // yalnızca pre-check
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Test 5f — Normal akış (arka plan doğrulaması)
// ─────────────────────────────────────────────────────────────────────────────

describe('PaymentService — Test 5f: Normal Akış', () => {
  it('başarılı akış: stub insert → Iyzico → stub update → paymentUrl döner', async () => {
    const paymentCreate = jest.fn().mockResolvedValue({ id: PAYMENT_ID, paymentUrl: null });
    const paymentUpdate = jest.fn().mockResolvedValue({});
    const iyzicoInit    = jest.fn().mockResolvedValue(IYZICO_SUCCESS);

    const { svc, prismaStub } = await buildModule({
      paymentCreate,
      paymentUpdate,
      iyzicoInit,
    });

    const result = await svc.createPayment(BASE_DTO);

    expect(result.paymentUrl).toBe(PAYMENT_URL);
    expect(result.paymentId).toBe(APPOINTMENT_ID);

    // Sıra doğrulaması: create ÖNCE, update SONRA çağrıldı
    const createOrder = (prismaStub.payment.create as jest.Mock).mock.invocationCallOrder[0];
    const updateOrder = (prismaStub.payment.update as jest.Mock).mock.invocationCallOrder[0];
    expect(createOrder).toBeLessThan(updateOrder);
  });

  it('appointment PENDING_PAYMENT değilse BadRequestException fırlatılır', async () => {
    const appointmentFindFirst = jest.fn().mockResolvedValue({
      ...MOCK_APPOINTMENT,
      status: AppointmentStatus.CONFIRMED,
    });

    const { svc } = await buildModule({ appointmentFindFirst });

    await expect(svc.createPayment(BASE_DTO)).rejects.toBeInstanceOf(BadRequestException);
  });

  it('appointment bulunamazsa NotFoundException fırlatılır', async () => {
    const appointmentFindFirst = jest.fn().mockResolvedValue(null);

    const { svc } = await buildModule({ appointmentFindFirst });

    await expect(svc.createPayment(BASE_DTO)).rejects.toBeInstanceOf(NotFoundException);
  });
});
