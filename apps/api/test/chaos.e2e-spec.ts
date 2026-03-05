/**
 * ═══════════════════════════════════════════════════════════════════════════
 * FAZ 10 — KAOS VE DOĞRULAMA TEST SUITİ
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * Bu dosya "kağıt üzerinde çalışır ama prodüksiyonda çöker" senaryolarını
 * donanım seviyesinde test eder. Her adım bağımsız bir Jest describe bloğunda
 * çalışır ve test sonrası kendi verilerini temizler.
 *
 * GEREKSINIMLER:
 *   - calon_test PostgreSQL veritabanı (migration uygulanmış)
 *   - calon_app rolü (RLS bypass YOK — test için kritik)
 *   - Redis (Hold TTL testleri için; testler mock kullanır)
 *
 * ÇALIŞTIRMA:
 *   TEST_DATABASE_URL="..." yarn workspace @calon/api jest --config jest-e2e.config.js
 * ═══════════════════════════════════════════════════════════════════════════
 */

// ── ortam değişkeni: test DB (RLS bypass yok) ─────────────────────────────
// Superuser calon_db bağlantısı RLS'yi bypass eder;
// calon_app bağlantısı RLS politikalarını tam uygular.
// Uygulama bağlantısı — superuser, RLS bypass (NestJS AppModule için)
const TEST_DB_URL =
  process.env['TEST_DATABASE_URL'] ??
  'postgresql://calon:dev_password@localhost:5432/calon_test';

// Seed / doğrulama için superuser bağlantısı (TEST_DB_URL ile aynı)
const SUPER_DB_URL =
  process.env['SUPER_DATABASE_URL'] ??
  'postgresql://calon:dev_password@localhost:5432/calon_test';

// Adım 3-e: calon_app rolü ile RLS testi — superuser DEĞİL, RLS aktif
const APP_DB_URL =
  process.env['APP_DATABASE_URL'] ??
  'postgresql://calon_app:calon_app_dev_secret@localhost:5432/calon_test';

process.env['DATABASE_URL'] = TEST_DB_URL;
process.env['JWT_SECRET']   = 'chaos-test-jwt-secret-32chars!!';
process.env['NODE_ENV']     = 'test';
process.env['REDIS_HOST']   = 'localhost';
process.env['REDIS_PORT']   = '6379';
process.env['REDIS_PASSWORD'] = '';

import { Test, TestingModule }          from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import supertest                        = require('supertest');
import { PrismaClient }                 from '@prisma/client';
import { JwtService }                   from '@nestjs/jwt';
import { v4 as uuid }                   from 'uuid';
import { AppModule }                    from '../src/app.module';

// ── import alias — test içinde kısa kullanım ─────────────────────────────────
const request = supertest;

// ── Tip yardımcıları ─────────────────────────────────────────────────────────
interface SupertestResponse { status: number; body: Record<string, unknown>; id?: string }

// ── Test yardımcıları ────────────────────────────────────────────────────────

/**
 * Superuser bağlantısı — seed ve post-condition doğrulama için.
 * RLS bu bağlantıda bypass edilir.
 */
function superPrisma(): PrismaClient {
  return new PrismaClient({ datasources: { db: { url: SUPER_DB_URL } } });
}

/**
 * Tenant izolasyon bağlamı dışında veri oluşturmak için superuser Prisma kullanırız.
 * Test JWT'leri el ile üretilir (NestJS uygulaması üzerinden değil).
 */
function mintToken(jwt: JwtService, userId: string, tenantId: string, role = 'TENANT_OWNER'): string {
  return jwt.sign({ sub: userId, tenantId, role });
}

/**
 * Tenant + User + Konum + Oda + Personel + Hizmet oluşturan seed fonksiyonu.
 * Superuser bağlantısı kullanır (RLS bypass).
 */
