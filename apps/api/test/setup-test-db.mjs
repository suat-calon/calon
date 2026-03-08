/**
 * calon_test post-push kurulum scripti
 * prisma db push'tan sonra çalıştırılır:
 *   - btree_gist + uuid-ossp uzantıları
 *   - calon_app rolü + şifre + izinler
 *   - GIST EXCLUDE kısıtlamaları
 *   - RLS politikaları
 */

import { PrismaClient } from '../../../packages/database/generated/client/index.js';

const SUPER_URL = process.env.DATABASE_URL ??
  'postgresql://calon:dev_password@localhost:5432/calon_test';

const p = new PrismaClient({ datasources: { db: { url: SUPER_URL } } });

async function run() {
  await p.$connect();
  console.log('🔧 calon_test post-push kurulum başlıyor...');

  // 1. Uzantılar
  await p.$executeRawUnsafe(`CREATE EXTENSION IF NOT EXISTS "btree_gist"`);
  await p.$executeRawUnsafe(`CREATE EXTENSION IF NOT EXISTS "uuid-ossp"`);
  console.log('  ✅ Uzantılar: btree_gist, uuid-ossp');

  // 2. calon_app rolü
  await p.$executeRawUnsafe(`
    DO $$
    BEGIN
      IF NOT EXISTS (SELECT FROM pg_roles WHERE rolname = 'calon_app') THEN
        CREATE ROLE calon_app LOGIN PASSWORD 'calon_app_dev_secret';
      ELSE
        ALTER ROLE calon_app WITH PASSWORD 'calon_app_dev_secret' LOGIN;
      END IF;
    END
    $$
  `);
  await p.$executeRawUnsafe(`GRANT USAGE ON SCHEMA public TO calon_app`);
  await p.$executeRawUnsafe(`GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO calon_app`);
  await p.$executeRawUnsafe(`GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO calon_app`);
  await p.$executeRawUnsafe(`ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO calon_app`);
  await p.$executeRawUnsafe(`ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT USAGE, SELECT ON SEQUENCES TO calon_app`);
  console.log('  ✅ calon_app rolü ve izinleri');

  // 3. GIST EXCLUDE kısıtlamaları (varsa atla)
  try {
    await p.$executeRawUnsafe(`
      ALTER TABLE "appointments"
        ADD CONSTRAINT excl_no_staff_double_booking
        EXCLUDE USING GIST (
          "tenantId" WITH =,
          "staffId"  WITH =,
          tsrange("startTime", "endTime", '[)') WITH &&
        )
        WHERE (status NOT IN ('CANCELLED', 'NO_SHOW') AND "isDeleted" = FALSE)
    `);
    console.log('  ✅ GIST: excl_no_staff_double_booking');
  } catch (e) {
    if (e.message?.includes('already exists')) {
      console.log('  ⏭️  GIST staff constraint zaten var');
    } else {
      console.error('  ❌ GIST staff:', e.message);
    }
  }

  try {
    await p.$executeRawUnsafe(`
      ALTER TABLE "appointments"
        ADD CONSTRAINT excl_no_room_double_booking
        EXCLUDE USING GIST (
          "tenantId" WITH =,
          "roomId"   WITH =,
          tsrange("startTime", "endTime", '[)') WITH &&
        )
        WHERE (
          "roomId" IS NOT NULL
          AND status NOT IN ('CANCELLED', 'NO_SHOW')
          AND "isDeleted" = FALSE
        )
    `);
    console.log('  ✅ GIST: excl_no_room_double_booking');
  } catch (e) {
    if (e.message?.includes('already exists')) {
      console.log('  ⏭️  GIST room constraint zaten var');
    } else {
      console.error('  ❌ GIST room:', e.message);
    }
  }

  // 4. RLS — tablolarda etkinleştir
  const rlsTables = [
    'tenants','locations','rooms','user_tenants','staff_profiles',
    'staff_working_hours','staff_shifts','service_categories','services',
    'staff_services','products','stock_logs','customers','appointments',
    'transaction_ledger','commission_logs','loyalty_transactions',
    'consent_forms','refresh_tokens','idempotency_keys',
    'audit_logs','messages','campaign_templates',
  ];
  for (const t of rlsTables) {
    await p.$executeRawUnsafe(`ALTER TABLE "${t}" ENABLE ROW LEVEL SECURITY`);
  }
  console.log('  ✅ RLS etkinleştirildi:', rlsTables.length, 'tablo');

  // 5. RLS politikaları (varsa atla)
  const policies = [
    [`tenant_self_isolation ON "tenants"`,
     `id = current_setting('app.tenant_id', true)::uuid`],
    [`tenant_isolation ON "locations"`,
     `"tenantId" = current_setting('app.tenant_id', true)::uuid`],
    [`tenant_isolation ON "rooms"`,
     `"tenantId" = current_setting('app.tenant_id', true)::uuid`],
    [`tenant_isolation ON "user_tenants"`,
     `"tenantId" = current_setting('app.tenant_id', true)::uuid`],
    [`tenant_isolation ON "staff_profiles"`,
     `"tenantId" = current_setting('app.tenant_id', true)::uuid`],
    [`tenant_isolation ON "staff_working_hours"`,
     `"staffId" IN (SELECT id FROM "staff_profiles" WHERE "tenantId" = current_setting('app.tenant_id', true)::uuid)`],
    [`tenant_isolation ON "staff_shifts"`,
     `"staffId" IN (SELECT id FROM "staff_profiles" WHERE "tenantId" = current_setting('app.tenant_id', true)::uuid)`],
    [`tenant_isolation ON "service_categories"`,
     `"tenantId" = current_setting('app.tenant_id', true)::uuid`],
    [`tenant_isolation ON "services"`,
     `"tenantId" = current_setting('app.tenant_id', true)::uuid`],
    [`tenant_isolation ON "staff_services"`,
     `"staffId" IN (SELECT id FROM "staff_profiles" WHERE "tenantId" = current_setting('app.tenant_id', true)::uuid)`],
    [`tenant_isolation ON "products"`,
     `"tenantId" = current_setting('app.tenant_id', true)::uuid`],
    [`tenant_isolation ON "stock_logs"`,
     `"tenantId" = current_setting('app.tenant_id', true)::uuid`],
    [`tenant_isolation ON "customers"`,
     `"tenantId" = current_setting('app.tenant_id', true)::uuid`],
    [`tenant_isolation ON "appointments"`,
     `"tenantId" = current_setting('app.tenant_id', true)::uuid`],
    [`tenant_isolation ON "transaction_ledger"`,
     `"tenantId" = current_setting('app.tenant_id', true)::uuid`],
    [`tenant_isolation ON "commission_logs"`,
     `"tenantId" = current_setting('app.tenant_id', true)::uuid`],
    [`tenant_isolation ON "loyalty_transactions"`,
     `"tenantId" = current_setting('app.tenant_id', true)::uuid`],
    [`tenant_isolation ON "consent_forms"`,
     `"tenantId" = current_setting('app.tenant_id', true)::uuid`],
    [`tenant_isolation ON "refresh_tokens"`,
     `"tenantId" = current_setting('app.tenant_id', true)::uuid`],
    [`tenant_isolation ON "idempotency_keys"`,
     `"tenantId" = current_setting('app.tenant_id', true)::uuid`],
    [`tenant_isolation ON "audit_logs"`,
     `"tenantId" = current_setting('app.tenant_id', true)::uuid`],
    [`tenant_isolation ON "messages"`,
     `"tenantId" = current_setting('app.tenant_id', true)::uuid`],
    [`tenant_isolation ON "campaign_templates"`,
     `"tenantId" = current_setting('app.tenant_id', true)::uuid`],
  ];

  let created = 0, skipped = 0;
  for (const [policyDef, using] of policies) {
    try {
      await p.$executeRawUnsafe(
        `CREATE POLICY ${policyDef} FOR ALL TO calon_app USING (${using})`
      );
      created++;
    } catch (e) {
      if (e.message?.includes('already exists')) skipped++;
      else console.error('  ❌ Policy:', policyDef, e.message);
    }
  }
  console.log(`  ✅ RLS politikaları: ${created} oluşturuldu, ${skipped} zaten vardı`);

  // 6. Doğrulama
  const gist = await p.$queryRawUnsafe(
    `SELECT conname FROM pg_constraint WHERE conname LIKE 'excl_%'`
  );
  const enumCount = await p.$queryRawUnsafe(
    `SELECT COUNT(*) as c FROM pg_type WHERE typtype='e'`
  );
  console.log('\n📊 Doğrulama:');
  console.log('  GIST constraints:', gist.map(g => g.conname).join(', '));
  console.log('  Enum tipleri:', enumCount[0]?.c, 'adet');
  console.log('\n✅ calon_test hazır!\n');
}

run()
  .catch(e => { console.error('❌ HATA:', e.message); process.exit(1); })
  .finally(() => p.$disconnect());
