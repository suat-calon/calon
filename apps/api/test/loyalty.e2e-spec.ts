/**
 * ═══════════════════════════════════════════════════════════════════════════
 * FAZ 11 — LOYALTY MVP E2E TEST SUITİ
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * Kabul Kriterleri:
 *   ✅ Adım 1: SOLO plan → 403 Forbidden (ProPlanGuard)
 *   ✅ Adım 2: Aynı idempotencyKey ile earnFromAppointment → tek LoyaltyTransaction
 *   ✅ Adım 3: Redeem çift tıklama (aynı x-idempotency-key) → tek kesim
 *   ✅ Adım 4: Yetersiz bakiye → 400 Bad Request
 *   ✅ Adım 5: GET /loyalty/customers/:id/history → bakiye + sayfalı hareketler
 *
 * ÇALIŞTIRMA:
 *   TEST_DATABASE_URL="..." yarn workspace @calon/api jest --config jest-e2e.config.js --testPathPattern=loyalty
 * ═══════════════════════════════════════════════════════════════════════════
 */

// ── Ortam değişkenleri ─────────────────────────────────────────────────────
const TEST_DB_URL =
  process.env['TEST_DATABASE_URL'] ??
  'postgresql://calon:dev_password@localhost:5432/calon_test';

process.env['DATABASE_URL']   = TEST_DB_URL;
process.env['JWT_SECRET']     = 'chaos-test-jwt-secret-32chars!!';
process.env['NODE_ENV']       = 'test';
process.env['REDIS_HOST']     = 'localhost';
process.env['REDIS_PORT']     = '6379';
process.env['REDIS_PASSWORD'] = '';

import { Test, TestingModule }           from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import supertest                          = require('supertest');
import { PrismaClient }                  from '@prisma/client';
import { JwtService }                    from '@nestjs/jwt';
import { v4 as uuid }                    from 'uuid';
import { AppModule }                     from '../src/app.module';
import { LoyaltyService }                from '../src/modules/loyalty/loyalty.service';

const request = supertest;

// ── Yardımcılar ─────────────────────────────────────────────────────────────

function superPrisma(): PrismaClient {
  return new PrismaClient({ datasources: { db: { url: TEST_DB_URL } } });
}

/**
 * JWT mint — `plan` dahil. TenantGuard payload.plan ?? 'SOLO' okur.
 */
function mintToken(
  jwt:      JwtService,
  userId:   string,
  tenantId: string,
  role      = 'TENANT_OWNER',
  plan      = 'SOLO',
): string {
  return jwt.sign({ sub: userId, tenantId, role, plan });
}

/**
 * Loyalty testleri için minimal seed:
 *  - Tenant (plan parametre ile)
 *  - User + UserTenant
 *  - Location, Room, Staff
 *  - Customer (loyaltyPoints = 0 başlangıç)
 *  - Service
 */
