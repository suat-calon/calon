/**
 * SEED 200 TENANTS — K6 Yük Testi Ön Hazırlık
 * ──────────────────────────────────────────────────────────────────────────────
 * Geliştirme veritabanına 200 adet tenant + kullanıcı + billing kaydı oluşturur.
 * JWT token'larını test/fixtures/tenants.json'a yazar.
 * K6 soak testi bu fixture'ı kullanır.
 *
 * Çalıştır: npx ts-node -r tsconfig-paths/register test/seed-200-tenants.ts
 * ──────────────────────────────────────────────────────────────────────────────
 */

import { PrismaClient }  from '@prisma/client';
import * as jwt          from 'jsonwebtoken';
import * as fs           from 'fs';
import * as path         from 'path';
import * as crypto       from 'crypto';

const prisma = new PrismaClient({
  datasources: {
    db: { url: process.env['DATABASE_URL'] ?? 'postgresql://auralis_app:auralis_app_dev_secret@localhost:5432/auralis_dev?schema=public' },
  },
});

const JWT_SECRET = process.env['JWT_SECRET'] ?? 'CHANGE_THIS_TO_A_STRONG_RANDOM_SECRET_IN_PRODUCTION';
const TENANT_COUNT = 200;

interface TenantFixture {
  tenantId:  string;
  userId:    string;
  token:     string;
  plan:      string;
}

async function main(): Promise<void> {
  console.log(`[Seed] ${TENANT_COUNT} tenant oluşturuluyor...`);
  const fixtures: TenantFixture[] = [];

  for (let i = 1; i <= TENANT_COUNT; i++) {
    const tenantName = `LoadTest Tenant ${i}`;
    const email      = `loadtest${i}@auralis-soak.test`;
    const plan       = (['SOLO', 'BOUTIQUE', 'ENTERPRISE'] as const)[i % 3];

    // Tenant upsert (idempotent)
    const tenant = await prisma.tenant.upsert({
      where:  { name: tenantName },
      update: {},
      create: {
        name:   tenantName,
        plan,
        status: 'ACTIVE',
      },
    });

    // User upsert
    const user = await prisma.user.upsert({
      where:  { email },
      update: {},
      create: {
        tenantId:     tenant.id,
        email,
        passwordHash: crypto.randomBytes(32).toString('hex'), // dummy
        role:         'OWNER',
      },
    });

    // Billing upsert
    await prisma.tenantBilling.upsert({
      where:  { tenantId: tenant.id },
      update: { status: 'ACTIVE', plan },
      create: {
        tenantId: tenant.id,
        plan,
        status:   'ACTIVE',
        cycle:    'MONTHLY',
      },
    });

    // UsagePeriod (aktif dönem)
    const now       = new Date();
    const periodEnd = new Date(now.getFullYear(), now.getMonth() + 1, 1);
    await prisma.usagePeriod.upsert({
      where:  { tenantId_periodStart: { tenantId: tenant.id, periodStart: now } },
      update: {},
      create: {
        tenantId:    tenant.id,
        periodStart: now,
        periodEnd,
      },
    });

    // JWT token (plan claim ile)
    const token = jwt.sign(
      { sub: user.id, tenantId: tenant.id, role: user.role, plan },
      JWT_SECRET,
      { expiresIn: '24h' },
    );

    fixtures.push({ tenantId: tenant.id, userId: user.id, token, plan });

    if (i % 50 === 0) {
      console.log(`[Seed] ${i}/${TENANT_COUNT} tamamlandı`);
    }
  }

  // fixtures/tenants.json'a yaz
  const outDir = path.join(__dirname, 'fixtures');
  fs.mkdirSync(outDir, { recursive: true });
  const outPath = path.join(outDir, 'tenants.json');
  fs.writeFileSync(outPath, JSON.stringify(fixtures, null, 2));

  console.log(`[Seed] ✅ ${TENANT_COUNT} tenant hazır → ${outPath}`);
}

main()
  .catch((err) => { console.error('[Seed] HATA:', err); process.exit(1); })
  .finally(() => prisma.$disconnect());
