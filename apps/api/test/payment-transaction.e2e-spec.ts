/**
 * ═══════════════════════════════════════════════════════════════════════════
 * PAYMENT TRANSACTION INTEGRITY — E2E TEST SUITİ
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * Kabul Kriterleri:
 *   ✅ Başarılı takeDeposit → transactionLedger + auditLog aynı anda commit
 *   ✅ Başarısız deposit (COMPLETED randevu) → 400 + DB'de sıfır ledger kaydı
 *   ✅ Başarılı checkout → ledger + auditLog + appointment.status=COMPLETED atomik
 *   ✅ 2 eş zamanlı aynı slot POST /appointments → tam 1 başarı, 1 çakışma
 *   ✅ 10 eş zamanlı aynı slot POST /appointments → tam 1 başarı, 9 çakışma
 *   ✅ Redis releaseSlot hatası → booking yine de 201 döner
 *   ✅ Ledger hatası → deposit 500 + DB'de sıfır ledger + sıfır auditLog
 *
 * ÇALIŞTIRMA:
 *   TEST_DATABASE_URL="..." yarn workspace @calon/api jest \
 *     --config jest-e2e.config.js --testPathPattern=payment-transaction --forceExit
 * ═══════════════════════════════════════════════════════════════════════════
 */

// ── Ortam değişkenleri ────────────────────────────────────────────────────────
const TEST_DB_URL =
  process.env['TEST_DATABASE_URL'] ??
  'postgresql://calon:dev_password@localhost:5432/calon_test';

const SUPER_DB_URL =
  process.env['TEST_SUPER_DATABASE_URL'] ??
  'postgresql://postgres:postgres_secret@localhost:5432/calon_test';

process.env['DATABASE_URL']      = TEST_DB_URL;
process.env['JWT_SECRET']        = 'payment-tx-test-secret-32chars!!';
process.env['NODE_ENV']          = 'test';
process.env['REDIS_HOST']        = 'localhost';
process.env['REDIS_PORT']        = '6379';
process.env['REDIS_PASSWORD']    = '';
process.env['IYZICO_SECRET_KEY'] = 'test-iyzico-secret-key-min10chars';
process.env['IYZICO_API_KEY']    = 'test-iyzico-api-key-min10chars';

import { Test, TestingModule }              from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import supertest                            = require('supertest');
import { PrismaClient }                     from '@prisma/client';
import { JwtService }                       from '@nestjs/jwt';
import { v4 as uuid }                       from 'uuid';

import { AppModule }                  from '../src/app.module';
import { PrismaService }              from '../src/common/prisma.service';
import { AppointmentLockService }     from '../src/modules/operations/appointment/appointment-lock.service';
import { LedgerService }              from '../src/modules/finance/ledger.service';

const request = supertest;

// ── Yardımcılar ───────────────────────────────────────────────────────────────

/** Superuser bağlantısı — RLS bypass (seed + cleanup + doğrulama) */
function superPrisma(): PrismaClient {
  return new PrismaClient({ datasources: { db: { url: SUPER_DB_URL } } });
}

function mintToken(jwt: JwtService, userId: string, tenantId: string): string {
  return jwt.sign({ sub: userId, tenantId, role: 'TENANT_OWNER', plan: 'BOUTIQUE' });
}

