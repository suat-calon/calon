/**
 * PUBLIC SERVICE — Faz 16 + Faz 23
 * ──────────────────────────────────────────────────────────────────────────────
 * Tüm metodlar tenantContext.run() içinde çalışır:
 *   • Prisma middleware otomatik tenant filtresi devreye girer
 *   • RLS (PostgreSQL set_config) doğru tenant ile çalışır
 *
 * Kritik kural: tenantId asla body/query'den güvensiz alınmaz.
 *   getSalon(slug) → tenantId çözümlenir → diğer metodlara geçilir.
 *
 * Faz 23:
 *   • acquireHold() — POST /public/holds
 *   • releaseHold() — DELETE /public/holds/:holdId
 *   • getAvailability() → SchedulingAvailabilityService (shift-aware, hold-aware, tz-aware)
 * ──────────────────────────────────────────────────────────────────────────────
 */

import {
  Injectable,
  Logger,
  NotFoundException,
  ConflictException,
  ForbiddenException,
} from '@nestjs/common';
import { InjectQueue }    from '@nestjs/bull';
import { Queue }          from 'bull';
import { randomBytes }    from 'crypto';
import { DayOfWeek, TenantStatus, AppointmentStatus } from '@prisma/client';

// ── Türkçe destekli slugify ───────────────────────────────────────────────────
function slugify(text: string): string {
  return text
    .toLowerCase()
    .replace(/ı/g, 'i').replace(/ğ/g, 'g').replace(/ü/g, 'u')
    .replace(/ş/g, 's').replace(/ö/g, 'o').replace(/ç/g, 'c')
    .replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
}

import { PrismaService }                       from '../../common/prisma.service';
import { tenantContext }                       from '../../common/tenant.context';
import { QUEUE_NAMES }                         from '../../common/queue/queue-names';
import { AppointmentService }                  from '../operations/appointment/appointment.service';
import { AppointmentAvailabilityService }      from '../operations/appointment/appointment-availability.service';
import { AppointmentHoldService }              from '../operations/appointment/appointment-hold.service';
import { AppointmentLockService }              from '../operations/appointment/appointment-lock.service';
import { SchedulingAvailabilityService }       from '../operations/appointment/scheduling-availability.service';
import { AcquireHoldDto }                      from './dto/acquire-hold.dto';
import { BookPublicDto }                       from './dto/book-public.dto';

// ── Referral job payload ───────────────────────────────────────────────────
export interface ReferralJobPayload {
  tenantId:           string;
  referredCustomerId: string;
  referralCode:       string;
  appointmentId:      string;
}

// ── DayOfWeek dönüştürücü ─────────────────────────────────────────────────
// JS Date.getDay(): 0=Sun,1=Mon,...,6=Sat
const JS_DAY_TO_ENUM: Record<number, DayOfWeek> = {
  0: DayOfWeek.SUN,
  1: DayOfWeek.MON,
  2: DayOfWeek.TUE,
  3: DayOfWeek.WED,
  4: DayOfWeek.THU,
  5: DayOfWeek.FRI,
  6: DayOfWeek.SAT,
};

export interface SalonPublicDto {
  id:         string;
  name:       string;
  slug:       string;
  logoUrl:    string | null;
  brandColor: string | null;
  timezone:   string;
  currency:   string;
  location: {
    id:      string;
    name:    string;
    address: string | null;
    city:    string | null;
    phone:   string | null;
  } | null;
}

export interface ServicePublicDto {
  id:          string;
  name:        string;
  description: string | null;
  durationMin: number;
  price:       string;
  currency:    string;
  categoryName: string;
}

export interface StaffPublicDto {
  id:        string;
  firstName: string;
  lastName:  string;
  title:     string | null;
  avatarUrl: string | null;
  colorHex:  string;
  /** Bu personelin sunduğu hizmet UUID listesi */
  serviceIds: string[];
}

export interface SlotDto {
  startTime: string; // ISO 8601
  endTime:   string; // ISO 8601
}

export interface BookingResultDto {
  appointmentId:  string;
  startTime:      string;
  endTime:        string;
  service:  { name: string; durationMin: number };
  staff:    { firstName: string; lastName: string };
  location: { name: string };
  // Faz 18: Referral
  referralCode?: string;       // Yeni müşterinin üretilen kodu (paylaşım için)
  salonSlug:     string;       // Share URL oluşturmak için
  // Faz 19: Ödeme akışı + canonical URL
  requiresPayment: boolean;    // true → BookingWidget PaymentRequired adımını açar
  citySlug:        string | null; // Canonical URL: /{citySlug}/{serviceSlug}/{salonSlug}
  serviceSlug:     string | null; // Canonical URL bileşeni
}

