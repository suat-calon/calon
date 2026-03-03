/**
 * ═══════════════════════════════════════════════════════════════════════════
 * FAZ 12 — PLAN ENGINE E2E TEST SUITİ
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * Kabul Kriterleri:
 *   ✅ Adım 1: TRIAL 7 gün — Pro features (loyalty=true) + smsIncluded=50, aiIncluded=20
 *   ✅ Adım 2: TRIAL bitince PAST_DUE — login ok, kritik write (redeem) kapalı
 *   ✅ Adım 3: Grace bitince SUSPENDED — billing dışında write kapalı
 *   ✅ Adım 4: staffMax limit aşılamıyor (race-safe)
 *   ✅ Adım 5: Cache invalidate — plan/status değişince anında yansıyor
 *
 * ÇALIŞTIRMA:
 *   TEST_DATABASE_URL="..." yarn workspace @auralis/api jest --config jest-e2e.config.js --testPathPattern=billing
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

import { AppModule }             from '../src/app.module';
import { BillingService }        from '../src/modules/billing/billing.service';
import { EntitlementsService }   from '../src/modules/billing/entitlements.service';
import { BillingCron }           from '../src/modules/billing/billing.cron';
import { PrismaService }         from '../src/common/prisma.service';

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
  plan      = 'BOUTIQUE',
): string {
  return jwt.sign({ sub: userId, tenantId, role, plan });
}

function mintSuperAdmin(jwt: JwtService, userId: string, tenantId: string): string {
  return jwt.sign({ sub: userId, tenantId, role: 'SUPER_ADMIN', plan: 'ENTERPRISE' });
}

/**
 * Billing testleri için minimal seed.
 * TenantBilling kaydı AYRI oluşturulur (BillingService.initTrial).
 */
async function seedBillingTenant(
  spy:    PrismaClient,
  opts: {
    slug:          string;
    email:         string;
    plan?:         string;
    billingStatus?: string;
  },
): Promise<{
  tenantId:   string;
  userId:     string;
  customerId: string;
  staffId:    string;
  locationId: string;
}> {
  const tenantId   = uuid();
  const userId     = uuid();
  const customerId = uuid();
  const staffId    = uuid();
  const locationId = uuid();
  const catId      = uuid();
  const serviceId  = uuid();

  const plan = opts.plan ?? 'BOUTIQUE';

  await spy.tenant.create({
    data: {
      id:     tenantId,
      name:   `Test ${opts.slug}`,
      slug:   opts.slug,
      plan:   plan as any,
      status: 'ACTIVE',
    },
  });

  await spy.user.create({
    data: {
      id:           userId,
      email:        opts.email,
      passwordHash: '$2b$12$aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa',
      firstName:    'Test',
      lastName:     'User',
      status:       'ACTIVE',
      tenants: {
        create: { tenantId, role: 'TENANT_OWNER' },
      },
    },
  });

  await spy.location.create({
    data: { id: locationId, tenantId, name: 'Ana Şube' },
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
      durationMin: 30,
      price:       100,
    },
  });

  await spy.customer.create({
    data: {
      id:         customerId,
      tenantId,
      firstName:  'Test',
      lastName:   'Customer',
      loyaltyPoints: 100,
    },
  });

  // TenantBilling oluştur
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
      plan:               plan as any,
      cycle:              'MONTHLY',
      status:             (opts.billingStatus ?? 'TRIAL') as any,
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

  return { tenantId, userId, customerId, staffId, locationId };
}

// ── Test Suite ────────────────────────────────────────────────────────────────