/** Minimal seed — payment testleri için gerekli tüm bağımlılıklar */
async function seedTenant(spy: PrismaClient): Promise<{
  tenantId:   string;
  userId:     string;
  staffId:    string;
  serviceId:  string;
  locationId: string;
  customerId: string;
}> {
  const tenantId   = uuid();
  const userId     = uuid();
  const staffId    = uuid();
  const locationId = uuid();
  const catId      = uuid();
  const serviceId  = uuid();
  const customerId = uuid();

  await spy.tenant.create({
    data: { id: tenantId, name: 'Payment TX Test', slug: `pay-tx-${tenantId.slice(0, 8)}`, plan: 'BOUTIQUE' as any, status: 'ACTIVE' },
  });

  await spy.user.create({
    data: {
      id: userId, email: `pay-tx-${tenantId.slice(0, 8)}@test.com`,
      passwordHash: '$2b$12$aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa',
      firstName: 'Pay', lastName: 'Tester', status: 'ACTIVE',
      tenants: { create: { tenantId, role: 'TENANT_OWNER' } },
    },
  });

  await spy.location.create({
    data: { id: locationId, tenantId, name: 'Test Şube' },
  });

  await spy.staffProfile.create({
    data: { id: staffId, tenantId, locationId, firstName: 'Test', lastName: 'Staff' },
  });

  await spy.serviceCategory.create({
    data: { id: catId, tenantId, name: 'Test Kategori' },
  });

  await spy.service.create({
    data: { id: serviceId, tenantId, categoryId: catId, name: 'Test Hizmet', durationMin: 60, price: 500 },
  });

  await spy.customer.create({
    data: { id: customerId, tenantId, firstName: 'Test', lastName: 'Müşteri', loyaltyPoints: 0 },
  });

  const now = new Date();
  const periodEnd = new Date(now); periodEnd.setDate(periodEnd.getDate() + 30);
  const trialEnd  = new Date(now); trialEnd.setDate(trialEnd.getDate() + 7);
  const grace     = new Date(trialEnd); grace.setDate(grace.getDate() + 3);

  await spy.tenantBilling.create({
    data: {
      tenantId, plan: 'BOUTIQUE' as any, cycle: 'MONTHLY', status: 'TRIAL' as any,
      trialEndsAt: trialEnd, graceUntil: grace,
      currentPeriodStart: now, currentPeriodEnd: periodEnd, provider: 'NONE',
    },
  });

  await spy.usagePeriod.create({
    data: { tenantId, periodStart: now, periodEnd, smsIncluded: 50, aiIncluded: 20 },
  });

  return { tenantId, userId, staffId, serviceId, locationId, customerId };
}

/** Temizlik — tüm seed verilerini sil (bağımlılık sırasıyla) */
async function cleanupTenant(spy: PrismaClient, tenantId: string, userId: string): Promise<void> {
  await spy.transactionLedger.deleteMany({ where: { tenantId } });
  await spy.auditLog.deleteMany({ where: { tenantId } });
  await spy.commissionLog.deleteMany({ where: { tenantId } });
  await spy.appointment.deleteMany({ where: { tenantId } });
  await spy.usagePeriod.deleteMany({ where: { tenantId } });
  await spy.tenantBilling.deleteMany({ where: { tenantId } });
  await spy.customer.deleteMany({ where: { tenantId } });
  await spy.service.deleteMany({ where: { tenantId } });
  await spy.serviceCategory.deleteMany({ where: { tenantId } });
  await spy.staffProfile.deleteMany({ where: { tenantId } });
  await spy.location.deleteMany({ where: { tenantId } });
  await spy.userTenant.deleteMany({ where: { tenantId } });
  await spy.user.deleteMany({ where: { id: userId } });
  await spy.tenant.deleteMany({ where: { id: tenantId } });
}

// ── Test Suite ────────────────────────────────────────────────────────────────

