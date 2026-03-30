/**
 * ONBOARDING SERVICE — Self-Onboarding Wizard
 * ──────────────────────────────────────────────────────────────────────────────
 * A) register()           → atomik User + Tenant + UserTenant + TenantBilling (TRIAL)
 * B) setupWizard()        → idempotent toplu veri kurulumu (Location, Services, Staff…)
 * C) getStatus()          → wizard durumunu döner (adım tespiti için)
 * D) createWizardLocation → Faz 21 adım-1: konum oluşturur
 * E) createWizardService  → Faz 21 adım-2: hizmet oluşturur (oto-kategori)
 * F) createWizardStaff    → Faz 21 adım-3: personel oluşturur
 * ──────────────────────────────────────────────────────────────────────────────
 */

import {
  Injectable,
  ConflictException,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { JwtService }     from '@nestjs/jwt';
import { Prisma }         from '@prisma/client';
import * as bcrypt        from 'bcrypt';
import * as crypto        from 'crypto';

import { PrismaService }        from '../../common/prisma.service';
import { JwtPayload }           from '../iam/guards/tenant.guard';
import { RegisterOnboardingDto } from './dto/register-onboarding.dto';
import { SetupWizardDto }        from './dto/setup-wizard.dto';
import { WizardLocationDto }     from './dto/wizard-location.dto';
import { WizardServiceDto }      from './dto/wizard-service.dto';
import { WizardStaffDto }        from './dto/wizard-staff.dto';
import { buildBookingLink }       from '../../common/platform';

// ── Sabitler ──────────────────────────────────────────────────────────────────

const BCRYPT_ROUNDS      = 12;
const REFRESH_TTL_DAYS   = 30;
const ACCESS_TTL_SEC     = 15 * 60; // 900 sn
const ONBOARDING_TRIAL_DAYS = 14;   // Faz 15: onboarding trial 14 gün
const BILLING_GRACE_DAYS    = 3;


/** DayOfWeek dönüşüm tablosu: 0=MON … 6=SUN */
const DAY_MAP = ['MON', 'TUE', 'WED', 'THU', 'FRI', 'SAT', 'SUN'] as const;

// ── Service ───────────────────────────────────────────────────────────────────

@Injectable()
export class OnboardingService {
  private readonly logger = new Logger(OnboardingService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly jwt:    JwtService,
  ) {}

  // ═══════════════════════════════════════════════════════════════════════════
  // A) REGISTER — Atomik kullanıcı + tenant oluşturma
  // ═══════════════════════════════════════════════════════════════════════════

  async register(dto: RegisterOnboardingDto) {
    // ── 1. E-posta benzersizliği ─────────────────────────────────────────────
    const existingUser = await this.prisma.user.findUnique({
      where: { email: dto.email },
    });
    if (existingUser) {
      throw new ConflictException('Bu e-posta adresi zaten kayıtlı.');
    }

    // ── 2. Slug çözümle ─────────────────────────────────────────────────────
    const slug = await this.resolveSlug(dto.tenant.slug, dto.tenant.name);

    // ── 3. Şifre hash ────────────────────────────────────────────────────────
    const passwordHash = await bcrypt.hash(dto.password, BCRYPT_ROUNDS);

    // ── 4. Atomik kayıt: Tenant + User + UserTenant + TenantBilling ──────────
    const now          = new Date();
    const trialEndsAt  = addDays(now, ONBOARDING_TRIAL_DAYS);
    const graceUntil   = addDays(trialEndsAt, BILLING_GRACE_DAYS);
    const periodEnd    = addDays(now, 30);

    const { user, tenant } = await this.prisma.$transaction(
      async (tx: Prisma.TransactionClient) => {
        const tenant = await tx.tenant.create({
          data: {
            name:     dto.tenant.name,
            slug,
            plan:     'SOLO',
            status:   'ACTIVE',
            timezone: dto.tenant.timezone ?? 'Europe/Istanbul',
            currency: dto.tenant.currency ?? 'TRY',
          },
        });

        const user = await tx.user.create({
          data: {
            email:        dto.email,
            passwordHash,
            firstName:    dto.firstName,
            lastName:     dto.lastName,
            phone:        dto.phone,
            status:       'ACTIVE',
            tenants: {
              create: {
                tenantId: tenant.id,
                role:     'TENANT_OWNER',
              },
            },
          },
        });

        // TenantBilling: TRIAL — 14 gün (onboarding triali)
        await tx.tenantBilling.create({
          data: {
            tenantId:           tenant.id,
            plan:               'SOLO',
            cycle:              'MONTHLY',
            status:             'TRIAL',
            trialEndsAt,
            graceUntil,
            currentPeriodStart: now,
            currentPeriodEnd:   periodEnd,
          },
        });

        return { user, tenant };
      },
    );

    this.logger.log(
      `Onboarding register: tenant=${tenant.slug} (${tenant.id}) | user=${user.email} (${user.id})`,
    );

    const { accessToken, refreshToken } = await this.generateTokenPair(
      user.id, tenant.id, 'TENANT_OWNER', 'SOLO',
    );

    return {
      accessToken,
      refreshToken,
      tenantId:    tenant.id,
      bookingLink: buildBookingLink(slug),
    };
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // B) SETUP WIZARD — İdempotent toplu veri kurulumu
  // ═══════════════════════════════════════════════════════════════════════════

  async setupWizard(
    tenantId:        string,
    idempotencyKey:  string,
    dto:             SetupWizardDto,
  ): Promise<unknown> {
    // ── 1. İdempotency kontrolü ──────────────────────────────────────────────
    const existing = await this.prisma.onboardingIdempotency.findUnique({
      where: { tenantId_key: { tenantId, key: idempotencyKey } },
    });
    if (existing) {
      this.logger.log(
        `[Onboarding] Idempotent wizard hit: tenant=${tenantId} key=${idempotencyKey}`,
      );
      return existing.response;
    }

    // ── 1b. Tenant slug'ını booking link için önceden al ─────────────────────
    const tenantRecord = await this.prisma.tenant.findUniqueOrThrow({
      where:  { id: tenantId },
      select: { slug: true },
    });
    const bookingLink = buildBookingLink(tenantRecord.slug);

    // ── 2. Atomik wizard kurulumu ────────────────────────────────────────────
    await this.prisma.$transaction(
      async (tx: Prisma.TransactionClient) => {
        // ── 2a. Konum ──────────────────────────────────────────────────────────
        const location = await tx.location.create({
          data: {
            tenantId,
            name:    dto.location.name,
            address: dto.location.address,
            city:    dto.location.city,
            phone:   dto.location.phone,
          },
        });

        // ── 2b. Hizmet kategorileri (name'e göre findFirst || create) ──────────
        const categoryNames = [...new Set(dto.services.map(s => s.categoryName))];
        const categoryMap   = new Map<string, string>(); // categoryName → id

        for (const catName of categoryNames) {
          const cat = await tx.serviceCategory.findFirst({
            where: { tenantId, name: catName, isDeleted: false },
          });
          const catId = cat?.id ?? (
            await tx.serviceCategory.create({
              data: { tenantId, name: catName },
            })
          ).id;
          categoryMap.set(catName, catId);
        }

        // ── 2c. Hizmetler ───────────────────────────────────────────────────────
        const serviceIds: string[] = [];
        for (const svc of dto.services) {
          const created = await tx.service.create({
            data: {
              tenantId,
              categoryId:  categoryMap.get(svc.categoryName)!,
              name:        svc.name,
              durationMin: svc.durationMin,
              price:       svc.price,
            },
          });
          serviceIds.push(created.id);
        }

        // ── 2d. Personel ────────────────────────────────────────────────────────
        const staffIds: string[] = [];
        for (const s of dto.staff) {
          const created = await tx.staffProfile.create({
            data: {
              tenantId,
              locationId: location.id, // Tüm personel wizard'daki konuma atanır
              firstName:  s.firstName,
              lastName:   s.lastName,
              title:      s.title,
            },
          });
          staffIds.push(created.id);
        }

        // ── 2e. Çalışma saatleri ────────────────────────────────────────────────
        // Wizard'dan explicit çalışma saatleri geldiyse onları kullan.
        // Gelmediyse her staff'a booking-ready default ata (Pzt–Cmt 09:00–18:00).
        // Bu guard olmadan staff workingHours boş kalır → availability [] → booking imkansız.
        const hasExplicitHours = (dto.workingHours ?? []).length > 0;

        if (hasExplicitHours) {
          for (const wh of dto.workingHours!) {
            const staffId = staffIds[wh.staffIndex];
            if (!staffId) continue;
            await tx.staffWorkingHour.upsert({
              where: {
                staffId_dayOfWeek: {
                  staffId,
                  dayOfWeek: DAY_MAP[wh.dayOfWeek],
                },
              },
              update: { startTime: wh.startTime, endTime: wh.endTime },
              create: {
                tenantId,
                staffId,
                dayOfWeek:   DAY_MAP[wh.dayOfWeek],
                startTime:   wh.startTime,
                endTime:     wh.endTime,
                isWorkingDay: true,
              },
            });
          }
        } else {
          // Default booking-ready hours: Mon–Sat 09:00–18:00, Sun off
          for (const staffId of staffIds) {
            for (let d = 0; d < DAY_MAP.length; d++) {
              const day = DAY_MAP[d]!;
              const isWorkingDay = day !== 'SUN';
              await tx.staffWorkingHour.upsert({
                where: { staffId_dayOfWeek: { staffId, dayOfWeek: day } },
                update: {},
                create: {
                  tenantId,
                  staffId,
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
        }

        // ── 2f. Personel ↔ Hizmet bağlantıları ─────────────────────────────────
        for (const link of (dto.staffServices ?? [])) {
          const staffId   = staffIds[link.staffIndex];
          const serviceId = serviceIds[link.serviceIndex];
          if (!staffId || !serviceId) continue;
          await tx.staffService.upsert({
            where:  { staffId_serviceId: { staffId, serviceId } },
            update: {},
            create: { tenantId, staffId, serviceId },
          });
        }
      },
    );

    // ── 3. Spec yanıtı hazırla + idempotency kaydet ───────────────────────────
    const wizardResponse = {
      bookingLink,
      next: 'PUBLISH_READY',
    };

    await this.prisma.onboardingIdempotency.create({
      data: {
        tenantId,
        key:      idempotencyKey,
        response: wizardResponse as Prisma.InputJsonValue,
      },
    });

    this.logger.log(
      `[Onboarding] Wizard tamamlandı: tenant=${tenantId} key=${idempotencyKey}`,
    );

    return wizardResponse;
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // C) GET STATUS — Wizard adımını tespit et
  // ═══════════════════════════════════════════════════════════════════════════

  async getStatus(tenantId: string): Promise<{
    currentStep: number;
    tenantId:    string;
    tenantSlug:  string;
    locationId:  string | null;
    serviceId:   string | null;
    staffId:     string | null;
    bookingLink: string;
  }> {
    const tenant = await this.prisma.tenant.findFirst({
      where: { id: tenantId, isDeleted: false },
      include: {
        locations: { where: { isDeleted: false }, take: 1, orderBy: { createdAt: 'asc' } },
        services:  { where: { isDeleted: false }, take: 1, orderBy: { createdAt: 'asc' } },
        staff:     { where: { isDeleted: false }, take: 1, orderBy: { createdAt: 'asc' } },
      },
    });

    if (!tenant) throw new NotFoundException(`Tenant bulunamadı: ${tenantId}`);

    const locationId = tenant.locations[0]?.id ?? null;
    const serviceId  = tenant.services[0]?.id  ?? null;
    const staffId    = tenant.staff[0]?.id      ?? null;

    // Adım belirleme: tamamlanan son adıma göre bir sonrakini göster
    let currentStep = 1;
    if (locationId) currentStep = 2;
    if (locationId && serviceId) currentStep = 3;
    if (locationId && serviceId && staffId) currentStep = 4;

    return {
      currentStep,
      tenantId,
      tenantSlug:  tenant.slug,
      locationId,
      serviceId,
      staffId,
      bookingLink: buildBookingLink(tenant.slug),
    };
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // D) CREATE WIZARD LOCATION — Faz 21 Adım 1
  // ═══════════════════════════════════════════════════════════════════════════

  async createWizardLocation(tenantId: string, dto: WizardLocationDto) {
    const location = await this.prisma.location.create({
      data: {
        tenantId,
        name:    dto.name,
        city:    dto.city,
        phone:   dto.phone,
        address: dto.address,
      },
    });

    this.logger.log(`[Wizard] Location oluşturuldu: ${location.id} (tenant=${tenantId})`);
    return { locationId: location.id };
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // E) CREATE WIZARD SERVICE — Faz 21 Adım 2
  // ═══════════════════════════════════════════════════════════════════════════

  async createWizardService(tenantId: string, dto: WizardServiceDto) {
    // Varsayılan "Genel" kategorisini bul ya da oluştur
    let category = await this.prisma.serviceCategory.findFirst({
      where: { tenantId, name: 'Genel', isDeleted: false },
    });
    if (!category) {
      category = await this.prisma.serviceCategory.create({
        data: { tenantId, name: 'Genel' },
      });
    }

    const service = await this.prisma.service.create({
      data: {
        tenantId,
        categoryId:  category.id,
        name:        dto.name,
        durationMin: dto.durationMin,
        price:       dto.price,
      },
    });

    this.logger.log(`[Wizard] Service oluşturuldu: ${service.id} (tenant=${tenantId})`);
    return { serviceId: service.id };
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // F) CREATE WIZARD STAFF — Faz 21 Adım 3
  // ═══════════════════════════════════════════════════════════════════════════

  async createWizardStaff(tenantId: string, dto: WizardStaffDto) {
    // locationId'nin bu tenant'a ait olduğunu doğrula
    const location = await this.prisma.location.findFirst({
      where: { id: dto.locationId, tenantId, isDeleted: false },
    });
    if (!location) {
      throw new NotFoundException(
        `Location bulunamadı veya bu tenant'a ait değil: ${dto.locationId}`,
      );
    }

    const staff = await this.prisma.staffProfile.create({
      data: {
        tenantId,
        locationId: dto.locationId,
        firstName:  dto.firstName,
        lastName:   dto.lastName,
        title:      dto.title,
      },
    });

    this.logger.log(`[Wizard] Staff oluşturuldu: ${staff.id} (tenant=${tenantId})`);
    return { staffId: staff.id };
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // ÖZEL YARDIMCI: Slug çözümleyici
  // ═══════════════════════════════════════════════════════════════════════════

  /**
   * Slug verilmişse normalize eder ve benzersizliğini kontrol eder (409 SLUG_TAKEN).
   * Verilmemişse name'den üretir ve "-2", "-3" … ekleyerek benzersiz yapar.
   */
  private async resolveSlug(
    provided: string | undefined,
    name:     string,
  ): Promise<string> {
    if (provided) {
      const normalized = provided.toLowerCase().trim();
      const taken = await this.prisma.tenant.findUnique({
        where: { slug: normalized },
      });
      if (taken) {
        throw new ConflictException(
          `Bu slug zaten alınmış: "${normalized}". Farklı bir işletme adresi seçin.`,
        );
      }
      return normalized;
    }

    // Otomatik üretim: name → slug → benzersizlik
    const base = this.slugify(name);
    let candidate = base;
    let suffix    = 2;

    while (true) {
      const exists = await this.prisma.tenant.findUnique({
        where: { slug: candidate },
      });
      if (!exists) return candidate;
      candidate = `${base}-${suffix++}`;
    }
  }

  /** "İşletme Adı 123" → "isletme-adi-123" */
  private slugify(text: string): string {
    return text
      .toLowerCase()
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '') // aksan kaldır
      .replace(/ş/g, 's').replace(/ğ/g, 'g').replace(/ı/g, 'i')
      .replace(/ö/g, 'o').replace(/ü/g, 'u').replace(/ç/g, 'c')
      .replace(/[^a-z0-9]+/g, '-')    // alfanümerik olmayan → tire
      .replace(/^-+|-+$/g, '')         // baş/son tireyi temizle
      .slice(0, 63)                     // max 63 karakter
      || 'salon';
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // ÖZEL YARDIMCI: Token çifti üretimi (AuthService'teki ile aynı)
  // ═══════════════════════════════════════════════════════════════════════════

  private async generateTokenPair(
    userId:   string,
    tenantId: string,
    role:     string,
    plan:     string,
  ): Promise<{ accessToken: string; refreshToken: string; expiresIn: number }> {
    const payload: JwtPayload = { sub: userId, tenantId, role, plan };
    const accessToken = this.jwt.sign(payload);

    const rawToken  = crypto.randomBytes(48).toString('hex');
    const expiresAt = new Date();
    expiresAt.setDate(expiresAt.getDate() + REFRESH_TTL_DAYS);

    await this.prisma.refreshToken.create({
      data: { token: rawToken, userId, tenantId, expiresAt },
    });

    return { accessToken, refreshToken: rawToken, expiresIn: ACCESS_TTL_SEC };
  }
}

// ── Modül-içi yardımcı ────────────────────────────────────────────────────────
function addDays(date: Date, days: number): Date {
  const d = new Date(date);
  d.setDate(d.getDate() + days);
  return d;
}