async function seedLoyaltyTenant(
  spy:  PrismaClient,
  opts: { slug: string; email: string; plan?: string; initialPoints?: number },
): Promise<{
  tenantId:   string;
  userId:     string;
  customerId: string;
  staffId:    string;
  serviceId:  string;
  locationId: string;
}> {
  const tenantId   = uuid();
  const userId     = uuid();
  const locationId = uuid();
  const staffId    = uuid();
  const customerId = uuid();
  const serviceId  = uuid();
  const plan       = opts.plan ?? 'SOLO';
  const initPoints = opts.initialPoints ?? 0;

  await spy.$executeRawUnsafe(`
    INSERT INTO tenants (id, name, slug, plan, status, "createdAt", "updatedAt")
    VALUES ('${tenantId}', 'Loyalty Test ${opts.slug}', '${opts.slug}',
            '${plan}', 'ACTIVE', NOW(), NOW())
  `);

  await spy.$executeRawUnsafe(`
    INSERT INTO users (id, email, "passwordHash", "firstName", "lastName", status, "createdAt", "updatedAt")
    VALUES ('${userId}', '${opts.email}', 'hash', 'Loyalty', 'Tester', 'ACTIVE', NOW(), NOW())
  `);

  await spy.$executeRawUnsafe(`
    INSERT INTO user_tenants (id, "userId", "tenantId", role, "createdAt", "updatedAt")
    VALUES ('${uuid()}', '${userId}', '${tenantId}', 'TENANT_OWNER', NOW(), NOW())
  `);

  await spy.$executeRawUnsafe(`
    INSERT INTO locations (id, "tenantId", name, address, "isActive", "createdAt", "updatedAt")
    VALUES ('${locationId}', '${tenantId}', 'Loyalty Location', 'Test Mah. No:1', TRUE, NOW(), NOW())
  `);

  await spy.$executeRawUnsafe(`
    INSERT INTO staff_profiles (id, "tenantId", "locationId", "firstName", "lastName",
                                "commissionRate", "isActive", "createdAt", "updatedAt")
    VALUES ('${staffId}', '${tenantId}', '${locationId}', 'Loyalty', 'Staff', 10, TRUE, NOW(), NOW())
  `);

  await spy.$executeRawUnsafe(`
    INSERT INTO customers (id, "tenantId", "firstName", "lastName", phone,
                           "loyaltyPoints", "createdAt", "updatedAt")
    VALUES ('${customerId}', '${tenantId}', 'Loyal', 'Customer', '+905550000001',
            ${initPoints}, NOW(), NOW())
  `);

  await spy.$executeRawUnsafe(`
    INSERT INTO service_categories (id, "tenantId", name, "isActive", "createdAt", "updatedAt")
    VALUES ('${uuid()}', '${tenantId}', 'Default Cat', TRUE, NOW(), NOW())
  `);

  const catResult = await spy.$queryRawUnsafe<Array<{ id: string }>>(
    `SELECT id FROM service_categories WHERE "tenantId" = '${tenantId}' LIMIT 1`,
  );
  const categoryId = catResult[0]?.id ?? uuid();

  await spy.$executeRawUnsafe(`
    INSERT INTO services (id, "tenantId", "categoryId", name, "durationMin", price, "isActive", "createdAt", "updatedAt")
    VALUES ('${serviceId}', '${tenantId}', '${categoryId}', 'Test Hizmet', 60, 500.00, TRUE, NOW(), NOW())
  `);

  return { tenantId, userId, customerId, staffId, serviceId, locationId };
}

async function cleanupLoyaltyTenant(spy: PrismaClient, tenantId: string): Promise<void> {
  const ordered = [
    'loyalty_transactions',
    'commission_logs', 'transaction_ledger', 'audit_logs',
    'appointments', 'refresh_tokens', 'idempotency_keys',
    'staff_profiles', 'services', 'service_categories',
    'customers', 'consent_forms', 'messages', 'campaign_templates',
    'rooms', 'locations',
    'user_tenants', 'users', 'tenants',
  ];

  for (const table of ordered) {
    if (table === 'users') {
      await spy.$executeRawUnsafe(
        `DELETE FROM users WHERE id IN (SELECT "userId" FROM user_tenants WHERE "tenantId" = '${tenantId}')`,
      ).catch(() => { /* yoksay */ });
    } else if (table === 'tenants') {
      await spy.$executeRawUnsafe(`DELETE FROM tenants WHERE id = '${tenantId}'`).catch(() => { /* yoksay */ });
    } else {
      await spy.$executeRawUnsafe(`DELETE FROM "${table}" WHERE "tenantId" = '${tenantId}'`).catch(() => { /* yoksay */ });
    }
  }
}

// ══════════════════════════════════════════════════════════════════════════════
// TEST SUITİ
// ══════════════════════════════════════════════════════════════════════════════

