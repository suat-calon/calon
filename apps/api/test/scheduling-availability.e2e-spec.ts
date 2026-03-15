/**
 * ═══════════════════════════════════════════════════════════════════════════
 * P5-4 — SCHEDULING CRON + AVAILABILITY CACHE E2E TEST
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * Test 1: expireStaleHolds — süresi dolmuş hold'lar EXPIRED olur
 * Test 2: getOccupiedSlots — dolu slot cache'te görünür (ikinci çağrı cache hit)
 * Test 3: cache invalidation — iptal sonrası slot boşalır
 * Test 4: getAvailableSlots — müsait slot listesi döner, dolu slot dahil değil
 *
 * ÇALIŞTIRMA:
 *   yarn workspace @calon/api jest \
 *     --config jest-e2e.config.js --testPathPattern=scheduling-availability --forceExit
 * ═══════════════════════════════════════════════════════════════════════════
 */

// ── Ortam değişkenleri ─────────────────────────────────────────────────────
const TEST_DB_URL =
  process.env['TEST_DATABASE_URL'] ??
  'postgresql://calon_app:calon_app_dev_secret@localhost:5432/calon_dev';

process.env['DATABASE_URL']      = TEST_DB_URL;
process.env['JWT_SECRET']        = 'sched-avail-test-secret-32chars!';
process.env['NODE_ENV']          = 'development';
process.env['REDIS_HOST']        = 'localhost';
process.env['REDIS_PORT']        = '6379';
process.env['REDIS_PASSWORD']    = '';
process.env['IYZICO_SECRET_KEY'] = 'test-iyzico-secret-key-min10chars';
process.env['IYZICO_API_KEY']    = 'test-iyzico-api-key-min10chars';

import { Test, TestingModule }              from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import { PrismaClient }                     from '@prisma/client';
import { v4 as uuid }                       from 'uuid';
import Redis                                from 'ioredis';

import { AppModule }                        from '../src/app.module';
import { AppointmentHoldService }           from '../src/modules/operations/appointment/appointment-hold.service';
import { AppointmentAvailabilityService }   from '../src/modules/operations/appointment/appointment-availability.service';
import { SchedulingAvailabilityService }    from '../src/modules/operations/appointment/scheduling-availability.service';
import { REDIS_CLIENT }                     from '../src/common/redis.module';

// ── Yardımcılar ─────────────────────────────────────────────────────────────

const SUPER_DB_URL =
  process.env['TEST_SUPER_DATABASE_URL'] ??
  'postgresql://postgres:postgres_secret@localhost:5432/calon_dev';

function superPrisma(): PrismaClient {
  return new PrismaClient({
    datasources: { db: { url: SUPER_DB_URL } },
    log: [],
  });
}

/**
 * Seed: Tenant → User → Location → Staff → StaffWorkingHour → Category → Service → Customer → Billing
 * Yarın için 09:00-18:00 çalışma saati seed'i (booking-flow pattern ile aynı).
 */
