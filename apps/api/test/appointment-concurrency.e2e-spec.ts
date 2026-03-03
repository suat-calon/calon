/**
 * ═══════════════════════════════════════════════════════════════════════════
 * FAZ 14 — APPOINTMENT CONCURRENCY E2E TEST SUITİ
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * Kabul Kriterleri:
 *   ✅ 50 eş zamanlı POST /appointments aynı slot için gönderilir
 *   ✅ Tam olarak 1 istek 201 döner
 *   ✅ Geri kalan 49 istek 409 döner
 *   ✅ DB'de yalnızca 1 appointment kaydı bulunur
 *   ✅ Reschedule çift kilit: eski slot lock → yeni slot lock → overlap check
 *
 * ÇALIŞTIRMA:
 *   TEST_DATABASE_URL="..." yarn workspace @auralis/api jest \
 *     --config jest-e2e.config.js --testPathPattern=appointment-concurrency --forceExit
 * ═══════════════════════════════════════════════════════════════════════════
 */

// ── Ortam değişkenleri ─────────────────────────────────────────────────────
const TEST_DB_URL =
  process.env['TEST_DATABASE_URL'] ??
  'postgresql://auralis:dev_password@localhost:5432/auralis_test';

process.env['DATABASE_URL']   = TEST_DB_URL;
process.env['JWT_SECRET']     = 'chaos-test-jwt-secret-32chars!!';
process.env['NODE_ENV']       = 'test';
process.env['REDIS_HOST']     = 'localhost';
process.env['REDIS_PORT']     = '6379';
process.env['REDIS_PASSWORD'] = '';

import { Test, TestingModule }              from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import supertest                            = require('supertest');
import { PrismaClient }                     from '@prisma/client';
import { JwtService }                       from '@nestjs/jwt';
import { v4 as uuid }                       from 'uuid';

import { AppModule }   from '../src/app.module';
import { PrismaService } from '../src/common/prisma.service';

const request = supertest;

// ── Yardımcılar ─────────────────────────────────────────────────────────────

function superPrisma(): PrismaClient {
  return new PrismaClient({ datasources: { db: { url: TEST_DB_URL } } });
}

function mintToken(
  jwt:      JwtService,
  userId:   string,
  tenantId: string,
  role      = 'TENANT_OWNER',
): string {
  return jwt.sign({ sub: userId, tenantId, role, plan: 'BOUTIQUE' });
}

/**
 * Concurrency testi için minimal seed:
 *   Tenant → User → Location → Staff → ServiceCategory → Service → Customer → TenantBilling
 */
async function seedConcurrencyTenant(spy: PrismaClient): Promise<{
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
    data: {
      id:     tenantId,
      name:   'Concurrency Test Tenant',
      slug:   `concurrency-${tenantId.slice(0, 8)}`,
      plan:   'BOUTIQUE' as any,
      status: 'ACTIVE',
    },
  });

  await spy.user.create({
    data: {
      id:           userId,
      email:        `concurrency-${tenantId.slice(0, 8)}@test.com`,
      passwordHash: '$2b$12$aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa',
      firstName:    'Concurrency',
      lastName:     'Tester',
      status:       'ACTIVE',
      tenants: {
        create: { tenantId, role: 'TENANT_OWNER' },
      },
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
    data: {
      id:          serviceId,
      tenantId,
      categoryId:  catId,
      name:        'Test Hizmet',
      durationMin: 60,
      price:       100,
    },
  });

  await spy.customer.create({
    data: {
      id:         customerId,
      tenantId,
      firstName:  'Test',
      lastName:   'Customer',
      loyaltyPoints: 0,
    },
  });

  // BillingGuard → TRIAL gerekiyor
  const now         = new Date();
  const trialEndsAt = new Date(now);
  trialEndsAt.setDate(trialEndsAt.getDate() + 7);
  const graceUntil  = new Date(trialEndsAt);
  graceUntil.setDate(graceUntil.getDate() + 3);
  const periodEnd   = new Date(now);
  periodEnd.setDate(periodEnd.getDate() + 30);

  await spy.tenantBilling.create({
    data: {
      tenantId,
      plan:               'BOUTIQUE' as any,
      cycle:              'MONTHLY',
      status:             'TRIAL' as any,
      trialEndsAt,
      graceUntil,
      currentPeriodStart: now,
      currentPeriodEnd:   periodEnd,
      provider:           'NONE',
    },
  });

  await spy.usagePeriod.create({
    data: {
      tenantId,
      periodStart: now,
      periodEnd,
      smsIncluded: 50,
      aiIncluded:  20,
    },
  });

  return { tenantId, userId, staffId, serviceId, locationId, customerId };
}