describe('Payment Transaction Integrity — E2E', () => {
  let app:        INestApplication;
  let spy:        PrismaClient;
  let jwtService: JwtService;

  let tenantId:   string;
  let userId:     string;
  let staffId:    string;
  let serviceId:  string;
  let locationId: string;
  let customerId: string;
  let token:      string;

  const SLOT_START = '2026-07-01T10:00:00.000Z';
  const SLOT_END   = '2026-07-01T11:00:00.000Z';

  beforeAll(async () => {
    const module: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = module.createNestApplication();
    app.useGlobalPipes(new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true }));
    await app.init();

    spy        = superPrisma();
    jwtService = module.get(JwtService);
  });

  afterAll(async () => {
    await spy.$disconnect();
    await app.close();
  });

  beforeEach(async () => {
    const seed = await seedTenant(spy);
    ({ tenantId, userId, staffId, serviceId, locationId, customerId } = seed);
    token = mintToken(jwtService, userId, tenantId);
  });

  afterEach(async () => {
    await cleanupTenant(spy, tenantId, userId);
  });

  // ── Test 1: Başarılı deposit → ledger + auditLog atomik commit ───────────────

  it(
    'takeDeposit başarılıysa → transactionLedger ve auditLog aynı anda DB\'ye yazılır',
    async () => {
      // Randevu oluştur
      const apptRes = await request(app.getHttpServer())
        .post('/appointments')
        .set('Authorization', `Bearer ${token}`)
        .send({ customerId, staffId, serviceId, locationId, startTime: SLOT_START, endTime: SLOT_END });

      expect(apptRes.status).toBe(201);
      const apptId = (apptRes.body as { id: string }).id;

      // Kaparo al
      const depositRes = await request(app.getHttpServer())
        .post(`/payments/${apptId}/deposit`)
        .set('Authorization', `Bearer ${token}`)
        .set('X-Idempotency-Key', uuid())
        .send({ amount: 150 });

      expect(depositRes.status).toBe(201);

      // TransactionLedger kaydı oluşturulmuş olmalı
      const ledgerRows = await spy.transactionLedger.findMany({
        where: { tenantId, appointmentId: apptId },
      });
      expect(ledgerRows).toHaveLength(1);
      expect(Number(ledgerRows[0]!.amount)).toBe(150);

      // AuditLog kaydı oluşturulmuş olmalı (aynı transaction içinde)
      const auditRows = await spy.auditLog.findMany({
        where: { tenantId, entityId: apptId, action: 'DEPOSIT_TAKEN' },
      });
      expect(auditRows).toHaveLength(1);
    },
    15_000,
  );

  // ── Test 2: Rollback — COMPLETED randevuya deposit → 400, DB değişmez ─────────

  it(
    'COMPLETED randevuya deposit → 400, transactionLedger boş kalır',
    async () => {
      // COMPLETED durumunda randevu oluştur (superPrisma ile direkt insert)
      const apptId = uuid();
      await spy.appointment.create({
        data: {
          id: apptId, tenantId, staffId, customerId, serviceId, locationId,
          startTime: new Date(SLOT_START), endTime: new Date(SLOT_END),
          status: 'COMPLETED' as any,
          totalPrice: 500,
        },
      });

      // Kaparo dene — reddedilmeli
      const depositRes = await request(app.getHttpServer())
        .post(`/payments/${apptId}/deposit`)
        .set('Authorization', `Bearer ${token}`)
        .set('X-Idempotency-Key', uuid())
        .send({ amount: 150 });

      expect(depositRes.status).toBe(400);

      // DB'ye hiçbir şey yazılmamış olmalı
      const ledgerRows = await spy.transactionLedger.findMany({
        where: { tenantId, appointmentId: apptId },
      });
      expect(ledgerRows).toHaveLength(0);

      const auditRows = await spy.auditLog.findMany({
        where: { tenantId, entityId: apptId, action: 'DEPOSIT_TAKEN' },
      });
      expect(auditRows).toHaveLength(0);
    },
    15_000,
  );

  // ── Test 3: Başarılı checkout → ledger + auditLog + appointment.status atomik ─

  it(
    'checkout başarılıysa → appointment COMPLETED + ledger + auditLog aynı anda commit',
    async () => {
      // IN_SERVICE durumunda randevu oluştur
      const apptId = uuid();
      await spy.appointment.create({
        data: {
          id: apptId, tenantId, staffId, customerId, serviceId, locationId,
          startTime: new Date(SLOT_START), endTime: new Date(SLOT_END),
          status: 'IN_SERVICE' as any,
          totalPrice: null,
        },
      });

      const checkoutRes = await request(app.getHttpServer())
        .post(`/payments/${apptId}/checkout`)
        .set('Authorization', `Bearer ${token}`)
        .set('X-Idempotency-Key', uuid())
        .send({ amount: 500, paymentMethod: 'PAYMENT_CASH' });

      expect(checkoutRes.status).toBe(201);

      // Appointment COMPLETED'a geçmiş olmalı
      const updated = await spy.appointment.findUnique({ where: { id: apptId } });
      expect(updated?.status).toBe('COMPLETED');
      expect(Number(updated?.totalPrice)).toBe(500);

      // Ledger kaydı oluşturulmuş olmalı
      const ledgerRows = await spy.transactionLedger.findMany({
        where: { tenantId, appointmentId: apptId },
      });
      expect(ledgerRows.length).toBeGreaterThanOrEqual(1);

      // AuditLog kaydı oluşturulmuş olmalı
      const auditRows = await spy.auditLog.findMany({
        where: { tenantId, entityId: apptId, action: 'COMPLETED' },
      });
      expect(auditRows).toHaveLength(1);
    },
    15_000,
  );

  // ── Test 4: Concurrency — 2 eş zamanlı aynı slot booking → 1 başarı, 1 çakışma

  it(
    '2 eş zamanlı POST /appointments aynı slot → tam 1 kayıt, 1 çakışma (409)',
    async () => {
      const body = { customerId, staffId, serviceId, locationId, startTime: SLOT_START, endTime: SLOT_END };

      const [res1, res2] = await Promise.all([
        request(app.getHttpServer()).post('/appointments').set('Authorization', `Bearer ${token}`).send(body),
        request(app.getHttpServer()).post('/appointments').set('Authorization', `Bearer ${token}`).send(body),
      ]);

      const statuses = [res1.status, res2.status].sort();
      expect(statuses).toEqual([201, 409]);

      const dbCount = await spy.appointment.count({
        where: { tenantId, staffId, startTime: new Date(SLOT_START), isDeleted: false },
      });
      expect(dbCount).toBe(1);
    },
    15_000,
  );

  // ── Test 5: High concurrency — 10 eş zamanlı aynı slot → 1 başarı, 9 çakışma ─

  it(
    '10 eş zamanlı POST /appointments aynı slot → tam 1 kayıt, 9 çakışma (409)',
    async () => {
      const body = { customerId, staffId, serviceId, locationId, startTime: SLOT_START, endTime: SLOT_END };

      const responses = await Promise.all(
        Array.from({ length: 10 }, () =>
          request(app.getHttpServer())
            .post('/appointments')
            .set('Authorization', `Bearer ${token}`)
            .send(body),
        ),
      );

      const created  = responses.filter((r) => r.status === 201);
      const conflict = responses.filter((r) => r.status === 409);

      expect(created.length).toBe(1);
      expect(conflict.length).toBe(9);

      const dbCount = await spy.appointment.count({
        where: { tenantId, staffId, startTime: new Date(SLOT_START), isDeleted: false },
      });
      expect(dbCount).toBe(1);
    },
    20_000,
  );
});