describe('FAZ 12 — Plan Engine', () => {
  let app:          INestApplication;
  let spy:          PrismaClient;
  let jwtService:   JwtService;
  let billing:      BillingService;
  let entitlements: EntitlementsService;
  let cron:         BillingCron;

  beforeAll(async () => {
    const module: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app          = module.createNestApplication();
    app.setGlobalPrefix('api/v1');
    app.useGlobalPipes(new ValidationPipe({ whitelist: true, transform: true }));
    await app.init();

    jwtService   = module.get(JwtService);
    billing      = module.get(BillingService);
    entitlements = module.get(EntitlementsService);
    cron         = module.get(BillingCron);
    spy          = superPrisma();
  });

  afterAll(async () => {
    await spy.$disconnect();
    await app.close();
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // ADIM 1 — TRIAL: Pro features + düşük kota
  // ═══════════════════════════════════════════════════════════════════════════
  describe('Adım 1 — TRIAL: Pro features + smsIncluded=50, aiIncluded=20', () => {
    let tenantId: string;
    let userId:   string;
    let customerId: string;

    beforeAll(async () => {
      ({ tenantId, userId, customerId } = await seedBillingTenant(spy, {
        slug:          `billing-trial-${uuid().slice(0, 8)}`,
        email:         `trial-${uuid().slice(0, 8)}@test.com`,
        plan:          'BOUTIQUE',
        billingStatus: 'TRIAL',
      }));
      // Cache'i temizle — temiz okuma
      await entitlements.invalidate(tenantId);
    });

    it('TRIAL status: EntitlementsService isTrial=true döner', async () => {
      const ent = await entitlements.getEntitlements(tenantId, 'BOUTIQUE');
      expect(ent.isTrial).toBe(true);
      expect(ent.status).toBe('TRIAL');
    });

    it('TRIAL: loyalty feature = true (BOUTIQUE Pro set)', async () => {
      const ent = await entitlements.getEntitlements(tenantId, 'BOUTIQUE');
      expect(ent.features.loyalty).toBe(true);
      expect(ent.features.staffManagement).toBe(true);
      expect(ent.features.marketing).toBe(true);
    });

    it('TRIAL: smsIncluded=50, aiIncluded=20 (düşük kota override)', async () => {
      const ent = await entitlements.getEntitlements(tenantId, 'BOUTIQUE');
      expect(ent.quota.smsIncluded).toBe(50);
      expect(ent.quota.aiIncluded).toBe(20);
    });

    it('TRIAL: GET /loyalty/customers/:id/history → 200 (Pro feature erişilebilir)', async () => {
      const token = mintToken(jwtService, userId, tenantId, 'TENANT_OWNER', 'BOUTIQUE');
      const res   = await request(app.getHttpServer())
        .get(`/api/v1/loyalty/customers/${customerId}/history`)
        .set('Authorization', `Bearer ${token}`);

      expect(res.status).toBe(200);
    });
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // ADIM 2 — TRIAL bitince PAST_DUE: login açık, kritik write kapalı
  // ═══════════════════════════════════════════════════════════════════════════
  describe('Adım 2 — TRIAL → PAST_DUE: login ok, kritik write 402', () => {
    let tenantId:   string;
    let userId:     string;
    let customerId: string;

    beforeAll(async () => {
      ({ tenantId, userId, customerId } = await seedBillingTenant(spy, {
        slug:          `billing-pastdue-${uuid().slice(0, 8)}`,
        email:         `pastdue-${uuid().slice(0, 8)}@test.com`,
        plan:          'BOUTIQUE',
        billingStatus: 'TRIAL',
      }));

      // trialEndsAt'ı geçmişe çek → cron PAST_DUE yapacak
      await spy.tenantBilling.update({
        where: { tenantId },
        data:  {
          trialEndsAt: new Date(Date.now() - 1000), // 1 saniye önce
          graceUntil:  new Date(Date.now() + 3 * 24 * 60 * 60 * 1000), // grace hâlâ geçerli
        },
      });

      // Cron'u elle çalıştır
      await cron.runNow();
      await entitlements.invalidate(tenantId);
    });

    it('PAST_DUE: billing status güncellendi', async () => {
      const b = await spy.tenantBilling.findUnique({ where: { tenantId } });
      expect(b?.status).toBe('PAST_DUE');
    });

    it('PAST_DUE: entitlements.status = PAST_DUE', async () => {
      const ent = await entitlements.getEntitlements(tenantId, 'BOUTIQUE');
      expect(ent.status).toBe('PAST_DUE');
    });

    it('PAST_DUE: /iam/login (whitelist) → hâlâ erişilebilir (TenantGuard bypass)', async () => {
      // Login endpoint'i zaten @Public() — 400 dönmesi beklenir (yanlış şifre yok = 401)
      // Test: PAST_DUE iken public endpoint 402 DÖNMEZ
      const res = await request(app.getHttpServer())
        .post('/api/v1/iam/login')
        .send({ email: 'nonexistent@test.com', password: 'wrong', tenantId });
      // PAST_DUE olmasına rağmen 402 değil, 401 (kimlik doğrulama hatası) bekleriz
      expect(res.status).not.toBe(402);
    });

    it('PAST_DUE: POST /loyalty/redeem (@BlockWhenPastDue) → 402', async () => {
      const token = mintToken(jwtService, userId, tenantId, 'TENANT_OWNER', 'BOUTIQUE');
      const res   = await request(app.getHttpServer())
        .post('/api/v1/loyalty/redeem')
        .set('Authorization', `Bearer ${token}`)
        .set('x-idempotency-key', uuid())
        .send({ customerId, points: 10, description: 'test' });

      expect(res.status).toBe(402);
      expect(res.body.errorCode).toBe('PAST_DUE');
    });

    it('PAST_DUE: GET /loyalty/customers/:id/history (okuma) → 200', async () => {
      const token = mintToken(jwtService, userId, tenantId, 'TENANT_OWNER', 'BOUTIQUE');
      const res   = await request(app.getHttpServer())
        .get(`/api/v1/loyalty/customers/${customerId}/history`)
        .set('Authorization', `Bearer ${token}`);

      expect(res.status).toBe(200);
    });
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // ADIM 3 — Grace bitince SUSPENDED: billing dışında write kapalı
  // ═══════════════════════════════════════════════════════════════════════════
  describe('Adım 3 — SUSPENDED: billing dışında write 402', () => {
    let tenantId:   string;
    let userId:     string;
    let customerId: string;

    beforeAll(async () => {
      ({ tenantId, userId, customerId } = await seedBillingTenant(spy, {
        slug:          `billing-suspended-${uuid().slice(0, 8)}`,
        email:         `suspended-${uuid().slice(0, 8)}@test.com`,
        plan:          'BOUTIQUE',
        billingStatus: 'TRIAL',
      }));

      // trialEndsAt VE graceUntil'i geçmişe çek → cron PAST_DUE sonra SUSPENDED yapacak
      await spy.tenantBilling.update({
        where: { tenantId },
        data: {
          trialEndsAt: new Date(Date.now() - 2000),
          graceUntil:  new Date(Date.now() - 1000), // grace de geçti
        },
      });

      // Cron → PAST_DUE
      await cron.runNow();
      // İkinci çalıştırma → SUSPENDED (PAST_DUE + graceUntil geçti)
      await cron.runNow();
      await entitlements.invalidate(tenantId);
    });

    it('SUSPENDED: billing status = SUSPENDED', async () => {
      const b = await spy.tenantBilling.findUnique({ where: { tenantId } });
      expect(b?.status).toBe('SUSPENDED');
    });

    it('SUSPENDED: POST /loyalty/redeem → 402 + errorCode=SUSPENDED', async () => {
      const token = mintToken(jwtService, userId, tenantId, 'TENANT_OWNER', 'BOUTIQUE');
      const res   = await request(app.getHttpServer())
        .post('/api/v1/loyalty/redeem')
        .set('Authorization', `Bearer ${token}`)
        .set('x-idempotency-key', uuid())
        .send({ customerId, points: 10, description: 'test' });

      expect(res.status).toBe(402);
      expect(res.body.errorCode).toBe('SUSPENDED');
    });

    it('SUSPENDED: GET /loyalty/customers/:id/history → 402 (okuma da engellendi)', async () => {
      const token = mintToken(jwtService, userId, tenantId, 'TENANT_OWNER', 'BOUTIQUE');
      const res   = await request(app.getHttpServer())
        .get(`/api/v1/loyalty/customers/${customerId}/history`)
        .set('Authorization', `Bearer ${token}`);

      // SUSPENDED: /billing/* whitelist dışı her şey 402
      expect(res.status).toBe(402);
      expect(res.body.errorCode).toBe('SUSPENDED');
    });

    it('SUSPENDED: POST /iam/login (@Public) → 402 değil (public endpoint korunmuyor)', async () => {
      const res = await request(app.getHttpServer())
        .post('/api/v1/iam/login')
        .send({ email: 'x@x.com', password: 'y', tenantId });
      expect(res.status).not.toBe(402);
    });
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // ADIM 4 — staffMax Limit: aşılamıyor (race-safe)
  // ═══════════════════════════════════════════════════════════════════════════
  describe('Adım 4 — staffMax limit: SOLO plan 1 personel', () => {
    let tenantId:   string;
    let userId:     string;
    let locationId: string;

    beforeAll(async () => {
      // SOLO plan → staffMax=1
      ({ tenantId, userId, locationId } = await seedBillingTenant(spy, {
        slug:          `billing-limit-${uuid().slice(0, 8)}`,
        email:         `limit-${uuid().slice(0, 8)}@test.com`,
        plan:          'SOLO',
        billingStatus: 'ACTIVE',
      }));
      // ACTIVE yap (TRIAL limit aynı ama tam test için)
      await spy.tenantBilling.update({
        where: { tenantId },
        data:  { status: 'ACTIVE' },
      });
      await entitlements.invalidate(tenantId);
    });

    it('SOLO: staffMax=1 — entitlements limits.staffMax = 1', async () => {
      const ent = await entitlements.getEntitlements(tenantId, 'SOLO');
      expect(ent.limits.staffMax).toBe(1);
    });

    it('SOLO: LimitCheckService ile ikinci personel oluşturma → LIMIT_EXCEEDED', async () => {
      const { LimitCheckService } = await import(
        '../src/modules/billing/guards/limit-check.service'
      );

      // Module ref üzerinden al
      const limitService = app
        .get<InstanceType<typeof LimitCheckService>>(LimitCheckService);

      // Seed sırasında 1 personel oluşturuldu.
      // $transaction dışından test ediyoruz (tx mock olarak this.prisma kullan):
      // seedBillingTenant zaten 1 staff oluşturdu → count=1 ≥ max=1 → throw
      const prismaRef = app.get(PrismaService);
      await expect(
        prismaRef.$transaction(async (tx: any) => {
          await limitService.checkStaffLimit(tenantId, 'SOLO', tx);
        }),
      ).rejects.toMatchObject({
        response: { errorCode: 'LIMIT_EXCEEDED', limit: 'staffMax' },
      });
    });
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // ADIM 5 — Cache invalidate: plan değişince 60s beklemeden yansıyor
  // ═══════════════════════════════════════════════════════════════════════════
  describe('Adım 5 — Cache invalidate: plan/status değişince anında yansıyor', () => {
    let tenantId:  string;
    let userId:    string;
    let superAdminId: string;

    beforeAll(async () => {
      superAdminId = uuid();

      ({ tenantId, userId } = await seedBillingTenant(spy, {
        slug:          `billing-cache-${uuid().slice(0, 8)}`,
        email:         `cache-${uuid().slice(0, 8)}@test.com`,
        plan:          'SOLO',
        billingStatus: 'ACTIVE',
      }));

      // SUPER_ADMIN user oluştur (admin endpoint için)
      await spy.user.create({
        data: {
          id:           superAdminId,
          email:        `superadmin-${uuid().slice(0, 8)}@test.com`,
          passwordHash: '$2b$12$aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa',
          firstName:    'Super',
          lastName:     'Admin',
          status:       'ACTIVE',
          tenants: {
            create: { tenantId, role: 'SUPER_ADMIN' },
          },
        },
      });

      await spy.tenantBilling.update({
        where: { tenantId },
        data:  { status: 'ACTIVE', plan: 'SOLO' },
      });
      await spy.tenant.update({ where: { id: tenantId }, data: { plan: 'SOLO' } });
      await entitlements.invalidate(tenantId);
    });

    it('Cache: ilk okumada SOLO → loyalty=false', async () => {
      const ent = await entitlements.getEntitlements(tenantId, 'SOLO');
      expect(ent.features.loyalty).toBe(false);
    });

    it('Cache: admin set-plan BOUTIQUE → invalidate → anında BOUTIQUE görünür', async () => {
      // Admin API ile plan değiştir
      const superToken = mintSuperAdmin(jwtService, superAdminId, tenantId);
      const res = await request(app.getHttpServer())
        .post(`/api/v1/admin/billing/tenants/${tenantId}/set-plan`)
        .set('Authorization', `Bearer ${superToken}`)
        .send({ plan: 'BOUTIQUE' });

      expect(res.status).toBe(200);
      expect(res.body.plan).toBe('BOUTIQUE');

      // invalidate yapıldı — yeni getEntitlements çağrısı DB'den okur
      const ent = await entitlements.getEntitlements(tenantId, 'BOUTIQUE');
      expect(ent.features.loyalty).toBe(true);
    });

    it('Cache: activate API → status ACTIVE, yeni entitlements anında görünür', async () => {
      // Önce SUSPENDED yap
      await billing.suspend(tenantId);
      let ent = await entitlements.getEntitlements(tenantId, 'BOUTIQUE');
      expect(ent.status).toBe('SUSPENDED');

      // Admin API ile activate
      const superToken = mintSuperAdmin(jwtService, superAdminId, tenantId);
      const res = await request(app.getHttpServer())
        .post(`/api/v1/admin/billing/tenants/${tenantId}/activate`)
        .set('Authorization', `Bearer ${superToken}`)
        .send({ cycle: 'MONTHLY' });

      expect(res.status).toBe(200);

      // Yeni okumada ACTIVE
      ent = await entitlements.getEntitlements(tenantId, 'BOUTIQUE');
      expect(ent.status).toBe('ACTIVE');
    });
  });
});