describe('FAZ 11 — Loyalty MVP', () => {
  let app:            INestApplication;
  let jwtService:     JwtService;
  let loyaltyService: LoyaltyService;
  let spy:            PrismaClient;

  beforeAll(async () => {
    spy = superPrisma();
    await spy.$connect();

    const module: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = module.createNestApplication();
    app.setGlobalPrefix('api/v1');
    app.useGlobalPipes(
      new ValidationPipe({
        whitelist:            true,
        forbidNonWhitelisted: true,
        transform:            true,
        transformOptions:     { enableImplicitConversion: true },
      }),
    );
    await app.init();
    await app.listen(0);

    jwtService     = app.get(JwtService);
    loyaltyService = app.get(LoyaltyService);
  });

  afterAll(async () => {
    await app.close();
    await spy.$disconnect();
  });

  // ══════════════════════════════════════════════════════════════════════════
  // ADIM 1: SOLO Plan → 403 Forbidden (ProPlanGuard)
  // ══════════════════════════════════════════════════════════════════════════

  describe('Adım 1 — ProPlanGuard: SOLO plan → 403', () => {
    let tenantId:   string;
    let userId:     string;
    let customerId: string;
    let soloToken:  string;

    beforeAll(async () => {
      const seed = await seedLoyaltyTenant(spy, {
        slug:  `loyalty-solo-${Date.now()}`,
        email: `solo-${Date.now()}@loyalty.test`,
        plan:  'SOLO',
      });
      ({ tenantId, userId, customerId } = seed);
      soloToken = mintToken(jwtService, userId, tenantId, 'TENANT_OWNER', 'SOLO');
    });

    afterAll(async () => {
      await cleanupLoyaltyTenant(spy, tenantId);
    });

    it('GET /loyalty/customers/:id/history — SOLO plan → 403', async () => {
      const res = await request(app.getHttpServer())
        .get(`/api/v1/loyalty/customers/${customerId}/history`)
        .set('Authorization', `Bearer ${soloToken}`);

      expect(res.status).toBe(403);
      expect(res.body).toMatchObject({
        message: expect.stringContaining('Boutique'),
      });
    });

    it('POST /loyalty/redeem — SOLO plan → 403', async () => {
      const res = await request(app.getHttpServer())
        .post('/api/v1/loyalty/redeem')
        .set('Authorization', `Bearer ${soloToken}`)
        .send({ customerId, points: 10 });

      expect(res.status).toBe(403);
    });
  });

  // ══════════════════════════════════════════════════════════════════════════
  // ADIM 2: EARN İdempotency — Aynı key → Tek LoyaltyTransaction
  // ══════════════════════════════════════════════════════════════════════════

  describe('Adım 2 — Earn İdempotency (aynı appointmentId → tek kayıt)', () => {
    let tenantId:       string;
    let userId:         string;
    let customerId:     string;
    // appointmentId = null → Prisma nullable FK; test ortamında gerçek appointment kaydı gerekmez.
    // Üretimde BullMQ processor her zaman gerçek bir appointmentId gönderir.
    const appointmentId: string | null = null;
    const totalPrice    = '500'; // points = floor(500 * 0.01) = 5
    let idempotencyKey: string;

    beforeAll(async () => {
      const seed = await seedLoyaltyTenant(spy, {
        slug:  `loyalty-earn-${Date.now()}`,
        email: `earn-${Date.now()}@loyalty.test`,
        plan:  'BOUTIQUE',
      });
      ({ tenantId, userId, customerId } = seed);
      // appointmentId null olduğundan sabit bir test anahtar kullanılır
      idempotencyKey = `${tenantId}:test-earn-null-appt:LOYALTY_EARNED_APPOINTMENT:v1`;
    });

    afterAll(async () => {
      await cleanupLoyaltyTenant(spy, tenantId);
    });

    it('aynı idempotencyKey ile iki kez earnFromAppointment → tek LoyaltyTransaction', async () => {
      const payload = { tenantId, customerId, appointmentId, totalPrice, idempotencyKey };

      // İlk çağrı
      await loyaltyService.earnFromAppointment(payload);
      // İkinci çağrı (idempotent)
      await loyaltyService.earnFromAppointment(payload);

      const txCount = await spy.$queryRawUnsafe<Array<{ count: string }>>(
        `SELECT COUNT(*) AS count FROM loyalty_transactions
          WHERE "idempotencyKey" = '${idempotencyKey}'`,
      );
      expect(Number(txCount[0]?.count)).toBe(1);
    });

    it('müşteri loyaltyPoints = 5 (floor(500*0.01))', async () => {
      const rows = await spy.$queryRawUnsafe<Array<{ loyaltyPoints: number }>>(
        `SELECT "loyaltyPoints" FROM customers WHERE id = '${customerId}'`,
      );
      expect(rows[0]?.loyaltyPoints).toBe(5);
    });

    it('LoyaltyTransaction action = EARNED_APPOINTMENT, points = 5', async () => {
      const rows = await spy.$queryRawUnsafe<Array<{ action: string; points: number; "balanceAfter": number }>>(
        `SELECT action, points, "balanceAfter" FROM loyalty_transactions WHERE "tenantId" = '${tenantId}'`,
      );
      expect(rows).toHaveLength(1);
      expect(rows[0]?.action).toBe('EARNED_APPOINTMENT');
      expect(rows[0]?.points).toBe(5);
      expect(rows[0]?.balanceAfter).toBe(5);
    });
  });

  // ══════════════════════════════════════════════════════════════════════════
  // ADIM 3: Redeem Çift Tıklama → Tek Kesim
  // ══════════════════════════════════════════════════════════════════════════

  describe('Adım 3 — Redeem Çift Tıklama: aynı x-idempotency-key → tek kesim', () => {
    let tenantId:      string;
    let userId:        string;
    let customerId:    string;
    let boutiqueToken: string;
    const idemKey      = `redeem-double-${uuid()}`;
    const INITIAL_PTS  = 100;
    const REDEEM_PTS   = 30;

    beforeAll(async () => {
      const seed = await seedLoyaltyTenant(spy, {
        slug:          `loyalty-redeem-${Date.now()}`,
        email:         `redeem-${Date.now()}@loyalty.test`,
        plan:          'BOUTIQUE',
        initialPoints: INITIAL_PTS,
      });
      ({ tenantId, userId, customerId } = seed);
      boutiqueToken = mintToken(jwtService, userId, tenantId, 'TENANT_OWNER', 'BOUTIQUE');
    });

    afterAll(async () => {
      await cleanupLoyaltyTenant(spy, tenantId);
    });

    it('ilk POST /loyalty/redeem → 200 OK, tek REDEEMED kaydı', async () => {
      const res = await request(app.getHttpServer())
        .post('/api/v1/loyalty/redeem')
        .set('Authorization', `Bearer ${boutiqueToken}`)
        .set('x-idempotency-key', idemKey)
        .send({ customerId, points: REDEEM_PTS });

      expect(res.status).toBe(200);
      expect(res.body).toMatchObject({
        action:       'REDEEMED',
        points:       -REDEEM_PTS,
        balanceAfter: INITIAL_PTS - REDEEM_PTS,
      });
    });

    it('ikinci POST /loyalty/redeem (aynı key) → 200 OK, çift kesim YOK', async () => {
      const res = await request(app.getHttpServer())
        .post('/api/v1/loyalty/redeem')
        .set('Authorization', `Bearer ${boutiqueToken}`)
        .set('x-idempotency-key', idemKey)
        .send({ customerId, points: REDEEM_PTS });

      // LoyaltyService pre-check: mevcut kaydı döndürür → 200 (idempotent response)
      expect(res.status).toBe(200);
      // Aynı LoyaltyTransaction döner (aynı id, aynı points)
      expect(res.body).toMatchObject({
        action:       'REDEEMED',
        points:       -REDEEM_PTS,
        balanceAfter: INITIAL_PTS - REDEEM_PTS,
      });
    });

    it('loyalty_transactions: tam olarak 1 REDEEMED kaydı var', async () => {
      const rows = await spy.$queryRawUnsafe<Array<{ count: string }>>(
        `SELECT COUNT(*) AS count FROM loyalty_transactions
          WHERE "tenantId" = '${tenantId}' AND action = 'REDEEMED'`,
      );
      expect(Number(rows[0]?.count)).toBe(1);
    });

    it('müşteri bakiyesi: başlangıç (100) - bir kesim (30) = 70', async () => {
      const rows = await spy.$queryRawUnsafe<Array<{ loyaltyPoints: number }>>(
        `SELECT "loyaltyPoints" FROM customers WHERE id = '${customerId}'`,
      );
      expect(rows[0]?.loyaltyPoints).toBe(INITIAL_PTS - REDEEM_PTS);
    });
  });

  // ══════════════════════════════════════════════════════════════════════════
  // ADIM 4: Yetersiz Bakiye → 400 Bad Request
  // ══════════════════════════════════════════════════════════════════════════

  describe('Adım 4 — Yetersiz Bakiye → 400', () => {
    let tenantId:      string;
    let userId:        string;
    let customerId:    string;
    let boutiqueToken: string;

    beforeAll(async () => {
      const seed = await seedLoyaltyTenant(spy, {
        slug:          `loyalty-insuf-${Date.now()}`,
        email:         `insuf-${Date.now()}@loyalty.test`,
        plan:          'BOUTIQUE',
        initialPoints: 10,
      });
      ({ tenantId, userId, customerId } = seed);
      boutiqueToken = mintToken(jwtService, userId, tenantId, 'TENANT_OWNER', 'BOUTIQUE');
    });

    afterAll(async () => {
      await cleanupLoyaltyTenant(spy, tenantId);
    });

    it('bakiye(10) < talep(50) → 400 Bad Request', async () => {
      const res = await request(app.getHttpServer())
        .post('/api/v1/loyalty/redeem')
        .set('Authorization', `Bearer ${boutiqueToken}`)
        .set('x-idempotency-key', `insuf-${uuid()}`)
        .send({ customerId, points: 50 });

      expect(res.status).toBe(400);
      expect(res.body.message).toMatch(/Yetersiz puan/i);
    });
  });

  // ══════════════════════════════════════════════════════════════════════════
  // ADIM 5: GET /loyalty/customers/:id/history — Bakiye + Sayfalı Hareketler
  // ══════════════════════════════════════════════════════════════════════════

  describe('Adım 5 — GET /loyalty/customers/:id/history', () => {
    let tenantId:      string;
    let userId:        string;
    let customerId:    string;
    let boutiqueToken: string;

    beforeAll(async () => {
      const seed = await seedLoyaltyTenant(spy, {
        slug:  `loyalty-hist-${Date.now()}`,
        email: `hist-${Date.now()}@loyalty.test`,
        plan:  'BOUTIQUE',
      });
      ({ tenantId, userId, customerId } = seed);
      boutiqueToken = mintToken(jwtService, userId, tenantId, 'TENANT_OWNER', 'BOUTIQUE');

      // 3 earn işlemi yap (farklı idempotencyKey, appointmentId=null — test ortamı)
      for (let i = 0; i < 3; i++) {
        await loyaltyService.earnFromAppointment({
          tenantId,
          customerId,
          appointmentId:  null,
          totalPrice:     '200',
          idempotencyKey: `${tenantId}:hist-appt-${i}:LOYALTY_EARNED_APPOINTMENT:v1`,
        });
      }
    });

    afterAll(async () => {
      await cleanupLoyaltyTenant(spy, tenantId);
    });

    it('200 OK — balance, total, items döner', async () => {
      const res = await request(app.getHttpServer())
        .get(`/api/v1/loyalty/customers/${customerId}/history`)
        .set('Authorization', `Bearer ${boutiqueToken}`);

      expect(res.status).toBe(200);
      expect(res.body).toMatchObject({
        balance: 6,   // floor(200*0.01) * 3 = 6
        total:   3,
      });
      expect(Array.isArray(res.body.items)).toBe(true);
      expect(res.body.items).toHaveLength(3);
    });

    it('?page=1&pageSize=2 → 2 item, total=3', async () => {
      const res = await request(app.getHttpServer())
        .get(`/api/v1/loyalty/customers/${customerId}/history?page=1&pageSize=2`)
        .set('Authorization', `Bearer ${boutiqueToken}`);

      expect(res.status).toBe(200);
      expect(res.body.items).toHaveLength(2);
      expect(res.body.total).toBe(3);
    });

    it('yabancı customerId (başka tenant) → 404', async () => {
      const foreignCustomer = uuid(); // seed edilmemiş
      const res = await request(app.getHttpServer())
        .get(`/api/v1/loyalty/customers/${foreignCustomer}/history`)
        .set('Authorization', `Bearer ${boutiqueToken}`);

      expect(res.status).toBe(404);
    });
  });
});