// ── Suite: Redis releaseSlot failure E2E ──────────────────────────────────────

describe('Redis releaseSlot failure — E2E', () => {
  let appRedis:  INestApplication;
  let spyRedis:  PrismaClient;
  let jwtRedis:  JwtService;

  let tenantId:   string;
  let userId:     string;
  let staffId:    string;
  let serviceId:  string;
  let locationId: string;
  let customerId: string;
  let token:      string;

  const SLOT_START = '2026-07-02T10:00:00.000Z';
  const SLOT_END   = '2026-07-02T11:00:00.000Z';

  beforeAll(async () => {
    const module: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    })
      .overrideProvider(AppointmentLockService)
      .useValue({
        acquireConcurrencyLock: jest.fn().mockResolvedValue('lock-key'),
        releaseConcurrencyLock: jest.fn().mockResolvedValue(undefined),
        releaseSlot:            jest.fn().mockRejectedValue(new Error('Redis ECONNREFUSED')),
      })
      .compile();

    appRedis = module.createNestApplication();
    appRedis.useGlobalPipes(new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true }));
    await appRedis.init();

    spyRedis = superPrisma();
    jwtRedis = module.get(JwtService);
  });

  afterAll(async () => {
    await spyRedis.$disconnect();
    await appRedis.close();
  });

  beforeEach(async () => {
    const seed = await seedTenant(spyRedis);
    ({ tenantId, userId, staffId, serviceId, locationId, customerId } = seed);
    token = mintToken(jwtRedis, userId, tenantId);
  });

  afterEach(async () => {
    await cleanupTenant(spyRedis, tenantId, userId);
  });

  it(
    'releaseSlot Redis hatası → booking yine de 201 döner, appointment DB\'ye yazılır',
    async () => {
      const res = await request(appRedis.getHttpServer())
        .post('/appointments')
        .set('Authorization', `Bearer ${token}`)
        .send({ customerId, staffId, serviceId, locationId, startTime: SLOT_START, endTime: SLOT_END });

      expect(res.status).toBe(201);

      const dbCount = await spyRedis.appointment.count({
        where: { tenantId, staffId, startTime: new Date(SLOT_START), isDeleted: false },
      });
      expect(dbCount).toBe(1);
    },
    15_000,
  );
});

