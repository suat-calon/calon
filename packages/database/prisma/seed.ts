import { PrismaClient } from '../generated/client';
import * as bcrypt from 'bcryptjs';

const prisma = new PrismaClient();

// ─── Fixed UUIDs (deterministic) ───────────────────────────────────────────
const TENANT_ID      = '00000000-0000-4000-a000-000000000001';
const LOCATION_ID    = '00000000-0000-4000-a000-000000000010';
const CATEGORY_ID    = '00000000-0000-4000-a000-000000000020';

const OWNER_USER_ID  = '00000000-0000-4000-a000-000000000100';
const OWNER_UT_ID    = '00000000-0000-4000-a000-000000000101';

const ADMIN_USER_ID  = '00000000-0000-4000-a000-000000000900';
const ADMIN_UT_ID    = '00000000-0000-4000-a000-000000000901';

const STAFF_IDS = [
  '00000000-0000-4000-a000-000000000200', // Ayşe Kuaför
  '00000000-0000-4000-a000-000000000201', // Mehmet Berber
];

const SERVICE_IDS = [
  '00000000-0000-4000-a000-000000000300', // Saç Kesimi (30 dk)
  '00000000-0000-4000-a000-000000000301', // Fön (45 dk)
  '00000000-0000-4000-a000-000000000302', // Saç Boyama (90 dk)
];

const CUSTOMER_IDS = [
  '00000000-0000-4000-a000-000000000400',
  '00000000-0000-4000-a000-000000000401',
  '00000000-0000-4000-a000-000000000402',
  '00000000-0000-4000-a000-000000000403',
  '00000000-0000-4000-a000-000000000404',
];

const APPOINTMENT_IDS = [
  '00000000-0000-4000-a000-000000000500',
  '00000000-0000-4000-a000-000000000501',
  '00000000-0000-4000-a000-000000000502',
  '00000000-0000-4000-a000-000000000503',
  '00000000-0000-4000-a000-000000000504',
  '00000000-0000-4000-a000-000000000505',
  '00000000-0000-4000-a000-000000000506',
  '00000000-0000-4000-a000-000000000507',
  '00000000-0000-4000-a000-000000000508',
  '00000000-0000-4000-a000-000000000509',
];

const USAGE_PERIOD_ID = '00000000-0000-4000-a000-000000000600';

// StaffWorkingHour UUIDs — staff[i] × day[j]
// Staff 0 (Ayşe):   700–706
// Staff 1 (Mehmet): 710–716
const WORKING_HOUR_IDS: Record<string, Record<string, string>> = {
  [STAFF_IDS[0]!]: {
    MON: '00000000-0000-4000-a000-000000000700',
    TUE: '00000000-0000-4000-a000-000000000701',
    WED: '00000000-0000-4000-a000-000000000702',
    THU: '00000000-0000-4000-a000-000000000703',
    FRI: '00000000-0000-4000-a000-000000000704',
    SAT: '00000000-0000-4000-a000-000000000705',
    SUN: '00000000-0000-4000-a000-000000000706',
  },
  [STAFF_IDS[1]!]: {
    MON: '00000000-0000-4000-a000-000000000710',
    TUE: '00000000-0000-4000-a000-000000000711',
    WED: '00000000-0000-4000-a000-000000000712',
    THU: '00000000-0000-4000-a000-000000000713',
    FRI: '00000000-0000-4000-a000-000000000714',
    SAT: '00000000-0000-4000-a000-000000000715',
    SUN: '00000000-0000-4000-a000-000000000716',
  },
};

// ─── Helpers ───────────────────────────────────────────────────────────────
function futureDate(daysFromNow: number, hour: number): Date {
  const d = new Date();
  d.setDate(d.getDate() + daysFromNow);
  d.setHours(hour, 0, 0, 0);
  return d;
}