@Injectable()
export class PublicService {
  private readonly logger = new Logger(PublicService.name);

  constructor(
    private readonly prisma:          PrismaService,
    private readonly appointments:    AppointmentService,
    private readonly availability:    AppointmentAvailabilityService,
    private readonly holdService:     AppointmentHoldService,
    private readonly lockService:     AppointmentLockService,
    private readonly schedulingAvail: SchedulingAvailabilityService,
    @InjectQueue(QUEUE_NAMES.REFERRAL_PROCESS)
    private readonly referralQueue: Queue<ReferralJobPayload>,
  ) {}

  // ── Faz 18: Referral kodu üretici ─────────────────────────────────────────
  private generateReferralCode(): string {
    return 'aur-' + randomBytes(3).toString('hex').toUpperCase(); // aur-A1B2C3
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // GET /public/salon/:slug
  // ═══════════════════════════════════════════════════════════════════════════

  async getSalon(slug: string): Promise<SalonPublicDto> {
    // Tenant, TENANT_SCOPED_MODELS dışında → direkt sorgu yapılabilir
    const tenant = await this.prisma.tenant.findFirst({
      where: { slug, isDeleted: false, status: { in: [TenantStatus.ACTIVE] } },
    });

    if (!tenant) throw new NotFoundException(`Salon bulunamadı: ${slug}`);

    // Location için context gerekiyor (TENANT_SCOPED_MODELS içinde)
    const location = await this.runInContext(tenant.id, () =>
      this.prisma.location.findFirst({
        where: { isActive: true },
        select: { id: true, name: true, address: true, city: true, phone: true },
      }),
    );

    return {
      id:         tenant.id,
      name:       tenant.name,
      slug:       tenant.slug,
      logoUrl:    tenant.logoUrl,
      brandColor: tenant.brandColor,
      timezone:   tenant.timezone,
      currency:   tenant.currency,
      location: location
        ? {
            id:      location.id,
            name:    location.name,
            address: location.address,
            city:    location.city,
            phone:   location.phone,
          }
        : null,
    };
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // GET /public/services?tenantId={id}
  // ═══════════════════════════════════════════════════════════════════════════

  async getServices(tenantId: string): Promise<ServicePublicDto[]> {
    const services = await this.runInContext(tenantId, () =>
      this.prisma.service.findMany({
        where:   { isActive: true },
        include: { category: { select: { name: true } } },
        orderBy: { name: 'asc' },
      }),
    );

    return services.map((s) => ({
      id:           s.id,
      name:         s.name,
      description:  s.description,
      durationMin:  s.durationMin,
      price:        s.price.toString(),
      currency:     s.currency,
      categoryName: s.category.name,
    }));
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // GET /public/staff?tenantId={id}
  // ═══════════════════════════════════════════════════════════════════════════

  async getStaff(tenantId: string): Promise<StaffPublicDto[]> {
    const staffList = await this.runInContext(tenantId, () =>
      this.prisma.staffProfile.findMany({
        where:   { isActive: true },
        include: {
          services: {
            where:  { service: { isActive: true, isDeleted: false } },
            select: { serviceId: true },
          },
        },
        orderBy: [{ firstName: 'asc' }, { lastName: 'asc' }],
      }),
    );

    return staffList.map((s) => ({
      id:         s.id,
      firstName:  s.firstName,
      lastName:   s.lastName,
      title:      s.title,
      avatarUrl:  s.avatarUrl,
      colorHex:   s.colorHex,
      serviceIds: s.services.map((ss) => ss.serviceId),
    }));
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // GET /public/availability?tenantId&staffId&date&serviceDurationMin
  // ═══════════════════════════════════════════════════════════════════════════

  async getAvailability(
    tenantId:          string,
    staffId:           string,
    date:              string,   // YYYY-MM-DD (tenant yerel tarihi)
    serviceDurationMin: number,
  ): Promise<SlotDto[]> {
    return this.runInContext(tenantId, async () => {
      // Faz 23: SchedulingAvailabilityService'e delege et.
      // Timezone-aware, shift-aware ve hold-aware slot hesabı yapar.
      // Tenant timezone'u çekilerek doğru yerel gün sınırı kullanılır.
      const tenant = await this.prisma.tenant.findUnique({
        where:  { id: tenantId },
        select: { timezone: true },
      });
      const timezone = tenant?.timezone ?? 'UTC';

      return this.schedulingAvail.getAvailableSlots(
        tenantId,
        staffId,
        date,
        timezone,
        serviceDurationMin,
      );
    });
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // POST /public/holds — Faz 23
  // ═══════════════════════════════════════════════════════════════════════════

  /**
   * DB-backed slot kilidi al.
   * endTime, service.durationMin'den hesaplanır (client güvenilmez).
   * Tenant timezone'u tenant kaydından alınır — doğru cache key için.
   */
  async acquireHold(dto: AcquireHoldDto): Promise<{ holdId: string; expiresAt: string }> {
    return this.runInContext(dto.tenantId, async () => {
      const service = await this.prisma.service.findFirst({
        where:  { id: dto.serviceId, tenantId: dto.tenantId },
        select: { durationMin: true },
      });
      if (!service) throw new NotFoundException('Hizmet bulunamadı.');

      const tenant = await this.prisma.tenant.findUnique({
        where:  { id: dto.tenantId },
        select: { timezone: true },
      });
      const timezone = tenant?.timezone ?? 'UTC';

      const startTime = new Date(dto.startTime);
      const endTime   = new Date(startTime.getTime() + service.durationMin * 60_000);

      const result = await this.holdService.acquireHold(
        dto.tenantId,
        dto.staffId,
        dto.serviceId,
        startTime,
        endTime,
        timezone,
      );

      return { holdId: result.holdId, expiresAt: result.expiresAt.toISOString() };
    });
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // DELETE /public/holds/:holdId — Faz 23
  // ═══════════════════════════════════════════════════════════════════════════

  /**
   * Aktif hold'u RELEASED olarak işaretler.
   * Kullanıcı booking akışından çıktığında veya geri döndüğünde çağrılır.
   * Idempotent: terminal durumda hold'a dokunmaz.
   */
  async releaseHold(holdId: string, tenantId: string): Promise<void> {
    return this.runInContext(tenantId, async () => {
      const tenant = await this.prisma.tenant.findUnique({
        where:  { id: tenantId },
        select: { timezone: true },
      });
      const timezone = tenant?.timezone ?? 'UTC';
      await this.holdService.releaseHold(holdId, tenantId, timezone);
    });
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // POST /public/book
  // ═══════════════════════════════════════════════════════════════════════════

  async book(dto: BookPublicDto): Promise<BookingResultDto> {
    // Tenant'ı doğrula (public endpoint → slug değil tenantId geliyor,
    // ama salon sayfasından alındığı için zaten güvenilir kabul edilir)
    // Faz 21.9: TRIAL tenant'lar da test rezervasyonu yapabilir.
    // TenantStatus.TRIAL diye bir değer yoktur; TRIAL olan salon billing.status=TRIAL
    // taşır ama tenant.status=ACTIVE'tir. Dolayısıyla burada yalnızca ACTIVE kontrol edilir.
    const tenant = await this.prisma.tenant.findFirst({
      where: {
        id:        dto.tenantId,
        isDeleted: false,
        status:    TenantStatus.ACTIVE,
      },
      include: { billing: { select: { status: true } } },
    });
    if (!tenant) throw new NotFoundException('Salon aktif değil.');

    // Faz 22: SUSPENDED tenant'lar public booking yapamaz.
    // BillingGuard @Public() endpoint'lerde çalışmaz; bu yüzden burada kontrol edilir.
    if (tenant.billing?.status === 'SUSPENDED') {
      throw new ForbiddenException(
        'Bu işletmenin aboneliği askıya alındı. Lütfen daha sonra tekrar deneyin.',
      );
    }

    return this.runInContext(dto.tenantId, async () => {
      // ── 1. Hizmet bilgisini al (endTime hesabı için) ─────────────────────
      const service = await this.prisma.service.findFirst({
        where: { id: dto.serviceId, tenantId: dto.tenantId },
      });
      if (!service) {
        throw new NotFoundException('Hizmet bulunamadı.');
      }

      const startTime = new Date(dto.startTime);
      const endTime   = new Date(startTime.getTime() + service.durationMin * 60_000);

      // ── 2. Personeli doğrula ─────────────────────────────────────────────
      const staff = await this.prisma.staffProfile.findFirst({
        where: { id: dto.staffId, tenantId: dto.tenantId, isActive: true, isDeleted: false },
      });
      if (!staff) throw new NotFoundException('Personel bulunamadı.');

      // ── 3. Müşteri upsert (telefon bazlı, tenant içi) ────────────────────
      let customer = await this.prisma.customer.findFirst({
        where: { phone: dto.phone },
      });

      let isNewCustomer = false;

      if (!customer) {
        isNewCustomer = true;
        customer = await this.prisma.customer.create({
          data: {
            tenantId:     dto.tenantId,
            firstName:    dto.firstName,
            lastName:     dto.lastName,
            phone:        dto.phone,
            email:        dto.email,
            consentGiven: true,
            consentDate:  new Date(),
            // Faz 18: Her yeni müşteri bir referral kodu alır
            referralCode: this.generateReferralCode(),
          },
        });
        this.logger.log(
          `Yeni müşteri oluşturuldu: ${customer.id} | tenant=${dto.tenantId} | refCode=${customer.referralCode}`,
        );
      }

      // ── 4. Lokasyonu doğrula ─────────────────────────────────────────────
      const location = await this.prisma.location.findFirst({
        where: { id: dto.locationId, tenantId: dto.tenantId, isActive: true, isDeleted: false },
      });
      if (!location) throw new NotFoundException('Lokasyon bulunamadı.');

      // ── 5a. Başlangıç durumunu belirle ───────────────────────────────────
      // Faz 19: requiresDeposit=true ise randevu PENDING_PAYMENT ile başlar
      const initialStatus: AppointmentStatus = service.requiresDeposit
        ? AppointmentStatus.PENDING_PAYMENT
        : AppointmentStatus.PENDING;

      // ── Faz 21.9: isTestBooking tespiti (hizmet katmanı — app logic değil) ─
      // TRIAL tenant'ın ilk randevusu test olarak işaretlenir.
      // Koşul: billing.status = TRIAL AND mevcut randevu sayısı = 0
      const billingStatus = tenant.billing?.status;
      const isTestBooking = billingStatus === 'TRIAL'
        ? (await this.prisma.appointment.count({
            where: { tenantId: dto.tenantId, isDeleted: false },
          })) === 0
        : false;

      if (isTestBooking) {
        this.logger.log(`[isTestBooking] İlk test randevusu tespit edildi: tenant=${dto.tenantId}`);
      }

      // ── 5. Randevu oluştur ─────────────────────────────────────────────────
      // Faz 23 Phase 1: holdId varsa hold-based commit; yoksa legacy direct commit.
      // Phase 3'te legacy yol kaldırılacak, holdId zorunlu hale gelecek.

      let appointment;
      let holdRedisKey: string | undefined;

      const appointmentData = {
        customerId:   customer.id,
        staffId:      dto.staffId,
        serviceId:    dto.serviceId,
        locationId:   dto.locationId,
        startTime:    startTime.toISOString(),
        endTime:      endTime.toISOString(),
        source:       'ONLINE' as const,
        notes:        dto.notes,
        totalPrice:   Number(service.price),
        status:       initialStatus,
        isTestBooking,
      };

      if (dto.holdId) {
        // ── Hold-based commit (Faz 23) ─────────────────────────────────────
        // consumeHold + randevu insert aynı DB transaction → atomik geçiş.
        // holdId: ACTIVE → CONSUMED, ardından randevu INSERT (GIST son güvence).
        // Redis hold key commit SONRASI silinir (tx dışında — atomik değil ama best-effort).
        try {
          appointment = await this.prisma.$transaction(async (tx) => {
            const consumed = await this.holdService.consumeHold(
              dto.holdId!,
              dto.tenantId,
              tx,
            );
            holdRedisKey = consumed.redisKey;

            return this.appointments.create(
              dto.tenantId,
              appointmentData,
              'public-booking',
              tx,
            );
          });
        } catch (err) {
          if (err instanceof ConflictException) throw err;
          throw err;
        }

        // Post-commit: Redis hold key'i hemen sil (TTL'yi bekleme).
        // Slot artık randevuyla dolu; Redis key stale kalsa bile availability
        // appointment overlap filtresiyle doğru sonuç verir.
        if (holdRedisKey) {
          await this.holdService.deleteHoldRedisKey(holdRedisKey);
        }
      } else {
        // ── Legacy direct commit (Faz 16 — Phase 3'te kaldırılacak) ────────
        try {
          appointment = await this.appointments.create(
            dto.tenantId,
            appointmentData,
            'public-booking',
          );
        } catch (err) {
          if (err instanceof ConflictException) throw err;
          throw err;
        }
      }

      // ── 5a. Canonical URL bileşenleri ────────────────────────────────────
      const citySlug    = location.city ? slugify(location.city) : null;
      const serviceSlug = slugify(service.name);

      this.logger.log(
        `Public booking: appt=${appointment.id} | tenant=${dto.tenantId} | staff=${dto.staffId}`,
      );

      // ── 6. Faz 18: Referral işleme — fire and forget (senkron hızı koruma) ─
      if (dto.referralCode && isNewCustomer) {
        void this.referralQueue
          .add('process-referral', {
            tenantId:           dto.tenantId,
            referredCustomerId: customer.id,
            referralCode:       dto.referralCode,
            appointmentId:      appointment.id,
          })
          .catch((err: unknown) =>
            this.logger.error(
              `Referral queue error: ${String(err)} | appt=${appointment.id}`,
            ),
          );
      }

      return {
        appointmentId: appointment.id,
        startTime:     appointment.startTime.toISOString(),
        endTime:       appointment.endTime.toISOString(),
        service:  { name: service.name, durationMin: service.durationMin },
        staff:    { firstName: staff.firstName, lastName: staff.lastName },
        location: { name: location.name },
        // Faz 18: Referral
        referralCode: isNewCustomer ? (customer.referralCode ?? undefined) : undefined,
        salonSlug:    tenant.slug,
        // Faz 19: Ödeme akışı + canonical URL
        requiresPayment: service.requiresDeposit,
        citySlug,
        serviceSlug,
      };
    });
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // YARDIMCI: Tüm aktif tenant slugları (sitemap için)
  // ═══════════════════════════════════════════════════════════════════════════

  async getAllActiveSlugs(): Promise<string[]> {
    const tenants = await this.prisma.tenant.findMany({
      where:  { isDeleted: false, status: { in: [TenantStatus.ACTIVE] } },
      select: { slug: true },
    });
    return tenants.map((t) => t.slug);
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // ÖZEL YARDIMCILAR
  // ═══════════════════════════════════════════════════════════════════════════

  /**
   * Verilen tenantId ile AsyncLocalStorage context'i başlatır.
   * Tüm Prisma sorguları bu blok içinde otomatik tenant filtresi alır.
   */
  private runInContext<T>(tenantId: string, fn: () => Promise<T>): Promise<T> {
    return new Promise<T>((resolve, reject) => {
      tenantContext.run(
        { tenantId, userId: 'public', userRole: 'PUBLIC' },
        () => fn().then(resolve).catch(reject),
      );
    });
  }

  /**
   * Bir günün slot adaylarını üretir.
   * Interval: 30 dk. Her slot serviceDuration kadar uzar.
   * Mola saatlerini de atlar.
   */
  private generateSlotCandidates(
    date:              string,
    startTime:         string, // "09:00"
    endTime:           string, // "18:00"
    durationMin:       number,
    breakStart:        string | null,
    breakEnd:          string | null,
  ): SlotDto[] {
    const toMins = (t: string) => {
      const [h, m] = t.split(':').map(Number);
      return h! * 60 + m!;
    };

    const startMins   = toMins(startTime);
    const endMins     = toMins(endTime);
    const breakStartM = breakStart ? toMins(breakStart) : null;
    const breakEndM   = breakEnd   ? toMins(breakEnd)   : null;

    const slots: SlotDto[] = [];
    const INTERVAL = 30; // dk

    for (let m = startMins; m + durationMin <= endMins; m += INTERVAL) {
      const slotEnd = m + durationMin;

      // Mola ile çakışıyor mu? (tam veya kısmi örtüşme)
      if (breakStartM !== null && breakEndM !== null) {
        // Slot [m, slotEnd] ve mola [breakStartM, breakEndM] örtüşürse atla
        if (m < breakEndM && slotEnd > breakStartM) continue;
      }

      const [dateYear, dateMonth, dateDay] = date.split('-').map(Number);
      const slotStartH = Math.floor(m / 60);
      const slotStartM = m % 60;
      const slotEndH   = Math.floor(slotEnd / 60);
      const slotEndM   = slotEnd % 60;

      const isoStart = new Date(
        Date.UTC(dateYear!, dateMonth! - 1, dateDay!, slotStartH, slotStartM, 0),
      ).toISOString();
      const isoEnd = new Date(
        Date.UTC(dateYear!, dateMonth! - 1, dateDay!, slotEndH, slotEndM, 0),
      ).toISOString();

      slots.push({ startTime: isoStart, endTime: isoEnd });
    }

    return slots;
  }

  /**
   * Bir slot adayının dolu slot listesiyle çakışıp çakışmadığını kontrol eder.
   */
  private overlapsAny(
    slot:     SlotDto,
    occupied: { startTime: string; endTime: string; status: string }[],
  ): boolean {
    const s = new Date(slot.startTime).getTime();
    const e = new Date(slot.endTime).getTime();

    return occupied.some((occ) => {
      const os = new Date(occ.startTime).getTime();
      const oe = new Date(occ.endTime).getTime();
      // Örtüşme: start < occEnd && end > occStart
      return s < oe && e > os;
    });
  }
}