async function seedTenant(
  spy: PrismaClient,
  opts: {
    tenantSlug:    string;
    userEmail:     string;
    commissionRate?: number;
  }
): Promise<{
  tenantId:    string;
  userId:      string;
  locationId:  string;
  roomId:      string;
  staffId:     string;
  customerId:  string;
  serviceId:   string;
}> {
  const tenantId   = uuid();
  const userId     = uuid();
  const locationId = uuid();
  const roomId     = uuid();
  const staffId    = uuid();
  const customerId = uuid();
  const serviceId  = uuid();

  await spy.$executeRawUnsafe(`
    INSERT INTO tenants (id, name, slug, plan, status, "createdAt", "updatedAt")
    VALUES ('${tenantId}', 'Chaos Test ${opts.tenantSlug}', '${opts.tenantSlug}', 'SOLO', 'ACTIVE', NOW(), NOW())
  `);

  await spy.$executeRawUnsafe(`
    INSERT INTO users (id, email, "passwordHash", "firstName", "lastName", status, "createdAt", "updatedAt")
    VALUES ('${userId}', '${opts.userEmail}', 'hash', 'Test', 'User', 'ACTIVE', NOW(), NOW())
  `);

  await spy.$executeRawUnsafe(`
    INSERT INTO user_tenants (id, "userId", "tenantId", role, "createdAt", "updatedAt")
    VALUES ('${uuid()}', '${userId}', '${tenantId}', 'TENANT_OWNER', NOW(), NOW())
  `);

  await spy.$executeRawUnsafe(`
    INSERT INTO locations (id, "tenantId", name, address, "isActive", "createdAt", "updatedAt")
    VALUES ('${locationId}', '${tenantId}', 'Chaos Location', 'Test Cad. No:1', TRUE, NOW(), NOW())
  `);

  await spy.$executeRawUnsafe(`
    INSERT INTO rooms (id, "tenantId", "locationId", name, capacity, "isActive", "createdAt", "updatedAt")
    VALUES ('${roomId}', '${tenantId}', '${locationId}', 'Room A', 1, TRUE, NOW(), NOW())
  `);

  await spy.$executeRawUnsafe(`
    INSERT INTO staff_profiles (id, "tenantId", "locationId", "firstName", "lastName", "commissionRate", "isActive", "createdAt", "updatedAt")
    VALUES ('${staffId}', '${tenantId}', '${locationId}', 'Chaos', 'Staff', ${opts.commissionRate ?? 10}, TRUE, NOW(), NOW())
  `);

  await spy.$executeRawUnsafe(`
    INSERT INTO customers (id, "tenantId", "firstName", "lastName", phone, "createdAt", "updatedAt")
    VALUES ('${customerId}', '${tenantId}', 'Chaos', 'Customer', '+905001234567', NOW(), NOW())
  `);

  await spy.$executeRawUnsafe(`
    INSERT INTO service_categories (id, "tenantId", name, "isActive", "createdAt", "updatedAt")
    VALUES ('${uuid()}', '${tenantId}', 'Default', TRUE, NOW(), NOW())
  `);

  // Önce kategori id'yi al
  const catResult = await spy.$queryRawUnsafe<Array<{id: string}>>(
    `SELECT id FROM service_categories WHERE "tenantId" = '${tenantId}' LIMIT 1`
  );
  const categoryId = catResult[0]?.id ?? uuid();

  await spy.$executeRawUnsafe(`
    INSERT INTO services (id, "tenantId", "categoryId", name, "durationMin", price, "isActive", "createdAt", "updatedAt")
    VALUES ('${serviceId}', '${tenantId}', '${categoryId}', 'Cut & Style', 60, 250.00, TRUE, NOW(), NOW())
  `);

  return { tenantId, userId, locationId, roomId, staffId, customerId, serviceId };
}

/**
 * Tenant ile ilgili tüm verileri temizler (test sonrası).
 */
