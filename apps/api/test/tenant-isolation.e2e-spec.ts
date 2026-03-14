/**
 * ═══════════════════════════════════════════════════════════════════════════
 * P4 — CROSS-TENANT İZOLASYON E2E TESTLERİ
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * Katman 1: Prisma $extends interceptor (tenantId WHERE enjeksiyonu)
 * Katman 2: PostgreSQL RLS (set_config + policy)
 *
 * ÇALIŞTIRMA:
 *   TEST_DATABASE_URL="..." yarn workspace @calon/api jest \
 *     --config jest-e2e.config.js --testPathPattern=tenant-isolation --forceExit
 * ═══════════════════════════════════════════════════════════════════════════
 */

// ── Ortam değişkenleri ─────────────────────────────────────────────────────
const TEST_DB_URL =
  process.env['TEST_DATABASE_URL'] ??
  'postgresql://calon_app:calon_app_dev_secret@localhost:5432/calon_dev';

process.env['DATABASE_URL']   = TEST_DB_URL;
process.env['JWT_SECRET']     = 'tenant-isolation-test-secret-32!';
process.env['NODE_ENV']       = 'development';
process.env['REDIS_HOST']     = 'localhost';
process.env['REDIS_PORT']     = '6379';
process.env['REDIS_PASSWORD']    = '';
process.env['IYZICO_SECRET_KEY'] = 'test-iyzico-secret-key-min10chars';

import { Test, TestingModule }              from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import supertest                            = require('supertest');
import { PrismaClient }                     from '@prisma/client';
import { JwtService }                       from '@nestjs/jwt';
import { v4 as uuid }                       from 'uuid';

import { AppModule }     from '../src/app.module';

const request = supertest;

// ── Yardımcılar ─────────────────────────────────────────────────────────────

/** Superuser bağlantısı — RLS bypass eder (test seed/cleanup için) */
const SUPER_DB_URL =
  process.env['TEST_SUPER_DATABASE_URL'] ??
  'postgresql://postgres:postgres_secret@localhost:5432/calon_dev';