async function seedSchedulingTenant(spy: PrismaClient): Promise<{
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
      name:     'Scheduling Test Tenant',
      slug:     `sched-${tenantId.slice(0, 8)}`,
      plan:     'BOUTIQUE' as any,
      status:   'ACTIVE',
      timezone: 'Europe/Istanbul',
    },
  });

  await spy.user.create({
    data: {
      id:           userId,
      email:        `sched-${tenantId.slice(0, 8)}@test.com`,
      passwordHash: '$2b$12$aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa',
      firstName:    'Sched',
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

  // BillingGuard → TRIAL
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

describe('P5-4 — Scheduling Cron + Availability Cache', () => {
  let app:                INestApplication;
  let spy:                PrismaClient;
  let holdService:        AppointmentHoldService;
  let availabilityService: AppointmentAvailabilityService;
  let schedulingService:  SchedulingAvailabilityService;
  let redis:              Redis;

  let tenantId:   string;
  let userId:     string;
  let staffId:    string;
  let serviceId:  string;
  let locationId: string;
  let customerId: string;

  // Yarın 10:00-11:00 UTC slot
  const tomorrow = new Date();
  tomorrow.setDate(tomorrow.getDate() + 1);
  const slotStart = new Date(tomorrow);
  slotStart.setUTCHours(10, 0, 0, 0);
  const slotEnd = new Date(tomorrow);
  slotEnd.setUTCHours(11, 0, 0, 0);
  const SLOT_START_ISO = slotStart.toISOString();
  const SLOT_END_ISO   = slotEnd.toISOString();
  const SLOT_DATE      = SLOT_START_ISO.slice(0, 10); // YYYY-MM-DD (UTC)

  // Paylaşılan appointment ID (Test 2 → Test 3)
  let appointmentId: string;

  beforeAll(async () => {
    const module: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = module.createNestApplication();
    app.useGlobalPipes(
      new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true }),
    );
    await app.init();

    spy                = superPrisma();
    holdService        = module.get(AppointmentHoldService);
    availabilityService = module.get(AppointmentAvailabilityService);
    schedulingService  = module.get(SchedulingAvailabilityService);
    redis              = module.get(REDIS_CLIENT);

    const seed = await seedSchedulingTenant(spy);
    tenantId   = seed.tenantId;
    userId     = seed.userId;
    staffId    = seed.staffId;
    serviceId  = seed.serviceId;
    locationId = seed.locationId;
    customerId = seed.customerId;
  });

  afterAll(async () => {
    try {
      if (tenantId) await cleanupTenant(spy, tenantId, userId);
    } catch (err) {
      console.warn('Cleanup warning:', (err as Error).message?.slice(0, 100));
    }
    await spy.$disconnect();
    await app?.close();
  });

  // ── Test 1: expireStaleHolds — süresi dolmuş hold'lar EXPIRED olur ──────

  it('expireStaleHolds — expired holds become EXPIRED', async () => {
    // Superuser ile DB'ye doğrudan ACTIVE hold ekle (expiresAt = 1 dakika ÖNCE)
    const holdId = uuid();
    const expiredAt = new Date(Date.now() - 60_000); // 1 dk önce

    await spy.appointmentHold.create({
      data: {
        id:        holdId,
        tenantId,
        staffId,
        serviceId,
        startTime: slotStart,
        endTime:   slotEnd,
        expiresAt: expiredAt,
        status:    'ACTIVE',
        holdToken: uuid(),
      },
    });

    // Hold DB'de ACTIVE olarak var
    const before = await spy.appointmentHold.findUnique({ where: { id: holdId } });
    expect(before).not.toBeNull();
    expect(before!.status).toBe('ACTIVE');

    // expireStaleHolds çağır
    await holdService.expireStaleHolds();

    // DB'de hold.status = 'EXPIRED' olmalı
    const after = await spy.appointmentHold.findUnique({ where: { id: holdId } });
    expect(after).not.toBeNull();
    expect(after!.status).toBe('EXPIRED');

    // Cleanup — expired hold'u sil (sonraki testleri etkilemesin)
    await spy.appointmentHold.delete({ where: { id: holdId } });
  });

  // ── Test 2: getOccupiedSlots — dolu slot cache'te görünür ───────────────

  it('getOccupiedSlots — returns appointments and caches result', async () => {
    // Superuser ile appointment ekle (yarın 10:00-11:00)
    appointmentId = uuid();
    await spy.appointment.create({
      data: {
        id:        appointmentId,
        tenantId,
        staffId,
        serviceId,
        customerId,
        locationId,
        startTime: slotStart,
        endTime:   slotEnd,
        status:    'CONFIRMED',
        source:    'ONLINE',
      },
    });

    // İlk çağrı — cache miss, DB'den gelir
    const slots1 = await availabilityService.getOccupiedSlots(tenantId, staffId, SLOT_DATE);
    expect(slots1.length).toBeGreaterThanOrEqual(1);

    const found = slots1.find((s) => s.id === appointmentId);
    expect(found).toBeDefined();
    expect(found!.startTime).toBe(SLOT_START_ISO);
    expect(found!.endTime).toBe(SLOT_END_ISO);
    expect(found!.status).toBe('CONFIRMED');

    // İkinci çağrı — cache hit (Redis'ten gelmeli)
    const t0 = Date.now();
    const slots2 = await availabilityService.getOccupiedSlots(tenantId, staffId, SLOT_DATE);
    const elapsed = Date.now() - t0;

    expect(slots2.length).toBe(slots1.length);
    // Cache hit genelde < 5ms, DB sorgusu > 10ms — hız farkını kontrol etmiyoruz strict,
    // ama Redis cache key'inin varlığını kontrol ediyoruz
    const cacheKey = `calon:availability:${tenantId}:${staffId}:${SLOT_DATE}`;
    const cached = await redis.get(cacheKey);
    expect(cached).not.toBeNull();
    expect(JSON.parse(cached!)).toHaveLength(slots1.length);
  });

  // ── Test 3: cache invalidation — iptal sonrası slot boşalır ────────────

  it('cache invalidation — cancelled appointment clears from cache', async () => {
    expect(appointmentId).toBeDefined(); // Test 2'den

    // Appointment'ı CANCELLED yap
    await spy.appointment.update({
      where: { id: appointmentId },
      data:  { status: 'CANCELLED' },
    });

    // availability.invalidate() çağır — cache'i temizle
    await availabilityService.invalidate(tenantId, staffId, slotStart);

    // Cache key silinmiş olmalı
    const cacheKey = `calon:availability:${tenantId}:${staffId}:${SLOT_DATE}`;
    const cached = await redis.get(cacheKey);
    expect(cached).toBeNull();

    // getOccupiedSlots() tekrar çağır — CANCELLED appointment listede olmamalı
    const slots = await availabilityService.getOccupiedSlots(tenantId, staffId, SLOT_DATE);
    const found = slots.find((s) => s.id === appointmentId);
    expect(found).toBeUndefined(); // CANCELLED → filtreli, görünmemeli

    // Cleanup
    await spy.appointment.delete({ where: { id: appointmentId } });
  });

  // ── Test 4: getAvailableSlots — müsait slot listesi döner ──────────────

  it('getAvailableSlots — returns free slots, excludes occupied', async () => {
    // Yeni appointment ekle (yarın 10:00-11:00) — bu slot dolu olacak
    const occupiedApptId = uuid();
    await spy.appointment.create({
      data: {
        id:        occupiedApptId,
        tenantId,
        staffId,
        serviceId,
        customerId,
        locationId,
        startTime: slotStart,
        endTime:   slotEnd,
        status:    'CONFIRMED',
        source:    'ONLINE',
      },
    });

    // Availability cache'i temizle — temiz sorgu
    await availabilityService.invalidate(tenantId, staffId, slotStart);

    // getAvailableSlots çağır
    // date: yarının YYYY-MM-DD'si, timezone: Europe/Istanbul, 60 dk servis
    const tomorrowDate = new Date();
    tomorrowDate.setDate(tomorrowDate.getDate() + 1);
    const dateStr = tomorrowDate.toISOString().slice(0, 10);

    const freeSlots = await schedulingService.getAvailableSlots(
      tenantId,
      staffId,
      dateStr,
      'Europe/Istanbul',
      60, // 60 dakika servis süresi
    );

    // SlotDto[] formatında olmalı
    expect(Array.isArray(freeSlots)).toBe(true);

    if (freeSlots.length > 0) {
      // Her slot'un startTime ve endTime'ı olmalı
      expect(freeSlots[0]).toHaveProperty('startTime');
      expect(freeSlots[0]).toHaveProperty('endTime');

      // 10:00-11:00 slotu listede OLMAMALI (dolu)
      const occupiedSlot = freeSlots.find(
        (s) => s.startTime === SLOT_START_ISO,
      );
      expect(occupiedSlot).toBeUndefined();
    }

    // 09:00-18:00 çalışma saati ile 60 dk servis → beklenen slot sayısı
    // 09:00, 09:30, 10:00, ..., 17:00 = 17 aday slot (30 dk aralık)
    // Dolu slot (10:00-11:00) → 10:00 ve 10:30 çıkar = 15 veya daha az
    // (hold'lar, shift'ler de çıkabilir)
    // En az birkaç müsait slot olmalı
    expect(freeSlots.length).toBeGreaterThan(0);

    // Cleanup
    await spy.appointment.delete({ where: { id: occupiedApptId } });
  });
});
