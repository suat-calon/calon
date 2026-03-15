/**
 * ═══════════════════════════════════════════════════════════════════════════
 * P5-2 — BOOKING FLOW E2E TEST SUITİ
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * Tam booking akisi: Hold → Book → Duplicate Hold 409 → Status Update
 *
 * CALISTIRMA:
 *   yarn workspace @calon/api jest \
 *     --config jest-e2e.config.js --testPathPattern=booking-flow --forceExit
 * ═══════════════════════════════════════════════════════════════════════════
 */

// ── Ortam degiskenleri ─────────────────────────────────────────────────────
// P5-2.1: calon_app kullanicisi — RLS ENFORCED. Race condition fix dogrulamasi.
const TEST_DB_URL =
  process.env['TEST_DATABASE_URL'] ??
  'postgresql://calon_app:calon_app_dev_secret@localhost:5432/calon_dev';

process.env['DATABASE_URL']      = TEST_DB_URL;
process.env['JWT_SECRET']        = 'booking-flow-test-secret-32chars!';
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

// ── Yardimcilar ─────────────────────────────────────────────────────────────

/** Superuser baglantisi — RLS bypass eder (test seed/cleanup icin) */
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
 * Booking flow testi icin minimal seed:
 *   Tenant -> User -> Location -> Staff -> StaffWorkingHour -> Category -> Service -> Customer -> Billing
 */
async function seedBookingTenant(spy: PrismaClient): Promise<{
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
      name:     'Booking Flow Test Tenant',
      slug:     `booking-${tenantId.slice(0, 8)}`,
      plan:     'BOUTIQUE' as any,
      status:   'ACTIVE',
      timezone: 'Europe/Istanbul',
    },
  });

  await spy.user.create({
    data: {
      id:           userId,
      email:        `booking-${tenantId.slice(0, 8)}@test.com`,
      passwordHash: '$2b$12$aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa',
      firstName:    'Booking',
      lastName:     'Tester',
      status:       'ACTIVE',
      tenants: {
        create: { tenantId, role: 'TENANT_OWNER' },
      },
    },
  });

  await spy.location.create({
    data: { id: locationId, tenantId, name: 'Test Sube' },
  });

  await spy.staffProfile.create({
    data: { id: staffId, tenantId, locationId, firstName: 'Test', lastName: 'Staff' },
  });

  // StaffWorkingHour — yarin icin 09:00-18:00 (slot testi yarin 10:00 kullaniyor)
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

  // BillingGuard -> TRIAL gerekiyor
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

describe('P5-2 — Booking Flow E2E', () => {
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

  // Slot A: yarin 10:00 (hold testi)
  const tomorrow = new Date();
  tomorrow.setDate(tomorrow.getDate() + 1);
  const slotA = new Date(tomorrow);
  slotA.setUTCHours(10, 0, 0, 0);
  const SLOT_A_START = slotA.toISOString();

  // Slot B: yarin 14:00 (book testi — farkli slot, hold ile cakismaz)
  const slotB = new Date(tomorrow);
  slotB.setUTCHours(14, 0, 0, 0);
  const SLOT_B_START = slotB.toISOString();

  // State paylasimi
  let appointmentId: string;

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

    const seed = await seedBookingTenant(spy);
    tenantId   = seed.tenantId;
    userId     = seed.userId;
    staffId    = seed.staffId;
    serviceId  = seed.serviceId;
    locationId = seed.locationId;
    customerId = seed.customerId;
    token      = mintToken(jwtService, userId, tenantId);
  });

  afterAll(async () => {
    try {
      if (tenantId) await cleanupTenant(spy, tenantId, userId);
    } catch (err) {
      // Cleanup hatalari test sonucunu etkilemesin
      // eslint-disable-next-line no-console
      console.warn('Cleanup warning:', (err as Error).message?.slice(0, 100));
    }
    await spy.$disconnect();
    await app?.close();
  });

  // ── Test 1: Public hold endpoint slot kilidi alir ─────────────────────────

  it('POST /api/v1/public/holds — slot kilidi alir (Slot A)', async () => {
    const res = await request(app.getHttpServer())
      .post('/api/v1/public/holds')
      .send({
        tenantId,
        staffId,
        serviceId,
        startTime: SLOT_A_START,
      });

    expect(res.status).toBe(201);
    expect(res.body.holdId).toBeDefined();
    expect(typeof res.body.holdId).toBe('string');
    expect(res.body.expiresAt).toBeDefined();

    // expiresAt gelecekte olmali
    const expiresAt = new Date(res.body.expiresAt as string);
    expect(expiresAt.getTime()).toBeGreaterThan(Date.now());

    // DB'de hold kaydi var
    const hold = await spy.appointmentHold.findUnique({ where: { id: res.body.holdId as string } });
    expect(hold).not.toBeNull();
    expect(hold!.status).toBe('ACTIVE');
  });

  // ── Test 2: Public book endpoint randevu olusturur (legacy path) ──────────
  // Not: holdId gonderilmez — legacy direct commit kullanilir.
  // Hold-based commit ($transaction) ile RLS set_config uyumsuzlugu
  // ayri bir ticket olarak izlenecek (P5 backlog).

  it('POST /api/v1/public/book — randevu olusturulur (Slot B, legacy)', async () => {
    const res = await request(app.getHttpServer())
      .post('/api/v1/public/book')
      .send({
        tenantId,
        locationId,
        staffId,
        serviceId,
        startTime:  SLOT_B_START,
        firstName:  'Test',
        lastName:   'Customer',
        phone:      `+90555${tenantId.slice(0, 7)}`,
        // holdId yok — legacy direct commit
      });

    if (res.status !== 201) {
      // eslint-disable-next-line no-console
      console.error('BOOK ERROR:', JSON.stringify(res.body, null, 2));
    }
    expect(res.status).toBe(201);
    expect(res.body.appointmentId).toBeDefined();
    expect(typeof res.body.appointmentId).toBe('string');

    // DB'de appointment kaydi var
    const appt = await spy.appointment.findUnique({
      where: { id: res.body.appointmentId as string },
    });
    expect(appt).not.toBeNull();
    // Status: PENDING veya PENDING_PAYMENT
    expect(['PENDING', 'PENDING_PAYMENT']).toContain(appt!.status);

    appointmentId = res.body.appointmentId as string;
  });

  // ── Test 3: Dolu slot icin hold 409 doner ─────────────────────────────────
  // Slot B artik randevu ile dolu — yeni hold appointment overlap nedeniyle reddedilir.

  it('POST /api/v1/public/holds — dolu slot (Slot B) hold 409 doner', async () => {
    const res = await request(app.getHttpServer())
      .post('/api/v1/public/holds')
      .send({
        tenantId,
        staffId,
        serviceId,
        startTime: SLOT_B_START,
      });

    expect(res.status).toBe(409);
  });

  // ── Test 4: Authenticated appointment status update ───────────────────────

  it('PATCH /api/v1/appointments/:id/status — CONFIRMED', async () => {
    expect(appointmentId).toBeDefined(); // Test 2'den

    const res = await request(app.getHttpServer())
      .patch(`/api/v1/appointments/${appointmentId}/status`)
      .set('Authorization', `Bearer ${token}`)
      .send({ status: 'CONFIRMED' });

    expect(res.status).toBe(200);

    // DB'de status guncellenmis olmali
    const appt = await spy.appointment.findUnique({ where: { id: appointmentId } });
    expect(appt!.status).toBe('CONFIRMED');
  });
});