// ─── Main ──────────────────────────────────────────────────────────────────
async function main() {
  console.log('🌱 Seeding demo data...');

  // ── 1. Tenant ─────────────────────────────────────────────────────────────
  const tenant = await prisma.tenant.upsert({
    where:  { slug: 'demo-salon' },
    update: { timezone: 'Europe/Istanbul' },
    create: {
      id:       TENANT_ID,
      name:     'Demo Salon',
      slug:     'demo-salon',
      plan:     'BOUTIQUE',
      status:   'ACTIVE',
      timezone: 'Europe/Istanbul',
      currency: 'TRY',
    },
  });
  const tenantId = tenant.id;
  console.log(`  tenant: ${tenant.slug} (${tenantId})`);

  // ── 2. Owner User ─────────────────────────────────────────────────────────
  await prisma.user.upsert({
    where:  { id: OWNER_USER_ID },
    update: {},
    create: {
      id:           OWNER_USER_ID,
      email:        'owner@demo-salon.com',
      passwordHash: '$2b$10$g5f.JHtX2.FIiYDOE4RMbuGHGqnzPqak3M0kSE989NPrYD4qs1UAa', // Demo1234!
      firstName:    'Suat',
      lastName:     'Democu',
      status:       'ACTIVE',
    },
  });

  // ── 3. UserTenant (owner role) ────────────────────────────────────────────
  await prisma.userTenant.upsert({
    where:  { id: OWNER_UT_ID },
    update: {},
    create: {
      id:       OWNER_UT_ID,
      userId:   OWNER_USER_ID,
      tenantId,
      role:     'TENANT_OWNER',
    },
  });

  // ── 3b. Super Admin User ─────────────────────────────────────────────────
  const adminHash = await bcrypt.hash('Admin1234!', 10);
  await prisma.user.upsert({
    where:  { id: ADMIN_USER_ID },
    update: {},
    create: {
      id:           ADMIN_USER_ID,
      email:        'admin@calon.com.tr',
      passwordHash: adminHash,
      firstName:    'Platform',
      lastName:     'Admin',
      status:       'ACTIVE',
    },
  });
  await prisma.userTenant.upsert({
    where:  { id: ADMIN_UT_ID },
    update: {},
    create: {
      id:       ADMIN_UT_ID,
      userId:   ADMIN_USER_ID,
      tenantId,
      role:     'SUPER_ADMIN',
    },
  });
  console.log('  super admin: admin@calon.com.tr (SUPER_ADMIN)');

  // ── 4. Location ───────────────────────────────────────────────────────────
  await prisma.location.upsert({
    where:  { id: LOCATION_ID },
    update: {},
    create: {
      id:       LOCATION_ID,
      tenantId,
      name:     'Merkez Şube',
      address:  'Bağdat Caddesi No:123',
      city:     'İstanbul',
      country:  'TR',
      isActive: true,
    },
  });
  console.log('  location: Merkez Şube (İstanbul)');

  // ── 5. ServiceCategory ────────────────────────────────────────────────────
  await prisma.serviceCategory.upsert({
    where:  { id: CATEGORY_ID },
    update: {},
    create: {
      id:        CATEGORY_ID,
      tenantId,
      name:      'Saç Bakım',
      sortOrder: 1,
    },
  });

  // ── 6. StaffProfile × 2 ───────────────────────────────────────────────────
  const staffData = [
    { id: STAFF_IDS[0]!, firstName: 'Ayşe',   lastName: 'Kuaför', title: 'Saç Uzmanı',    colorHex: '#6366f1' },
    { id: STAFF_IDS[1]!, firstName: 'Mehmet', lastName: 'Berber', title: 'Erkek Kuaförü', colorHex: '#f59e0b' },
  ];
  for (const s of staffData) {
    await prisma.staffProfile.upsert({
      where:  { id: s.id },
      update: {},
      create: {
        id:             s.id,
        tenantId,
        locationId:     LOCATION_ID,
        firstName:      s.firstName,
        lastName:       s.lastName,
        title:          s.title,
        colorHex:       s.colorHex,
        commissionRate: 30,
        isActive:       true,
      },
    });
  }
  console.log(`  staff: ${staffData.map((s) => s.firstName).join(', ')}`);

  // ── 7. Service × 3 ───────────────────────────────────────────────────────
  const serviceData = [
    { id: SERVICE_IDS[0]!, name: 'Saç Kesimi',  durationMin: 30, price: '150.00' },
    { id: SERVICE_IDS[1]!, name: 'Fön',          durationMin: 45, price: '200.00' },
    { id: SERVICE_IDS[2]!, name: 'Saç Boyama',   durationMin: 90, price: '500.00' },
  ];
  for (const svc of serviceData) {
    await prisma.service.upsert({
      where:  { id: svc.id },
      update: {},
      create: {
        id:              svc.id,
        tenantId,
        categoryId:      CATEGORY_ID,
        name:            svc.name,
        durationMin:     svc.durationMin,
        price:           svc.price,
        currency:        'TRY',
        requiresDeposit: false,
        isActive:        true,
      },
    });
  }
  console.log(`  services: ${serviceData.map((s) => s.name).join(', ')}`);

  // ── 8. StaffService relations (her personel her hizmeti verebilir) ─────────
  // BOOKING FLOW İÇİN KRİTİK: eksikse staff.serviceIds boş döner
  for (const staffId of STAFF_IDS) {
    for (const serviceId of SERVICE_IDS) {
      await prisma.staffService.upsert({
        where:  { staffId_serviceId: { staffId: staffId!, serviceId: serviceId! } },
        update: {},
        create: {
          tenantId,
          staffId:   staffId!,
          serviceId: serviceId!,
        },
      });
    }
  }
  console.log(`  staff-service relations: ${STAFF_IDS.length * SERVICE_IDS.length} kayıt`);

  // ── 9. StaffWorkingHour (Pzt–Cmt çalışır, Pazar kapalı) ──────────────────
  // AVAILABILITY İÇİN KRİTİK: eksikse getAvailableSlots() direkt [] döner
  //
  // Çalışma saati: 09:00–18:00  Öğle molası: 12:00–13:00
  // Pazar: isWorkingDay=false
  const DAYS = ['MON', 'TUE', 'WED', 'THU', 'FRI', 'SAT', 'SUN'] as const;

  for (const staffId of STAFF_IDS) {
    for (const day of DAYS) {
      const isWorkingDay = day !== 'SUN';
      const whId = WORKING_HOUR_IDS[staffId!]![day]!;
      await prisma.staffWorkingHour.upsert({
        where:  { staffId_dayOfWeek: { staffId: staffId!, dayOfWeek: day } },
        update: {},
        create: {
          id:          whId,
          tenantId,
          staffId:     staffId!,
          dayOfWeek:   day,
          startTime:   '09:00',
          endTime:     '18:00',
          isWorkingDay,
          breakStart:  isWorkingDay ? '12:00' : null,
          breakEnd:    isWorkingDay ? '13:00' : null,
        },
      });
    }
  }
  console.log(`  working hours: ${STAFF_IDS.length * DAYS.length} kayıt (Pzt–Cmt 09:00–18:00)`);

  // ── 10. Customer × 5 ─────────────────────────────────────────────────────
  const customerData = [
    { id: CUSTOMER_IDS[0]!, firstName: 'Elif',   lastName: 'Yılmaz', phone: '+905301111111' },
    { id: CUSTOMER_IDS[1]!, firstName: 'Zeynep', lastName: 'Kaya',   phone: '+905302222222' },
    { id: CUSTOMER_IDS[2]!, firstName: 'Fatma',  lastName: 'Demir',  phone: '+905303333333' },
    { id: CUSTOMER_IDS[3]!, firstName: 'Ali',    lastName: 'Çelik',  phone: '+905304444444' },
    { id: CUSTOMER_IDS[4]!, firstName: 'Ahmet',  lastName: 'Öztürk', phone: '+905305555555' },
  ];
  for (const c of customerData) {
    await prisma.customer.upsert({
      where:  { id: c.id },
      update: {},
      create: {
        id:           c.id,
        tenantId,
        firstName:    c.firstName,
        lastName:     c.lastName,
        phone:        c.phone,
        consentGiven: true,
        consentDate:  new Date(),
      },
    });
  }

  // ── 11. Appointment × 10 (CONFIRMED, sonraki 5 gün) ──────────────────────
  for (let i = 0; i < 10; i++) {
    const dayOffset  = Math.floor(i / 2) + 1;      // günler 1–5, günde 2 randevu
    const hour       = 10 + (i % 2) * 2;            // 10:00 veya 12:00
    const staffId    = STAFF_IDS[i % 2]!;
    const serviceId  = SERVICE_IDS[i % 3]!;
    const customerId = CUSTOMER_IDS[i % 5]!;
    const svc        = serviceData[i % 3]!;
    const start      = futureDate(dayOffset, hour);
    const end        = new Date(start.getTime() + svc.durationMin * 60_000);

    await prisma.appointment.upsert({
      where:  { id: APPOINTMENT_IDS[i]! },
      update: {},
      create: {
        id:         APPOINTMENT_IDS[i]!,
        tenantId,
        customerId,
        staffId,
        serviceId,
        locationId: LOCATION_ID,
        status:     'CONFIRMED',
        source:     'ONLINE',
        startTime:  start,
        endTime:    end,
        totalPrice: svc.price,
      },
    });
  }
  console.log('  appointments: 10 CONFIRMED randevu (sonraki 5 gün)');

  // ── 12. TenantBilling ─────────────────────────────────────────────────────
  const now = new Date();
  const periodEnd = new Date(now);
  periodEnd.setDate(periodEnd.getDate() + 30);
  const trialEnd = new Date(now);
  trialEnd.setDate(trialEnd.getDate() + 7);

  await prisma.tenantBilling.upsert({
    where:  { tenantId },
    update: {},
    create: {
      tenantId,
      plan:               'BOUTIQUE',
      cycle:              'MONTHLY',
      status:             'TRIAL',
      trialEndsAt:        trialEnd,
      graceUntil:         trialEnd,
      currentPeriodStart: now,
      currentPeriodEnd:   periodEnd,
      provider:           'NONE',
    },
  });

  // ── 13. UsagePeriod ───────────────────────────────────────────────────────
  await prisma.usagePeriod.upsert({
    where:  { id: USAGE_PERIOD_ID },
    update: {},
    create: {
      id:          USAGE_PERIOD_ID,
      tenantId,
      periodStart: now,
      periodEnd:   periodEnd,
      smsIncluded: 100,
      smsUsed:     0,
      aiIncluded:  50,
      aiUsed:      0,
    },
  });

  // ── Doğrulama özeti ───────────────────────────────────────────────────────
  const [tenantCheck, svcs, staffList, locs, whs, ssRels] = await Promise.all([
    prisma.tenant.findUnique({ where: { slug: 'demo-salon' }, select: { id: true, slug: true, timezone: true, status: true } }),
    prisma.service.count({ where: { tenantId, isActive: true, isDeleted: false } }),
    prisma.staffProfile.count({ where: { tenantId, isActive: true, isDeleted: false } }),
    prisma.location.count({ where: { tenantId, isActive: true, isDeleted: false } }),
    prisma.staffWorkingHour.count({ where: { tenantId } }),
    prisma.staffService.count({ where: { tenantId } }),
  ]);

  console.log('\n══════════════════════════════════════════');
  console.log('✅ SEED TAMAMLANDI — DOĞRULAMA');
  console.log('══════════════════════════════════════════');
  console.log(`  tenant:          ${tenantCheck?.slug} (${tenantCheck?.status})`);
  console.log(`  timezone:        ${tenantCheck?.timezone}`);
  console.log(`  services:        ${svcs}`);
  console.log(`  staff:           ${staffList}`);
  console.log(`  locations:       ${locs}`);
  console.log(`  working hours:   ${whs}`);
  console.log(`  staff-services:  ${ssRels}`);
  console.log('──────────────────────────────────────────');
  console.log('  📎 Test URL: /booking/demo-salon');
  console.log('══════════════════════════════════════════\n');
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