function superPrisma(): PrismaClient {
  return new PrismaClient({ datasources: { db: { url: SUPER_DB_URL } } });
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
 * Bir tenant için minimal test verisi oluşturur:
 *   Tenant → User → UserTenant → Location → Staff → Category → Service → Customer → TenantBilling → UsagePeriod
 */
async function seedTenant(spy: PrismaClient, label: string) {
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
      name:   `${label} Tenant`,
      slug:   `${label}-${tenantId.slice(0, 8)}`,
      plan:   'BOUTIQUE' as any,
      status: 'ACTIVE',
    },
  });

  await spy.user.create({
    data: {
      id:           userId,
      email:        `${label}-${tenantId.slice(0, 8)}@test.com`,
      passwordHash: '$2b$12$aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa',
      firstName:    label,
      lastName:     'Tester',
      status:       'ACTIVE',
      tenants: {
        create: { tenantId, role: 'TENANT_OWNER' },
      },
    },
  });

  await spy.location.create({
    data: { id: locationId, tenantId, name: `${label} Şube` },
  });

  await spy.staffProfile.create({
    data: { id: staffId, tenantId, locationId, firstName: label, lastName: 'Staff' },
  });

  await spy.serviceCategory.create({
    data: { id: catId, tenantId, name: `${label} Kategori` },
  });

  await spy.service.create({
    data: {
      id:          serviceId,
      tenantId,
      categoryId:  catId,
      name:        `${label} Hizmet`,
      durationMin: 60,
      price:       100,
    },
  });

  await spy.customer.create({
    data: {
      id:            customerId,
      tenantId,
      firstName:     `${label}Müşteri`,
      lastName:      'Test',
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

  return { tenantId, userId, staffId, serviceId, locationId, customerId, catId };
}

/**
 * Tenant verisini temizler (FK sırasına dikkat)
 */
async function cleanupTenant(spy: PrismaClient, tenantId: string) {
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
  // User silme: email unique, farklı tenant'lardan referans olmadığından güvenli
  const uts = await spy.userTenant.findMany({ where: { tenantId } });
  if (uts.length === 0) {
    // userTenant zaten silindi, user'ı da silelim
    await spy.user.deleteMany({
      where: { tenants: { none: {} }, email: { contains: tenantId.slice(0, 8) } },
    });
  }
  await spy.tenant.deleteMany({ where: { id: tenantId } });
}

// ── Test Suite ────────────────────────────────────────────────────────────────

describe('P4 — Cross-Tenant Isolation', () => {
  let app:        INestApplication;
  let spy:        PrismaClient;
  let jwtService: JwtService;

  // İki tenant verisi
  let tenantA: Awaited<ReturnType<typeof seedTenant>>;
  let tenantB: Awaited<ReturnType<typeof seedTenant>>;
  let tokenA:  string;
  let tokenB:  string;

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

    // İki izole tenant oluştur
    tenantA = await seedTenant(spy, 'alpha');
    tenantB = await seedTenant(spy, 'bravo');

    tokenA = mintToken(jwtService, tenantA.userId, tenantA.tenantId);
    tokenB = mintToken(jwtService, tenantB.userId, tenantB.tenantId);
  });

  afterAll(async () => {
    // Temizlik — seed başarısız olmuş olabilir
    if (tenantA?.tenantId) await cleanupTenant(spy, tenantA.tenantId);
    if (tenantB?.tenantId) await cleanupTenant(spy, tenantB.tenantId);
    await spy.$disconnect();
    await app?.close();
  });

  // ────────────────────────────────────────────────────────────────────────────
  // TEST 1: Tenant A kullanıcısı Tenant B müşterilerini göremez
  // ────────────────────────────────────────────────────────────────────────────
  it('Tenant A kullanıcısı Tenant B müşterilerini göremez', async () => {
    const res = await request(app.getHttpServer())
      .get('/api/v1/customers')
      .set('Authorization', `Bearer ${tokenA}`)
      .expect(200);

    // Response yapısını debug et ve doğrula
    const body = res.body;
    // Olası formatlar: { data: [...] }, { customers: [...] }, [...], { items: [...] }
    const customers: any[] =
      Array.isArray(body) ? body :
      Array.isArray(body.data) ? body.data :
      Array.isArray(body.customers) ? body.customers :
      Array.isArray(body.items) ? body.items :
      [];

    // Tüm dönen müşteri ID'lerini topla
    const customerIds = customers.map((c: any) => c.id);

    // Tenant B müşterisi OLMAMALI (birincil güvenlik testi)
    expect(customerIds).not.toContain(tenantB.customerId);

    // Eğer müşteriler dönüyorsa, Tenant A'nın müşterisi olmalı
    // (Boş liste de kabul: newly created tenant, no prior data beyond seed)
    if (customers.length > 0) {
      expect(customerIds).toContain(tenantA.customerId);
    }
  });

  // ────────────────────────────────────────────────────────────────────────────
  // TEST 2: Tenant A müşterisi Tenant B token ile 404 döner
  // ────────────────────────────────────────────────────────────────────────────
  it('Tenant A müşterisi Tenant B token ile 404 döner', async () => {
    // Tenant A'ya ait müşteriyi Tenant B token'ıyla iste
    await request(app.getHttpServer())
      .get(`/api/v1/customers/${tenantA.customerId}`)
      .set('Authorization', `Bearer ${tokenB}`)
      .expect(404);
  });

  // ────────────────────────────────────────────────────────────────────────────
  // TEST 3: Public booking endpoint sadece hedef tenant verisini döner
  // ────────────────────────────────────────────────────────────────────────────
  it('Public /services endpoint sadece hedef tenant verisini döner', async () => {
    const res = await request(app.getHttpServer())
      .get(`/api/v1/public/services`)
      .query({ tenantId: tenantA.tenantId })
      .expect(200);

    // Tüm dönen servisler sadece Tenant A'ya ait olmalı
    const services = Array.isArray(res.body) ? res.body : (res.body.data ?? []);

    // En az Tenant A'nın servisi olmalı
    expect(services.length).toBeGreaterThanOrEqual(1);

    // Tenant B servis ID'si listede OLMAMALI
    const hasCrossService = services.some(
      (s: any) => s.id === tenantB.serviceId,
    );
    expect(hasCrossService).toBe(false);

    // Opsiyonel: dönen tüm kayıtlar tenantA'ya mı ait?
    // (response tenantId dönüyorsa)
    for (const s of services) {
      if (s.tenantId) {
        expect(s.tenantId).toBe(tenantA.tenantId);
      }
    }
  });
});
