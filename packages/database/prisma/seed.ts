import { PrismaClient } from '../generated/client';

const prisma = new PrismaClient();

// ─── Fixed UUIDs (deterministic) ───────────────────────────────────────────
const TENANT_ID = '00000000-0000-4000-a000-000000000001';
const LOCATION_ID = '00000000-0000-4000-a000-000000000010';
const CATEGORY_ID = '00000000-0000-4000-a000-000000000020';

const OWNER_USER_ID = '00000000-0000-4000-a000-000000000100';
const OWNER_UT_ID = '00000000-0000-4000-a000-000000000101';

const STAFF_IDS = [
  '00000000-0000-4000-a000-000000000200',
  '00000000-0000-4000-a000-000000000201',
];

const SERVICE_IDS = [
  '00000000-0000-4000-a000-000000000300',
  '00000000-0000-4000-a000-000000000301',
  '00000000-0000-4000-a000-000000000302',
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

  // 1. Tenant
  await prisma.tenant.upsert({
    where: { id: TENANT_ID },
    update: {},
    create: {
      id: TENANT_ID,
      name: 'Demo Salon',
      slug: 'demo-salon',
      plan: 'BOUTIQUE',
      status: 'ACTIVE',
    },
  });

  // 2. Owner User
  await prisma.user.upsert({
    where: { id: OWNER_USER_ID },
    update: {},
    create: {
      id: OWNER_USER_ID,
      email: 'owner@demo-salon.com',
      passwordHash: '$2b$10$demoHashNotRealButValidLength000000000000000000000',
      firstName: 'Suat',
      lastName: 'Democu',
      status: 'ACTIVE',
    },
  });

  // 3. UserTenant (owner role)
  await prisma.userTenant.upsert({
    where: { id: OWNER_UT_ID },
    update: {},
    create: {
      id: OWNER_UT_ID,
      userId: OWNER_USER_ID,
      tenantId: TENANT_ID,
      role: 'TENANT_OWNER',
    },
  });

  // 4. Location
  await prisma.location.upsert({
    where: { id: LOCATION_ID },
    update: {},
    create: {
      id: LOCATION_ID,
      tenantId: TENANT_ID,
      name: 'Merkez Şube',
      address: 'Bağdat Caddesi No:123',
      city: 'İstanbul',
      country: 'TR',
    },
  });

  // 5. ServiceCategory
  await prisma.serviceCategory.upsert({
    where: { id: CATEGORY_ID },
    update: {},
    create: {
      id: CATEGORY_ID,
      tenantId: TENANT_ID,
      name: 'Saç Bakım',
      sortOrder: 1,
    },
  });

  // 6. StaffProfile × 2
  const staffData = [
    { id: STAFF_IDS[0], firstName: 'Ayşe', lastName: 'Kuaför', title: 'Saç Uzmanı', colorHex: '#6366f1' },
    { id: STAFF_IDS[1], firstName: 'Mehmet', lastName: 'Berber', title: 'Erkek Kuaförü', colorHex: '#f59e0b' },
  ];
  for (const s of staffData) {
    await prisma.staffProfile.upsert({
      where: { id: s.id },
      update: {},
      create: {
        id: s.id,
        tenantId: TENANT_ID,
        locationId: LOCATION_ID,
        firstName: s.firstName,
        lastName: s.lastName,
        title: s.title,
        colorHex: s.colorHex,
        commissionRate: 30,
      },
    });
  }

  // 7. Service × 3
  const serviceData = [
    { id: SERVICE_IDS[0], name: 'Saç Kesimi', durationMin: 30, price: '150.00' },
    { id: SERVICE_IDS[1], name: 'Fön', durationMin: 45, price: '200.00' },
    { id: SERVICE_IDS[2], name: 'Saç Boyama', durationMin: 90, price: '500.00' },
  ];
  for (const svc of serviceData) {
    await prisma.service.upsert({
      where: { id: svc.id },
      update: {},
      create: {
        id: svc.id,
        tenantId: TENANT_ID,
        categoryId: CATEGORY_ID,
        name: svc.name,
        durationMin: svc.durationMin,
        price: svc.price,
        currency: 'TRY',
      },
    });
  }

  // 8. Customer × 5
  const customerData = [
    { id: CUSTOMER_IDS[0], firstName: 'Elif', lastName: 'Yılmaz', phone: '+905301111111' },
    { id: CUSTOMER_IDS[1], firstName: 'Zeynep', lastName: 'Kaya', phone: '+905302222222' },
    { id: CUSTOMER_IDS[2], firstName: 'Fatma', lastName: 'Demir', phone: '+905303333333' },
    { id: CUSTOMER_IDS[3], firstName: 'Ali', lastName: 'Çelik', phone: '+905304444444' },
    { id: CUSTOMER_IDS[4], firstName: 'Ahmet', lastName: 'Öztürk', phone: '+905305555555' },
  ];
  for (const c of customerData) {
    await prisma.customer.upsert({
      where: { id: c.id },
      update: {},
      create: {
        id: c.id,
        tenantId: TENANT_ID,
        firstName: c.firstName,
        lastName: c.lastName,
        phone: c.phone,
        consentGiven: true,
        consentDate: new Date(),
      },
    });
  }

  // 9. Appointment × 10 (CONFIRMED, spread across next 5 days)
  for (let i = 0; i < 10; i++) {
    const dayOffset = Math.floor(i / 2) + 1; // days 1-5, 2 per day
    const hour = 10 + (i % 2) * 2; // 10:00 or 12:00
    const staffId = STAFF_IDS[i % 2];
    const serviceId = SERVICE_IDS[i % 3];
    const customerId = CUSTOMER_IDS[i % 5];
    const svc = serviceData[i % 3];
    const start = futureDate(dayOffset, hour);
    const end = new Date(start.getTime() + svc.durationMin * 60_000);

    await prisma.appointment.upsert({
      where: { id: APPOINTMENT_IDS[i] },
      update: {},
      create: {
        id: APPOINTMENT_IDS[i],
        tenantId: TENANT_ID,
        customerId,
        staffId,
        serviceId,
        locationId: LOCATION_ID,
        status: 'CONFIRMED',
        source: 'ONLINE',
        startTime: start,
        endTime: end,
        totalPrice: svc.price,
      },
    });
  }

  // 10. TenantBilling
  const now = new Date();
  const periodEnd = new Date(now);
  periodEnd.setDate(periodEnd.getDate() + 30);
  const trialEnd = new Date(now);
  trialEnd.setDate(trialEnd.getDate() + 7);

  await prisma.tenantBilling.upsert({
    where: { tenantId: TENANT_ID },
    update: {},
    create: {
      tenantId: TENANT_ID,
      plan: 'BOUTIQUE',
      cycle: 'MONTHLY',
      status: 'TRIAL',
      trialEndsAt: trialEnd,
      graceUntil: trialEnd,
      currentPeriodStart: now,
      currentPeriodEnd: periodEnd,
      provider: 'NONE',
    },
  });

  // 11. UsagePeriod
  await prisma.usagePeriod.upsert({
    where: { id: USAGE_PERIOD_ID },
    update: {},
    create: {
      id: USAGE_PERIOD_ID,
      tenantId: TENANT_ID,
      periodStart: now,
      periodEnd: periodEnd,
      smsIncluded: 100,
      smsUsed: 0,
      aiIncluded: 50,
      aiUsed: 0,
    },
  });

  console.log('✅ Seed complete — demo-salon tenant ready.');
}

main()
  .catch(console.error)
  .finally(async () => {
    await prisma.$disconnect();
  });
