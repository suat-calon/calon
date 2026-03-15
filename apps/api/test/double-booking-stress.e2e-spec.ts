/**
 * ═══════════════════════════════════════════════════════════════════════════
 * P5-3 — DOUBLE-BOOKING STRESS TEST
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * Triple-Layer Slot Security doğrulaması:
 *   Test 1: 5 eş zamanlı hold → sadece 1 başarılı (Redis NX + GIST)
 *   Test 2: Dolu slot'a book → 409 (Application overlap check)
 *   Test 3: GIST EXCLUDE constraint doğrudan DB insert'ü reddeder (23P01)
 *
 * ÇALIŞTIRMA:
 *   yarn workspace @calon/api jest \
 *     --config jest-e2e.config.js --testPathPattern=double-booking-stress --forceExit
 * ═══════════════════════════════════════════════════════════════════════════
 */

// ── Ortam değişkenleri ─────────────────────────────────────────────────────
const TEST_DB_URL =
  process.env['TEST_DATABASE_URL'] ??
  'postgresql://calon_app:calon_app_dev_secret@localhost:5432/calon_dev';

process.env['DATABASE_URL']      = TEST_DB_URL;
process.env['JWT_SECRET']        = 'stress-test-jwt-secret-32chars!!';
process.env['NODE_ENV']          = 'development';
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

import { AppModule } from '../src/app.module';

const request = supertest;

// ── Yardımcılar ─────────────────────────────────────────────────────────────

/** Superuser bağlantısı — RLS bypass eder (test seed/cleanup için) */
const SUPER_DB_URL =
  process.env['TEST_SUPER_DATABASE_URL'] ??
  'postgresql://postgres:postgres_secret@localhost:5432/calon_dev';