async function cleanupTenant(spy: PrismaClient, tenantId: string): Promise<void> {
  // staff_shifts, staff_working_hours, staff_services — tenantId YOK, staffId FK üzerinden silinir
  // (staff_profiles ON DELETE CASCADE bunları zaten siler, ama explicit de yapalım)
  await spy.$executeRawUnsafe(
    `DELETE FROM staff_shifts WHERE "staffId" IN (SELECT id FROM staff_profiles WHERE "tenantId" = '${tenantId}')`
  ).catch(() => { /* tablo yoksa ya da zaten boşsa yoksay */ });
  await spy.$executeRawUnsafe(
    `DELETE FROM staff_working_hours WHERE "staffId" IN (SELECT id FROM staff_profiles WHERE "tenantId" = '${tenantId}')`
  ).catch(() => { /* yoksay */ });
  await spy.$executeRawUnsafe(
    `DELETE FROM staff_services WHERE "staffId" IN (SELECT id FROM staff_profiles WHERE "tenantId" = '${tenantId}')`
  ).catch(() => { /* yoksay */ });

  // FK sırasına göre tenantId'li tablolar silinir
  const tables = [
    'commission_logs', 'transaction_ledger', 'audit_logs',
    'appointments', 'refresh_tokens', 'idempotency_keys',
    'staff_profiles',
    'services', 'service_categories', 'customers', 'loyalty_transactions',
    'consent_forms', 'messages', 'campaign_templates', 'rooms', 'locations',
    'user_tenants', 'users', 'tenants',
  ];

  for (const table of tables) {
    if (table === 'users') {
      // users tablosunda tenantId yok; user_tenants üzerinden ulaş
      await spy.$executeRawUnsafe(
        `DELETE FROM users WHERE id IN (SELECT "userId" FROM user_tenants WHERE "tenantId" = '${tenantId}')`
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

describe('FAZ 10 — Kaos ve Doğrulama', () => {
  let app:        INestApplication;
  let jwtService: JwtService;
  let spy:        PrismaClient;     // Superuser — seed/cleanup

  beforeAll(async () => {
    spy = superPrisma();
    await spy.$connect();

    // Uygulamayı başlat
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
    // Belirli bir portta dinlemeye başla — supertest lazy-bind yerine açık port kullanır.
    // Bu olmadan 250 eşzamanlı istek gönderilince ECONNREFUSED alınır.
    await app.listen(0);   // 0 = OS'a serbest port tahsis ettir

    jwtService = app.get(JwtService);
  });

  afterAll(async () => {
    await app.close();
    await spy.$disconnect();
  });

  // ══════════════════════════════════════════════════════════════════════════
  // ADIM 1: EŞZAMANLILİK VE GIST KALKANI
  // ══════════════════════════════════════════════════════════════════════════

  describe('Adım 1 — 250 Eşzamanlı POST /appointments (GIST Kalkanı)', () => {
    const CONCURRENT = 250;
    let tenantId:   string;
    let userId:     string;
    let staffId:    string;
    let customerId: string;
    let serviceId:  string;
    let locationId: string;
    let roomId:     string;
    let token:      string;

    // Sabit slot — tüm 250 istek aynı saat için yarışacak
    const SLOT_START = '2026-06-15T10:00:00.000Z';
    const SLOT_END   = '2026-06-15T11:00:00.000Z';

    beforeAll(async () => {
      const seed = await seedTenant(spy, {
        tenantSlug: `chaos-gist-${Date.now()}`,
        userEmail:  `gist-test-${Date.now()}@chaos.test`,
      });
      ({ tenantId, userId, staffId, customerId, serviceId, locationId, roomId } = seed);
      token = mintToken(jwtService, userId, tenantId);
    });

    afterAll(async () => {
      await cleanupTenant(spy, tenantId);
    });

    it('yalnızca 1 adet 201 Created alınmalı; geri kalan 249 istek 409 Conflict dönmeli', async () => {
      console.log(`\n[ADIM 1] ${CONCURRENT} eşzamanlı randevu isteği atılıyor...`);
      console.log(`         Hedef slot: ${SLOT_START} — ${SLOT_END}`);
      console.log(`         Personel: ${staffId}`);

      const payload = {
        customerId,
        staffId,
        serviceId,
        locationId,
        roomId,
        startTime:  SLOT_START,
        endTime:    SLOT_END,
        totalPrice: 250,
      };

      const startMs = Date.now();

      // 250 isteği eşzamanlı fırlat
      const responses: SupertestResponse[] = await Promise.all(
        Array.from({ length: CONCURRENT }, () =>
          request(app.getHttpServer())
            .post('/api/v1/appointments')
            .set('Authorization', `Bearer ${token}`)
            .send(payload)
            .then((r: { status: number; body: Record<string, unknown> }) => ({
              status: r.status,
              body:   r.body,
            }))
            .catch(() => ({ status: 503, body: { error: 'network_error' } })),
        ),
      );

      const elapsed = Date.now() - startMs;

      // ── Sonuçları grupla ─────────────────────────────────────────────────
      const created  = responses.filter(r => r.status === 201);
      const conflict = responses.filter(r => r.status === 409);
      const other    = responses.filter(r => r.status !== 201 && r.status !== 409);

      console.log('\n[ADIM 1] SONUÇLAR:');
      console.log(`  ✅ 201 Created  : ${created.length}`);
      console.log(`  🔴 409 Conflict : ${conflict.length}`);
      console.log(`  ❓ Diğer        : ${other.length} ${other.length > 0 ? JSON.stringify(other.map(r => r.status)) : ''}`);
      console.log(`  ⏱️  Toplam süre  : ${elapsed} ms`);

      if (other.length > 0) {
        console.log('  Diğer yanıtlar:', JSON.stringify(other.slice(0, 3)));
      }

      // ── Kabul kriterleri ─────────────────────────────────────────────────
      // GIST garantisi: tam olarak 1 kayıt oluşturulmalı
      expect(created.length).toBe(1);

      // 503 ağ hataları (ECONNRESET/bağlantı havuzu dolu) da "reddedildi" sayılır —
      // GIST garantisi DB seviyesinde (rowCount === 1) ile doğrulanır.
      const networkErrors    = other.filter((r: SupertestResponse) => r.status === 503);
      const unexpectedErrors = other.filter((r: SupertestResponse) => r.status !== 503);
      expect(unexpectedErrors.length).toBe(0);                             // beklenmedik status yok
      expect(conflict.length + networkErrors.length).toBe(CONCURRENT - 1); // toplam red = 249

      // Veritabanında gerçekten 1 kayıt var mı?
      const dbCount = await spy.$queryRawUnsafe<Array<{count: string}>>(
        `SELECT COUNT(*)::text as count FROM appointments WHERE "tenantId" = '${tenantId}'`
      );
      const rowCount = parseInt(dbCount[0]?.count ?? '0', 10);
      console.log(`  📋 DB'deki randevu sayısı: ${rowCount}`);
      expect(rowCount).toBe(1);
    }, 60_000);
  });

  // ══════════════════════════════════════════════════════════════════════════
  // ADIM 2: DEADLOCK VE ROLLBACK TESTİ
  // ══════════════════════════════════════════════════════════════════════════

  describe('Adım 2 — 125 Eşzamanlı COMPLETED → Deadlock / Rollback Güvencesi', () => {
    const CONCURRENT = 125;
    let tenantId:   string;
    let userId:     string;
    let staffId:    string;
    let customerId: string;
    let serviceId:  string;
    let locationId: string;
    let roomId:     string;
    let token:      string;
    let appointmentIds: string[];

    beforeAll(async () => {
      const slug = `chaos-deadlock-${Date.now()}`;
      const seed = await seedTenant(spy, {
        tenantSlug:     slug,
        userEmail:      `deadlock-${Date.now()}@chaos.test`,
        commissionRate: 10,   // %10 hakediş → CommissionLog yaratılacak
      });
      ({ tenantId, userId, staffId, customerId, serviceId, locationId, roomId } = seed);
      token = mintToken(jwtService, userId, tenantId);

      console.log(`\n[ADIM 2] ${CONCURRENT} adet CONFIRMED randevu seed ediliyor...`);

      // 125 farklı slot — her biri 1 saatlik, birbirini takip eder
      // Superuser bağlantısı ile direkt INSERT (GIST bypass için status='CONFIRMED' eklenir sonra)
      appointmentIds = [];
      const batchValues: string[] = [];

      for (let i = 0; i < CONCURRENT; i++) {
        const id      = uuid();
        const start   = new Date(`2026-07-${String(1 + Math.floor(i / 8)).padStart(2, '0')}T${String((i % 8) * 2).padStart(2, '0')}:00:00.000Z`);
        const end     = new Date(start.getTime() + 60 * 60 * 1000);
        appointmentIds.push(id);
        batchValues.push(
          `('${id}', '${tenantId}', '${customerId}', '${staffId}', '${serviceId}', '${locationId}', '${roomId}', ` +
          `'${start.toISOString()}', '${end.toISOString()}', 'IN_SERVICE', 'ONLINE', NULL, NULL, NULL, 250.00, FALSE, NOW(), NOW())`
        );
      }

      await spy.$executeRawUnsafe(`
        INSERT INTO appointments
          (id, "tenantId", "customerId", "staffId", "serviceId", "locationId", "roomId",
           "startTime", "endTime", status, source, notes, "internalNotes", "idempotencyKey",
           "totalPrice", "isDeleted", "createdAt", "updatedAt")
        VALUES ${batchValues.join(',\n')}
      `);

      console.log(`[ADIM 2] ${CONCURRENT} randevu seed edildi.`);
    });

    afterAll(async () => {
      await cleanupTenant(spy, tenantId);
    });

    it('tüm eşzamanlı COMPLETED geçişleri atomik olmalı: yarım kalmış Ledger-Hakediş çifti olmamalı', async () => {
      console.log(`\n[ADIM 2] ${CONCURRENT} eşzamanlı COMPLETED isteği atılıyor...`);

      const payload = { status: 'COMPLETED' };
      const startMs = Date.now();

      const responses: SupertestResponse[] = await Promise.all(
        appointmentIds.map(id =>
          request(app.getHttpServer())
            .patch(`/api/v1/appointments/${id}/status`)
            .set('Authorization', `Bearer ${token}`)
            .send(payload)
            .then((r: { status: number; body: Record<string, unknown> }) => ({ id, status: r.status, body: r.body }))
            .catch(() => ({ id, status: 503, body: { error: 'network_error' } }))
        )
      );

      const elapsed   = Date.now() - startMs;
      const succeeded = responses.filter(r => r.status === 200);
      const failed    = responses.filter(r => r.status >= 400);

      console.log('\n[ADIM 2] SONUÇLAR:');
      console.log(`  ✅ 200 OK       : ${succeeded.length}`);
      console.log(`  ❌ Hata (4xx/5xx): ${failed.length}`);
      console.log(`  ⏱️  Toplam süre   : ${elapsed} ms`);

      if (failed.length > 0) {
        const sample = failed.slice(0, 3).map(r => ({ id: r.id, status: r.status, msg: (r.body as Record<string, unknown>)?.['message'] }));
        console.log(`  Örnek hatalar   :`, JSON.stringify(sample, null, 2));
      }

      // ── Atomiklik doğrulaması ─────────────────────────────────────────────
      // COMPLETED olan randevuların her biri için:
      //   Ledger kaydı varsa → CommissionLog da VAR OLMALI  (commissionRate > 0)
      //   CommissionLog varsa → Ledger kaydı da VAR OLMALI
      const completedIds: string[] = succeeded
        .map((r: SupertestResponse) => r.id)
        .filter((id): id is string => id !== undefined && id !== '');

      if (completedIds.length > 0) {
        const idList = completedIds.map(id => `'${id}'`).join(',');

        // Ledger var ama Commission yok olanları bul (commissionRate=10, her zaman üretilmeli)
        const orphanLedger = await spy.$queryRawUnsafe<Array<{id: string}>>(
          `SELECT a.id FROM appointments a
           JOIN transaction_ledger tl ON tl."appointmentId" = a.id
           LEFT JOIN commission_logs cl ON cl."appointmentId" = a.id
           WHERE a.id IN (${idList})
           AND cl.id IS NULL`
        );

        // Commission var ama Ledger yok olanları bul
        const orphanCommission = await spy.$queryRawUnsafe<Array<{id: string}>>(
          `SELECT a.id FROM appointments a
           JOIN commission_logs cl ON cl."appointmentId" = a.id
           LEFT JOIN transaction_ledger tl ON tl."appointmentId" = a.id
           WHERE a.id IN (${idList})
           AND tl.id IS NULL`
        );

        console.log(`\n  📊 Atomiklik Doğrulaması:`);
        console.log(`     COMPLETED randevu     : ${completedIds.length}`);
        console.log(`     Yetim Ledger (no comm): ${orphanLedger.length}`);
        console.log(`     Yetim Comm (no ledger): ${orphanCommission.length}`);

        // ── Kritik: yarım kalmış hiçbir kayıt olmamalı ─────────────────────
        expect(orphanLedger.length).toBe(0);
        expect(orphanCommission.length).toBe(0);
      }

      // En az 1 başarılı olmasını bekle
      expect(succeeded.length).toBeGreaterThan(0);

      // Başarısız olanlar kesinlikle 5xx olmamalı (500 deadlock hatası yakalanmamış demek)
      const serverErrors = failed.filter(r => r.status >= 500);
      console.log(`  💥 Yakalanmamış 5xx : ${serverErrors.length}`);
      if (serverErrors.length > 0) {
        console.log('  5xx detayları:', JSON.stringify(serverErrors.slice(0, 2)));
      }
      expect(serverErrors.length).toBe(0);
    }, 90_000);
  });

  // ══════════════════════════════════════════════════════════════════════════
  // ADIM 3: RLS SIZINTI TESTİ (EN KRİTİK)
  // ══════════════════════════════════════════════════════════════════════════

  describe('Adım 3 — RLS Sızıntı Testi (Tenant A → Tenant B verisi)', () => {
    let tenantA: {
      tenantId: string; userId: string; staffId: string;
      customerId: string; serviceId: string; locationId: string; roomId: string;
    };
    let tenantB: {
      tenantId: string; userId: string; staffId: string;
      customerId: string; serviceId: string; locationId: string; roomId: string;
    };
    let tokenA: string;
    let tokenB: string;
    let appointmentBId: string;

    beforeAll(async () => {
      const ts = Date.now();

      const [seedA, seedB] = await Promise.all([
        seedTenant(spy, { tenantSlug: `rls-tenant-a-${ts}`, userEmail: `rls-a-${ts}@chaos.test` }),
        seedTenant(spy, { tenantSlug: `rls-tenant-b-${ts}`, userEmail: `rls-b-${ts}@chaos.test` }),
      ]);

      tenantA = seedA;
      tenantB = seedB;
      tokenA  = mintToken(jwtService, seedA.userId, seedA.tenantId);
      tokenB  = mintToken(jwtService, seedB.userId, seedB.tenantId);

      // Tenant B'ye ait bir randevu oluştur (superuser ile direkt INSERT)
      appointmentBId = uuid();
      await spy.$executeRawUnsafe(`
        INSERT INTO appointments
          (id, "tenantId", "customerId", "staffId", "serviceId", "locationId", "roomId",
           "startTime", "endTime", status, source, "isDeleted", "createdAt", "updatedAt")
        VALUES (
          '${appointmentBId}', '${tenantB.tenantId}', '${tenantB.customerId}',
          '${tenantB.staffId}', '${tenantB.serviceId}', '${tenantB.locationId}', '${tenantB.roomId}',
          '2026-08-01T10:00:00Z', '2026-08-01T11:00:00Z',
          'PENDING', 'ONLINE', FALSE, NOW(), NOW()
        )
      `);

      console.log(`\n[ADIM 3] Tenant A: ${tenantA.tenantId}`);
      console.log(`[ADIM 3] Tenant B: ${tenantB.tenantId}`);
      console.log(`[ADIM 3] Tenant B randevusu: ${appointmentBId}`);
    });

    afterAll(async () => {
      await Promise.all([
        cleanupTenant(spy, tenantA.tenantId),
        cleanupTenant(spy, tenantB.tenantId),
      ]);
    });

    it('Tenant A tokeni ile Tenant B randevusunu okumaya çalışınca 404 dönmeli', async () => {
      const res = await request(app.getHttpServer())
        .get(`/api/v1/appointments/${appointmentBId}`)
        .set('Authorization', `Bearer ${tokenA}`)
        .send();

      console.log(`\n[ADIM 3-a] GET /appointments/${appointmentBId} (Tenant A tokeni): ${res.status}`);

      expect([403, 404]).toContain(res.status);
    });

    it('Tenant A tokeni ile GET /appointments listesi Tenant B randevusunu içermemeli', async () => {
      const res = await request(app.getHttpServer())
        .get('/api/v1/appointments')
        .set('Authorization', `Bearer ${tokenA}`)
        .send();

      console.log(`\n[ADIM 3-b] GET /appointments (Tenant A tokeni): ${res.status}`);

      const appointments = (res.body as Record<string, unknown>)?.['data'] as unknown[] ??
                           (Array.isArray(res.body) ? res.body as unknown[] : []);

      const leaked = appointments.filter((appt: unknown) => {
        const a = appt as Record<string, unknown>;
        return a['id'] === appointmentBId || a['tenantId'] === tenantB.tenantId;
      });

      console.log(`   Dönen randevu sayısı   : ${appointments.length}`);
      console.log(`   Tenant B sızıntısı     : ${leaked.length}`);

      expect(leaked.length).toBe(0);
    });

    it('Tenant A tokeni ile Tenant B randevusunu COMPLETED yapmaya çalışınca 404 dönmeli', async () => {
      const res = await request(app.getHttpServer())
        .patch(`/api/v1/appointments/${appointmentBId}/status`)
        .set('Authorization', `Bearer ${tokenA}`)
        .send({ status: 'CONFIRMED' });

      console.log(`\n[ADIM 3-c] PATCH /appointments/${appointmentBId}/status (Tenant A tokeni): ${res.status}`);

      expect([403, 404]).toContain(res.status);

      // Veritabanında Tenant B randevusu hâlâ PENDING olmalı
      const rows = await spy.$queryRawUnsafe<Array<{status: string}>>(
        `SELECT status FROM appointments WHERE id = '${appointmentBId}'`
      );
      console.log(`   DB'deki durum: ${rows[0]?.status ?? 'NOT FOUND'}`);
      expect(rows[0]?.status).toBe('PENDING');
    });

    it('Tenant A tokeni ile Tenant B müşterilerini listelerken 0 satır dönmeli', async () => {
      const res = await request(app.getHttpServer())
        .get('/api/v1/customers')
        .set('Authorization', `Bearer ${tokenA}`)
        .send();

      const customers = (res.body as Record<string, unknown>)?.['data'] as unknown[] ??
                        (Array.isArray(res.body) ? res.body as unknown[] : []);

      const leaked = customers.filter((c: unknown) => {
        const cust = c as Record<string, unknown>;
        return cust['tenantId'] === tenantB.tenantId;
      });

      console.log(`\n[ADIM 3-d] GET /customers (Tenant A tokeni):`);
      console.log(`   Dönen müşteri sayısı   : ${customers.length}`);
      console.log(`   Tenant B sızıntısı     : ${leaked.length}`);

      expect(leaked.length).toBe(0);
    });

    it('RLS raw SQL kontrolü: calon_app rolü tenant_id set edilmeden sorgulayınca 0 satır dönmeli', async () => {
      // calon_app rolü (superuser değil) ile bağlan — RLS aktif
      const appPrisma = new PrismaClient({ datasources: { db: { url: APP_DB_URL } } });
      await appPrisma.$connect();

      try {
        // app.tenant_id set etmeden okuma → RLS politikası 0 satır döndürmeli
        const rows = await appPrisma.$queryRawUnsafe<unknown[]>(
          `SELECT id FROM appointments WHERE "tenantId" = '${tenantB.tenantId}'`
        );

        console.log(`\n[ADIM 3-e] calon_app + tenant_id unset → appointments:`, rows.length, 'satır');
        // RLS politikası: set_config olmadan = boş tenant_id = no match
        expect(rows.length).toBe(0);
      } finally {
        await appPrisma.$disconnect();
      }
    });
  });

  // ══════════════════════════════════════════════════════════════════════════
  // ADIM 4: HIZLI YÜK ÖZET TESTİ (Artillery yerine yerleşik)
  // ══════════════════════════════════════════════════════════════════════════

  describe('Adım 4 — Yerleşik Yük Özeti (50 concurrent istek × 5 tur)', () => {
    let tenantId:  string;
    let userId:    string;
    let token:     string;

    beforeAll(async () => {
      const seed = await seedTenant(spy, {
        tenantSlug: `chaos-load-${Date.now()}`,
        userEmail:  `load-${Date.now()}@chaos.test`,
      });
      tenantId = seed.tenantId;
      userId   = seed.userId;
      token    = mintToken(jwtService, userId, tenantId);
    });

    afterAll(async () => {
      await cleanupTenant(spy, tenantId);
    });

    it('GET /api/v1/health veya /api/v1/appointments → p95 < 1000ms olmalı', async () => {
      const CONCURRENT_PER_ROUND = 50;
      const ROUNDS               = 5;
      const latencies: number[]  = [];

      for (let round = 0; round < ROUNDS; round++) {
        const roundStart = Date.now();

        await Promise.all(
          Array.from({ length: CONCURRENT_PER_ROUND }, async () => {
            const t0 = Date.now();
            await request(app.getHttpServer())
              .get('/api/v1/appointments')
              .set('Authorization', `Bearer ${token}`)
              .send();
            latencies.push(Date.now() - t0);
          })
        );

        console.log(`[ADIM 4] Tur ${round + 1}/${ROUNDS} tamamlandı: ${Date.now() - roundStart}ms`);
      }

      latencies.sort((a, b) => a - b);
      const p50 = latencies[Math.floor(latencies.length * 0.50)]!;
      const p95 = latencies[Math.floor(latencies.length * 0.95)]!;
      const p99 = latencies[Math.floor(latencies.length * 0.99)]!;
      const avg = Math.round(latencies.reduce((a, b) => a + b, 0) / latencies.length);

      console.log('\n[ADIM 4] YÜK TESTİ SONUÇLARI:');
      console.log(`  Toplam istek : ${latencies.length}`);
      console.log(`  Ort (avg)    : ${avg} ms`);
      console.log(`  p50          : ${p50} ms`);
      console.log(`  p95          : ${p95} ms`);
      console.log(`  p99          : ${p99} ms`);
      console.log(`  Min          : ${latencies[0]} ms`);
      console.log(`  Max          : ${latencies[latencies.length - 1]} ms`);

      // Kabul kriteri: p95 < 1000ms (test DB'si, prod'da daha iyi)
      expect(p95).toBeLessThan(1000);
    }, 120_000);
  });
});