// ── Test Suite ────────────────────────────────────────────────────────────────

describe('FAZ 14 — Appointment Concurrency', () => {
  let app:        INestApplication;
  let spy:        PrismaClient;
  let jwtService: JwtService;

  // Seed verileri — her test için yeni oluşturulur
  let tenantId:   string;
  let userId:     string;
  let staffId:    string;
  let serviceId:  string;
  let locationId: string;
  let customerId: string;
  let token:      string;

  // Sabit slot: 2026-06-15T10:00 – 11:00 UTC
  const SLOT_START = '2026-06-15T10:00:00.000Z';
  const SLOT_END   = '2026-06-15T11:00:00.000Z';

  beforeAll(async () => {
    const module: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = module.createNestApplication();
    app.useGlobalPipes(
      new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true }),
    );
    await app.init();

    spy        = superPrisma();
    jwtService = module.get(JwtService);
  });

  afterAll(async () => {
    await spy.$disconnect();
    await app.close();
  });

  beforeEach(async () => {
    // Her test için temiz seed
    const seed = await seedConcurrencyTenant(spy);
    tenantId   = seed.tenantId;
    userId     = seed.userId;
    staffId    = seed.staffId;
    serviceId  = seed.serviceId;
    locationId = seed.locationId;
    customerId = seed.customerId;
    token      = mintToken(jwtService, userId, tenantId);
  });

  afterEach(async () => {
    // Seed verisini temizle (appointment → diğerleri)
    await spy.appointment.deleteMany({ where: { tenantId } });
    await spy.auditLog.deleteMany({ where: { tenantId } });
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
  });

  // ── Test 1: 50 eş zamanlı istek — 1 başarı, 49 çakışma ─────────────────────

  it(
    '50 eş zamanlı POST /appointments için tam olarak 1 kayıt oluşur, 49 409 döner',
    async () => {
      const CONCURRENT_REQUESTS = 50;

      const appointmentBody = {
        customerId,
        staffId,
        serviceId,
        locationId,
        startTime: SLOT_START,
        endTime:   SLOT_END,
      };

      // 50 isteği eş zamanlı gönder
      const responses = await Promise.all(
        Array.from({ length: CONCURRENT_REQUESTS }, () =>
          request(app.getHttpServer())
            .post('/appointments')
            .set('Authorization', `Bearer ${token}`)
            .send(appointmentBody),
        ),
      );

      const statuses = responses.map((r) => r.status);
      const created  = statuses.filter((s) => s === 201);
      const conflict = statuses.filter((s) => s === 409);

      // Tam olarak 1 başarılı kayıt
      expect(created.length).toBe(1);

      // Geri kalanı 409 Conflict
      expect(conflict.length).toBe(CONCURRENT_REQUESTS - 1);

      // DB'de yalnızca 1 kayıt
      const dbCount = await spy.appointment.count({
        where: {
          tenantId,
          staffId,
          startTime: new Date(SLOT_START),
          isDeleted:  false,
        },
      });
      expect(dbCount).toBe(1);
    },
    30_000, // 30s timeout: 50 concurrent istek + DB transaction
  );

  // ── Test 2: Farklı slotlar — çakışma olmaz ────────────────────────────────

  it('Farklı saat dilimlerindeki istekler çakışmaz — her biri 201 döner', async () => {
    const slots = [
      { start: '2026-06-15T09:00:00.000Z', end: '2026-06-15T10:00:00.000Z' },
      { start: '2026-06-15T11:00:00.000Z', end: '2026-06-15T12:00:00.000Z' },
      { start: '2026-06-15T13:00:00.000Z', end: '2026-06-15T14:00:00.000Z' },
      { start: '2026-06-15T15:00:00.000Z', end: '2026-06-15T16:00:00.000Z' },
    ];

    const responses = await Promise.all(
      slots.map((slot) =>
        request(app.getHttpServer())
          .post('/appointments')
          .set('Authorization', `Bearer ${token}`)
          .send({
            customerId,
            staffId,
            serviceId,
            locationId,
            startTime: slot.start,
            endTime:   slot.end,
          }),
      ),
    );

    for (const res of responses) {
      expect(res.status).toBe(201);
    }

    const dbCount = await spy.appointment.count({ where: { tenantId, staffId } });
    expect(dbCount).toBe(slots.length);
  }, 15_000);

  // ── Test 3: Reschedule — çakışmalı yeni slot reddedilir ──────────────────

  it('Reschedule: meşgul slota taşıma 409 döner', async () => {
    // İlk randevu oluştur (A: 10:00-11:00)
    const resA = await request(app.getHttpServer())
      .post('/appointments')
      .set('Authorization', `Bearer ${token}`)
      .send({
        customerId,
        staffId,
        serviceId,
        locationId,
        startTime: SLOT_START,
        endTime:   SLOT_END,
      });
    expect(resA.status).toBe(201);
    const apptIdA = (resA.body as { id: string }).id;

    // İkinci randevu farklı slotta oluştur (B: 11:00-12:00)
    const resB = await request(app.getHttpServer())
      .post('/appointments')
      .set('Authorization', `Bearer ${token}`)
      .send({
        customerId,
        staffId,
        serviceId,
        locationId,
        startTime: '2026-06-15T11:00:00.000Z',
        endTime:   '2026-06-15T12:00:00.000Z',
      });
    expect(resB.status).toBe(201);
    const apptIdB = (resB.body as { id: string }).id;

    // B'yi A'nın slotuna taşımaya çalış → 409 bekleniyor
    const rescheduleRes = await request(app.getHttpServer())
      .patch(`/appointments/${apptIdB}/reschedule`)
      .set('Authorization', `Bearer ${token}`)
      .send({
        newStartTime: SLOT_START,         // A ile çakışıyor
        newEndTime:   SLOT_END,
        reason:       'Overlap test',
      });

    expect(rescheduleRes.status).toBe(409);

    // B'nin zamanı değişmemiş olmalı
    const apptB = await spy.appointment.findUnique({ where: { id: apptIdB } });
    expect(apptB?.startTime.toISOString()).toBe('2026-06-15T11:00:00.000Z');
  }, 15_000);

  // ── Test 4: Reschedule — boş slota taşıma başarılı ───────────────────────

  it('Reschedule: boş slota taşıma 200 döner ve DB güncellenir', async () => {
    // Randevu oluştur
    const resCreate = await request(app.getHttpServer())
      .post('/appointments')
      .set('Authorization', `Bearer ${token}`)
      .send({
        customerId,
        staffId,
        serviceId,
        locationId,
        startTime: SLOT_START,
        endTime:   SLOT_END,
      });
    expect(resCreate.status).toBe(201);
    const apptId = (resCreate.body as { id: string }).id;

    // Boş bir slota taşı
    const NEW_START = '2026-06-15T14:00:00.000Z';
    const NEW_END   = '2026-06-15T15:00:00.000Z';

    const rescheduleRes = await request(app.getHttpServer())
      .patch(`/appointments/${apptId}/reschedule`)
      .set('Authorization', `Bearer ${token}`)
      .send({
        newStartTime: NEW_START,
        newEndTime:   NEW_END,
        reason:       'Müşteri talebi',
      });

    expect(rescheduleRes.status).toBe(200);

    // DB'de yeni saat doğrulanmalı
    const updated = await spy.appointment.findUnique({ where: { id: apptId } });
    expect(updated?.startTime.toISOString()).toBe(NEW_START);
    expect(updated?.endTime.toISOString()).toBe(NEW_END);

    // AuditLog yazılmış olmalı
    const auditLogs = await spy.auditLog.findMany({
      where: { tenantId, entityId: apptId, action: 'RESCHEDULED' },
    });
    expect(auditLogs.length).toBe(1);
  }, 15_000);
});