function superPrisma(): PrismaClient {
  return new PrismaClient({
    datasources: { db: { url: SUPER_DB_URL } },
    log: [],
  });
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
 * Stress test için minimal seed:
 *   Tenant → User → Location → Staff → StaffWorkingHour → Category → Service → Customer → Billing
 */
async function seedStressTenant(spy: PrismaClient): Promise<{
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
      id:       tenantId,
      name:     'Stress Test Tenant',
      slug:     `stress-${tenantId.slice(0, 8)}`,
      plan:     'BOUTIQUE' as any,
      status:   'ACTIVE',
      timezone: 'Europe/Istanbul',
    },
  });

  await spy.user.create({
    data: {
      id:           userId,
      email:        `stress-${tenantId.slice(0, 8)}@test.com`,
      passwordHash: '$2b$12$aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa',
      firstName:    'Stress',
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

  // StaffWorkingHour — yarın için 09:00-18:00
  const tomorrowDate = new Date();
  tomorrowDate.setDate(tomorrowDate.getDate() + 1);
  const dayMap = ['SUN', 'MON', 'TUE', 'WED', 'THU', 'FRI', 'SAT'] as const;
  const dayOfWeek = dayMap[tomorrowDate.getDay()];
  await spy.staffWorkingHour.create({
    data: {
      tenantId,
      staffId,
      dayOfWeek: dayOfWeek as any,
      startTime: '09:00',
      endTime:   '18:00',
      isWorkingDay: true,
    },
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
      id:            customerId,
      tenantId,
      firstName:     'Test',
      lastName:      'Customer',
      phone:         `+90555${tenantId.slice(0, 7)}`,
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

async function cleanupTenant(spy: PrismaClient, tenantId: string, userId: string) {
  await spy.appointment.deleteMany({ where: { tenantId } });
  await spy.appointmentHold.deleteMany({ where: { tenantId } });
  await spy.auditLog.deleteMany({ where: { tenantId } });
  await spy.usagePeriod.deleteMany({ where: { tenantId } });
  await spy.tenantBilling.deleteMany({ where: { tenantId } });
  await spy.customer.deleteMany({ where: { tenantId } });
  await spy.service.deleteMany({ where: { tenantId } });
  await spy.serviceCategory.deleteMany({ where: { tenantId } });
  await spy.staffWorkingHour.deleteMany({ where: { tenantId } });
  await spy.staffProfile.deleteMany({ where: { tenantId } });
  await spy.location.deleteMany({ where: { tenantId } });
  await spy.userTenant.deleteMany({ where: { tenantId } });
  await spy.user.deleteMany({ where: { id: userId } });
  await spy.tenant.deleteMany({ where: { id: tenantId } });
}

// ── Test Suite ────────────────────────────────────────────────────────────────

describe('P5-3 — Double-Booking Stress Test', () => {
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

  // Slot: yarın 10:00 (hold + book testleri bu slotu kullanır)
  const tomorrow = new Date();
  tomorrow.setDate(tomorrow.getDate() + 1);
  const slotStart = new Date(tomorrow);
  slotStart.setUTCHours(10, 0, 0, 0);
  const SLOT_START = slotStart.toISOString();

  beforeAll(async () => {
    const module: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = module.createNestApplication();
    app.setGlobalPrefix('api/v1', { exclude: ['metrics'] });
    app.useGlobalPipes(
      new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true }),
    );
    await app.init();

    spy        = superPrisma();
    jwtService = module.get(JwtService);

    const seed = await seedStressTenant(spy);
    tenantId   = seed.tenantId;
    userId     = seed.userId;
    staffId    = seed.staffId;
    serviceId  = seed.serviceId;
    locationId = seed.locationId;
    customerId = seed.customerId;
    token      = mintToken(jwtService, userId, tenantId);
  }, 30_000);

  afterAll(async () => {
    try {
      if (tenantId) await cleanupTenant(spy, tenantId, userId);
    } catch (err) {
      console.warn('Cleanup warning:', (err as Error).message?.slice(0, 100));
    }
    await spy.$disconnect();
    await app?.close();
  });

  // ── Test 1: 5 eş zamanlı hold → sadece 1 başarılı ────────────────────────

  it('5 eş zamanlı POST /api/v1/public/holds — sadece 1 başarılı, 4 conflict', async () => {
    const CONCURRENT = 5;

    const responses = await Promise.all(
      Array.from({ length: CONCURRENT }, () =>
        request(app.getHttpServer())
          .post('/api/v1/public/holds')
          .send({
            tenantId,
            staffId,
            serviceId,
            startTime: SLOT_START,
          }),
      ),
    );

    const statuses = responses.map((r) => r.status);
    const created  = statuses.filter((s) => s === 201);
    const conflict = statuses.filter((s) => s === 409);

    // Tam olarak 1 başarılı hold
    expect(created.length).toBe(1);

    // Geri kalanı 409 Conflict
    expect(conflict.length).toBe(CONCURRENT - 1);

    // DB'de sadece 1 aktif hold
    const holdCount = await spy.appointmentHold.count({
      where: { tenantId, staffId, status: 'ACTIVE' },
    });
    expect(holdCount).toBe(1);
  }, 15_000);

  // ── Test 2: Dolu slot'a ikinci book → 409 ────────────────────────────────
  // Önce slot'a appointment oluştur, sonra aynı slot'a tekrar book → conflict

  it('POST /api/v1/public/book — dolu slot (appointment var) ikinci book 409 döner', async () => {
    // Farklı slot kullan (Test 1'deki hold ile karışmasın)
    const slotB = new Date(tomorrow);
    slotB.setUTCHours(14, 0, 0, 0);
    const SLOT_B = slotB.toISOString();

    // İlk book — başarılı olmalı
    const res1 = await request(app.getHttpServer())
      .post('/api/v1/public/book')
      .send({
        tenantId,
        locationId,
        staffId,
        serviceId,
        startTime:  SLOT_B,
        firstName:  'Test',
        lastName:   'Customer',
        phone:      `+90555${tenantId.slice(0, 7)}`,
      });

    expect(res1.status).toBe(201);
    expect(res1.body.appointmentId).toBeDefined();

    // İkinci book — aynı slot → 409 bekleniyor
    const res2 = await request(app.getHttpServer())
      .post('/api/v1/public/book')
      .send({
        tenantId,
        locationId,
        staffId,
        serviceId,
        startTime:  SLOT_B,
        firstName:  'Başka',
        lastName:   'Müşteri',
        phone:      '+905559999999',
      });

    expect(res2.status).toBe(409);
  });

  // ── Test 3: GIST EXCLUDE constraint — doğrudan DB insert reddedilir ──────
  // PostgreSQL seviyesinde overlap koruması (23P01 exclusion_violation)

  it('GIST EXCLUDE constraint — çakışan appointment_holds insert 23P01 hatası verir', async () => {
    // Önce mevcut hold'ları temizle, temiz sahne
    await spy.appointmentHold.deleteMany({ where: { tenantId } });

    const holdId1 = uuid();
    const holdId2 = uuid();
    const startTime = new Date(SLOT_START);
    const endTime   = new Date(startTime.getTime() + 60 * 60 * 1000); // +1 saat
    const expiresAt = new Date(Date.now() + 5 * 60 * 1000); // +5 dk

    // İlk hold — başarılı olmalı
    await spy.$executeRaw`
      INSERT INTO appointment_holds ("id", "tenantId", "staffId", "serviceId", "startTime", "endTime", "expiresAt", "status")
      VALUES (${holdId1}::uuid, ${tenantId}::uuid, ${staffId}::uuid, ${serviceId}::uuid, ${startTime}, ${endTime}, ${expiresAt}, 'ACTIVE')
    `;

    // İkinci hold — aynı staff + çakışan zaman → GIST EXCLUDE 23P01
    try {
      await spy.$executeRaw`
        INSERT INTO appointment_holds ("id", "tenantId", "staffId", "serviceId", "startTime", "endTime", "expiresAt", "status")
        VALUES (${holdId2}::uuid, ${tenantId}::uuid, ${staffId}::uuid, ${serviceId}::uuid, ${startTime}, ${endTime}, ${expiresAt}, 'ACTIVE')
      `;
      // Buraya ulaşmamalı
      fail('GIST constraint çakışan insert\'ü engellemedi!');
    } catch (err: any) {
      // PostgreSQL exclusion_violation kodu: 23P01
      expect(err.code).toBe('P2010'); // Prisma raw query hatası
      expect(err.message).toContain('exclusion');
    }
  });
});