// ── Suite: Ledger failure rollback E2E ───────────────────────────────────────

describe('Ledger failure rollback — E2E', () => {
  let appLedger:  INestApplication;
  let spyLedger:  PrismaClient;
  let jwtLedger:  JwtService;

  let tenantId:   string;
  let userId:     string;
  let staffId:    string;
  let serviceId:  string;
  let locationId: string;
  let customerId: string;
  let token:      string;

  const SLOT_START = '2026-07-03T10:00:00.000Z';
  const SLOT_END   = '2026-07-03T11:00:00.000Z';

  beforeAll(async () => {
    const module: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    })
      .overrideProvider(LedgerService)
      .useValue({
        record:           jest.fn().mockRejectedValue(new Error('ledger DB down')),
        findByTenant:     jest.fn().mockResolvedValue([]),
        findByAppointment: jest.fn().mockResolvedValue([]),
      })
      .compile();

    appLedger = module.createNestApplication();
    appLedger.useGlobalPipes(new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true }));
    await appLedger.init();

    spyLedger = superPrisma();
    jwtLedger = module.get(JwtService);
  });

  afterAll(async () => {
    await spyLedger.$disconnect();
    await appLedger.close();
  });

  beforeEach(async () => {
    const seed = await seedTenant(spyLedger);
    ({ tenantId, userId, staffId, serviceId, locationId, customerId } = seed);
    token = mintToken(jwtLedger, userId, tenantId);
  });

  afterEach(async () => {
    await cleanupTenant(spyLedger, tenantId, userId);
  });

  it(
    'ledger.record hatası → deposit 500 döner, transactionLedger boş kalır',
    async () => {
      // Randevu oluştur (AppointmentLockService override yok — normal booking)
      const apptId = uuid();
      await spyLedger.appointment.create({
        data: {
          id: apptId, tenantId, staffId, customerId, serviceId, locationId,
          startTime: new Date(SLOT_START), endTime: new Date(SLOT_END),
          status: 'PENDING' as any,
          totalPrice: null,
        },
      });

      const depositRes = await request(appLedger.getHttpServer())
        .post(`/payments/${apptId}/deposit`)
        .set('Authorization', `Bearer ${token}`)
        .set('X-Idempotency-Key', uuid())
        .send({ amount: 150 });

      expect(depositRes.status).toBe(500);

      // TransactionLedger boş kalmalı (rollback)
      const ledgerRows = await spyLedger.transactionLedger.findMany({
        where: { tenantId, appointmentId: apptId },
      });
      expect(ledgerRows).toHaveLength(0);

      // AuditLog boş kalmalı (ledger hatası → auditLog'a ulaşılmaz)
      const auditRows = await spyLedger.auditLog.findMany({
        where: { tenantId, entityId: apptId, action: 'DEPOSIT_TAKEN' },
      });
      expect(auditRows).toHaveLength(0);
    },
    15_000,
  );
});
