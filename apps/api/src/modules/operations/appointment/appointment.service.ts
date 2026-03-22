/**
 * APPOINTMENT SERVICE
 * ─────────────────────────────────────────────────────────────────────────────
 * İş kuralları:
 *   • create()       — Redis concurrency lock → $transaction → raw SQL overlap
 *                      → GIST exclusion constraint → ConflictException
 *   • updateStatus() — XState ile geçiş doğrular, AuditLog yazar,
 *                      COMPLETED'da stok/loyalty kuyruğu tetikler,
 *                      CANCELLED/NO_SHOW'da availability cache invalidate
 *   • reschedule()   — Çift kilit (eski+yeni slot), overlap kontrolü, atomik update
 *
 * Güvenlik:
 *   • findUnique Prisma middleware'inden hariç tutulmuştur → tenantId manuel kontrol zorunlu
 *   • tenantId asla body/query'den alınmaz; her zaman TenantGuard'dan gelir
 * ─────────────────────────────────────────────────────────────────────────────
 */

import {
  Injectable,
  BadRequestException,
  ConflictException,
  NotFoundException,
  Inject,
  Logger,
} from '@nestjs/common';
import { InjectQueue }      from '@nestjs/bull';
import { Queue }            from 'bull';
import {
  Appointment,
  AppointmentStatus,
  TransactionType,
  Money,
  DbTransaction,
  isGistExclusionViolation,
  isDeadlockError,
  GistExclusionError,
} from '@calon/database';

import { PrismaService }                  from '../../../common/prisma.service';
import { APPOINTMENT_REPO, IAppointmentRepository } from './appointment.repository.interface';
import { QUEUE_NAMES }                    from '../../../common/redis.module';
import { LedgerService }                  from '../../finance/ledger.service';
import { CommissionService }              from '../../staff/commission.service';
import { AppointmentLockService }         from './appointment-lock.service';
import { AppointmentAvailabilityService } from './appointment-availability.service';
import { isValidTransition }              from './appointment.machine';
import { CreateAppointmentDto }           from './dto/create-appointment.dto';
import { UpdateAppointmentStatusDto }     from './dto/update-appointment-status.dto';
import { RescheduleAppointmentDto }       from './dto/reschedule-appointment.dto';
import { EarnFromAppointmentPayload }     from '../../loyalty/loyalty.service';
// Faz 24: Event & Notification Backbone
import { EventProducerService, EVENT_NAMES } from '../../event/event-producer.service';
import { OutboxRepository }                  from '../../event/outbox.repository';
import { getFullName }                       from '../../../common/string.utils';

/** Default reminder offset dakikası (Faz 24: preference tablosundan alınacak) */
const DEFAULT_REMINDER_OFFSET_MINUTES = 120;
/** Default tenant timezone (Faz 24: tenant tablosundan alınacak) */
const DEFAULT_TENANT_TIMEZONE = 'Europe/Istanbul';

// ── GIST / Deadlock yardımcıları ─────────────────────────────────────────────

// isGistExclusionViolation ve isDeadlockError @calon/database'den import edilir.

// ── Raw SQL overlap kontrolü ──────────────────────────────────────────────────

/**
 * Belirli bir personel için zaman aralığında aktif randevu çakışması kontrolü.
 * GIST constraint'e ek olarak transaction içinde çalışan yazılımsal güvenlik katmanı.
 *
 * @param excludeId  Reschedule'da mevcut randevunun kendi ID'si — çakışma sayılmaz
 */
async function checkOverlapRaw(
  tx:        DbTransaction,
  tenantId:  string,
  staffId:   string,
  startTime: Date,
  endTime:   Date,
  excludeId?: string,
): Promise<void> {
  // Not: tenantId ve staffId UUID sütunlarıdır; PostgreSQL text=$1 ile karşılaştıramaz.
  // ::uuid cast ile parametre, sütun tipiyle uyumlu hale getirilir.
  // FAZ 23 (MVP-EXIT-CORE): Filtre, GIST constraint'i ile birebir hizalı olmalı:
  // CANCELLED, NO_SHOW ve COMPLETED dışla; isDeleted=false zorunlu.
  // COMPLETED randevular slotu serbest bırakır — appt_staff_overlap_excl (faz23) ile aynı semantik.
  const rows = excludeId
    ? await tx.$queryRaw<{ id: string }[]>`
        SELECT id FROM appointments
        WHERE
          "tenantId" = ${tenantId}::uuid
          AND "staffId" = ${staffId}::uuid
          AND "isDeleted" = false
          AND status NOT IN ('CANCELLED', 'NO_SHOW', 'COMPLETED')
          AND tstzrange("startTime", "endTime") && tstzrange(${startTime}::timestamptz, ${endTime}::timestamptz)
          AND id <> ${excludeId}::uuid
        LIMIT 1
      `
    : await tx.$queryRaw<{ id: string }[]>`
        SELECT id FROM appointments
        WHERE
          "tenantId" = ${tenantId}::uuid
          AND "staffId" = ${staffId}::uuid
          AND "isDeleted" = false
          AND status NOT IN ('CANCELLED', 'NO_SHOW', 'COMPLETED')
          AND tstzrange("startTime", "endTime") && tstzrange(${startTime}::timestamptz, ${endTime}::timestamptz)
        LIMIT 1
      `;

  if (rows.length > 0) {
    throw new ConflictException(
      'Seçilen saat bu personel için müsait değil (overlap)',
    );
  }
}

// ── Sabitler ──────────────────────────────────────────────────────────────────

/** Taşınabilir randevu durumları */
const RESCHEDULABLE_STATUSES: AppointmentStatus[] = [
  AppointmentStatus.PENDING,
  AppointmentStatus.CONFIRMED,
];

/** Availability cache'i geçersiz kılması gereken iptal durumları */
const CANCELLATION_STATUSES: AppointmentStatus[] = [
  AppointmentStatus.CANCELLED,
  AppointmentStatus.NO_SHOW,
];

// ── Servis ────────────────────────────────────────────────────────────────────

@Injectable()
export class AppointmentService {
  private readonly logger = new Logger(AppointmentService.name);

  constructor(
    private readonly prisma:         PrismaService,
    private readonly ledger:         LedgerService,
    private readonly lock:           AppointmentLockService,
    private readonly availability:   AppointmentAvailabilityService,
    private readonly commission:     CommissionService,
    private readonly eventProducer:  EventProducerService,
    private readonly outbox:         OutboxRepository,
    @InjectQueue(QUEUE_NAMES.STOCK_DEDUCT)
    private readonly inventoryQueue: Queue,
    @InjectQueue(QUEUE_NAMES.LOYALTY_EARN)
    private readonly loyaltyQueue: Queue,
    @Inject(APPOINTMENT_REPO) private readonly appointmentRepo: IAppointmentRepository,
  ) {}

  // ── findAll ─────────────────────────────────────────────────────────────────

  /**
   * Randevu listesi + filtreleme.
   */
  async findAll(
    tenantId: string,
    filters: {
      startDate?:  string;
      endDate?:    string;
      status?:     string;
      staffId?:    string;
      customerId?: string;
    },
  ): Promise<Appointment[]> {
    return this.appointmentRepo.findAll(tenantId, filters);
  }

  // ── findOne ─────────────────────────────────────────────────────────────────

  /**
   * Randevu detayı + relations.
   */
  async findOne(tenantId: string, id: string) {
    const appointment = await this.appointmentRepo.findByIdWithRelations(id, tenantId);

    if (!appointment) {
      throw new NotFoundException('Randevu bulunamadı');
    }

    return appointment;
  }

  // ── create ──────────────────────────────────────────────────────────────────

  /**
   * Yeni randevu oluşturur.
   *
   * Adımlar (tx yoksa — standart yol):
   *   1. Redis concurrency lock al (10s TTL, NX)
   *   2. $transaction: raw SQL overlap kontrolü → appointment INSERT
   *   3. finally: Concurrency lock release
   *   4. Redis hold kilidini sil (eski SETNX format)
   *   5. Availability cache invalidate
   *
   * tx verilmişse (Faz 23 hold-based commit):
   *   - Caller'ın transaction'ı kullanılır — yeni $transaction açılmaz
   *   - Concurrency lock caller'da yönetilir — burada alınmaz/bırakılmaz
   *   - Redis hold silme caller'da yapılır (DB hold'u için epoch-ms key)
   *   - Availability cache invalidation hâlâ burada yapılır (idempotent)
   *
   * @param tx  Caller transaction client (Faz 23 hold commit — opsiyonel)
   */
  async create(
    tenantId: string,
    dto:      CreateAppointmentDto,
    actorId?: string,
    tx?:      DbTransaction,
  ): Promise<Appointment> {
    const startTime = new Date(dto.startTime);
    const endTime   = new Date(dto.endTime);

    // ── Adım 1: Concurrency lock al ─────────────────────────────────────────
    // tx sağlandıysa caller zaten lock'u yönetiyor → atla
    const lockKey = (!tx && dto.staffId)
      ? await this.lock.acquireConcurrencyLock(tenantId, dto.staffId, startTime)
      : null;

    let appointment: Appointment;

    // ── Faz 24: İlgili entity'leri önceden yükle (tx süresi minimize edilsin) ─
    const [customer, staff, service, location] = await Promise.all([
      dto.customerId ? this.prisma.customer.findFirst({
        where:  { id: dto.customerId, tenantId },
        select: { id: true, firstName: true, lastName: true, phone: true, email: true },
      }) : null,
      dto.staffId ? this.prisma.staffProfile.findFirst({
        where:  { id: dto.staffId, tenantId },
        select: { id: true, firstName: true, lastName: true },
      }) : null,
      dto.serviceId ? this.prisma.service.findFirst({
        where:  { id: dto.serviceId, tenantId },
        select: { id: true, name: true },
      }) : null,
      dto.locationId ? this.prisma.location.findFirst({
        where:  { id: dto.locationId, tenantId },
        select: { id: true, name: true },
      }) : null,
    ]);

    // ── DB işlem mantığını ayrı fonksiyona çıkar (tx reuse için) ─────────────
    const executeInTx = async (db: DbTransaction): Promise<Appointment> => {
      // Yazılımsal overlap kontrolü (GIST constraint yedekçisi)
      if (dto.staffId) {
        const overlap = await this.appointmentRepo.hasOverlap(tenantId, dto.staffId, startTime, endTime);
        if (overlap) {
          throw new ConflictException(
            'Seçilen saat bu personel için müsait değil (overlap)',
          );
        }
      }

      const appt = await this.appointmentRepo.create({
        tenantId,
        customerId:    dto.customerId,
        staffId:       dto.staffId,
        serviceId:     dto.serviceId,
        locationId:    dto.locationId,
        roomId:        dto.roomId,
        startTime,
        endTime,
        source:        dto.source,
        notes:         dto.notes,
        internalNotes: dto.internalNotes,
        totalPrice:    dto.totalPrice as never,
        depositPaid:   dto.depositPaid as never,
        // Faz 19: Opsiyonel başlangıç durumu (PENDING_PAYMENT for deposit flow)
        ...(dto.status !== undefined && { status: dto.status }),
        // Faz 21.9: Test rezervasyonu — public.service.ts tarafından set edilir
        ...(dto.isTestBooking === true && { isTestBooking: true }),
      });

      // ── Faz 24: booking.created outbox event — aynı tx'e yaz ───────────────
      const bookingPayload = {
        bookingId:      appt.id,
        customerId:     appt.customerId,
        customerName:   getFullName(customer?.firstName, customer?.lastName),
        customerPhone:  customer?.phone ?? undefined,
        customerEmail:  customer?.email ?? undefined,
        staffId:        appt.staffId    ?? '',
        staffName:      getFullName(staff?.firstName, staff?.lastName),
        serviceId:      appt.serviceId  ?? '',
        serviceName:    service?.name   ?? '',
        locationName:   location?.name  ?? '',
        startAtUtc:     appt.startTime.toISOString(),
        endAtUtc:       appt.endTime.toISOString(),
        tenantTimezone: DEFAULT_TENANT_TIMEZONE,
        bookingCode:    appt.id.slice(0, 8).toUpperCase(),
      };

      await this.eventProducer.bookingCreated(bookingPayload, tenantId, db);

      // Future reminder: PENDING_PAYMENT hariç tüm randevular için
      if (appt.status !== 'PENDING_PAYMENT') {
        await this.eventProducer.bookingReminderScheduled(
          bookingPayload,
          tenantId,
          appt.startTime,
          DEFAULT_REMINDER_OFFSET_MINUTES,
          db,
        );
      }

      return appt;
    };

    try {
      // ── Adım 2: Transaction: overlap check → INSERT ────────────────────────
      appointment = tx
        ? await executeInTx(tx)                        // caller'ın tx'ini kullan
        : await this.prisma.$tenantTransaction(executeInTx); // kendi tx'ini aç
    } catch (err: unknown) {
      if (err instanceof GistExclusionError || isGistExclusionViolation(err)) {
        throw new ConflictException(
          'Seçilen saat bu personel veya oda için müsait değil',
        );
      }
      if (isDeadlockError(err)) {
        throw new ConflictException(
          'Eşzamanlı istek çakışması — slot meşgul',
        );
      }
      throw err;
    } finally {
      // ── Adım 3: Concurrency lock her durumda release ──────────────────────
      if (lockKey) {
        await this.lock.releaseConcurrencyLock(lockKey);
      }
    }

    // ── Adım 4: Redis hold kilidini kaldır (eski SETNX format — DEL idempotent)
    // tx verilmişse caller zaten Redis temizliğini yönetiyor → atla
    // Redis hatası randevu kaydını etkilemez — yutulur, loglanır
    if (!tx && dto.staffId) {
      try {
        await this.lock.releaseSlot(tenantId, dto.staffId, dto.startTime);
      } catch (e) {
        // Redis DEL başarısız olsa da randevu DB'de commit edildi — güvenli
        this.logger.warn(
          `Redis hold slot release failed after booking commit — TTL will expire ` +
          `(tenantId: ${tenantId}, staffId: ${dto.staffId}, err: ${(e as Error)?.message})`,
        );
      }
    }

    // ── Adım 5: Availability cache invalidate ────────────────────────────────
    if (dto.staffId) {
      await this.availability.invalidate(tenantId, dto.staffId, startTime);
    }

    return appointment;
  }

  // ── reschedule ──────────────────────────────────────────────────────────────

  /**
   * Randevuyu yeni bir saat dilimine taşır.
   *
   * Adımlar:
   *   1. Randevuyu bul + tenant/durum doğrula
   *   2. Redis: eski slot lock → yeni slot lock
   *   3. $transaction:
   *      a. SELECT FOR UPDATE (row lock)
   *      b. Raw SQL overlap kontrolü (mevcut randevu hariç)
   *      c. startTime/endTime güncelle
   *      d. AuditLog yaz
   *   4. finally: Her iki lock release
   *   5. Availability cache: eski + yeni gün invalidate
   */
  async reschedule(
    tenantId:   string,
    id:         string,
    dto:        RescheduleAppointmentDto,
    actorId?:   string,
    actorRole?: string,
  ): Promise<Appointment> {
    // ── Adım 1: Randevuyu bul ───────────────────────────────────────────────
    const existing = await this.prisma.appointment.findFirst({ where: { id, tenantId } });

    if (!existing || existing.isDeleted) {
      throw new NotFoundException('Randevu bulunamadı');
    }

    if (!RESCHEDULABLE_STATUSES.includes(existing.status)) {
      throw new BadRequestException(
        `Bu randevu taşınamaz: mevcut durum ${existing.status}`,
      );
    }

    const newStartTime = new Date(dto.newStartTime);
    const newEndTime   = new Date(dto.newEndTime);
    const staffId      = existing.staffId;

    // ── Faz 25: booking.rescheduled event için snapshot (tx öncesi, salt okunur) ─
    const [reschCust, reschStf, reschSvc, reschTenant] = await Promise.all([
      existing.customerId ? this.prisma.customer.findFirst({
        where:  { id: existing.customerId, tenantId },
        select: { firstName: true, lastName: true, phone: true, email: true },
      }) : null,
      existing.staffId ? this.prisma.staffProfile.findFirst({
        where:  { id: existing.staffId, tenantId },
        select: { firstName: true, lastName: true },
      }) : null,
      existing.serviceId ? this.prisma.service.findFirst({
        where:  { id: existing.serviceId, tenantId },
        select: { name: true },
      }) : null,
      this.prisma.tenant.findFirst({
        where:  { id: tenantId },
        select: { timezone: true },
      }),
    ]);

    // ── Adım 2: Çift concurrency lock ───────────────────────────────────────
    // staffId null ise kilit atlanır
    const oldLockKey = staffId
      ? await this.lock.acquireConcurrencyLock(tenantId, staffId, existing.startTime)
      : null;

    const isSameSlot =
      existing.startTime.toISOString() === newStartTime.toISOString();

    let newLockKey: string | null = null;

    if (staffId && !isSameSlot) {
      try {
        newLockKey = await this.lock.acquireConcurrencyLock(
          tenantId, staffId, newStartTime,
        );
      } catch (err) {
        if (oldLockKey) await this.lock.releaseConcurrencyLock(oldLockKey);
        throw err;
      }
    }

    let updated: Appointment;

    try {
      // ── Adım 3: Transaction ─────────────────────────────────────────────
      updated = await this.prisma.$tenantTransaction(async (tx) => {
        // 3a. Row lock — başka transaction aynı satırı değiştiremesin
        await tx.$queryRaw`
          SELECT id FROM appointments
          WHERE id = ${id}::uuid
          FOR UPDATE
        `;

        // 3b. Overlap kontrolü — mevcut randevuyu dışla
        if (staffId) {
          await checkOverlapRaw(
            tx, tenantId, staffId, newStartTime, newEndTime,
            id, // excludeId: kendinle çakışma sayılmaz
          );
        }

        // 3c. Güncelle
        const appt = await tx.appointment.update({
          where: { id },
          data: {
            startTime: newStartTime,
            endTime:   newEndTime,
          },
        });

        // 3d. AuditLog
        await tx.auditLog.create({
          data: {
            tenantId,
            entityType: 'Appointment',
            entityId:   id,
            action:     'RESCHEDULED',
            actorId:    actorId   ?? undefined,
            actorRole:  actorRole ?? undefined,
            before: {
              startTime: existing.startTime.toISOString(),
              endTime:   existing.endTime.toISOString(),
            },
            after: {
              startTime: newStartTime.toISOString(),
              endTime:   newEndTime.toISOString(),
              reason:    dto.reason ?? null,
            },
          },
        });

        // 3e. booking.rescheduled outbox event (Faz 25)
        await this.eventProducer.bookingRescheduled(
          {
            bookingId:      id,
            customerId:     existing.customerId ?? '',
            customerName:   getFullName(reschCust?.firstName, reschCust?.lastName),
            customerPhone:  reschCust?.phone   ?? undefined,
            customerEmail:  reschCust?.email   ?? undefined,
            staffId:        staffId             ?? '',
            staffName:      getFullName(reschStf?.firstName, reschStf?.lastName),
            serviceId:      existing.serviceId  ?? '',
            serviceName:    reschSvc?.name      ?? '',
            locationName:   '',
            startAtUtc:     newStartTime.toISOString(),
            endAtUtc:       newEndTime.toISOString(),
            tenantTimezone: reschTenant?.timezone ?? DEFAULT_TENANT_TIMEZONE,
            oldStartAtUtc:  existing.startTime.toISOString(),
            oldEndAtUtc:    existing.endTime.toISOString(),
          },
          tenantId,
          tx as DbTransaction,
        );

        return appt;
      });
    } catch (err: unknown) {
      if (isGistExclusionViolation(err)) {
        throw new ConflictException(
          'Yeni saat bu personel veya oda için müsait değil',
        );
      }
      if (isDeadlockError(err)) {
        throw new ConflictException(
          'Eşzamanlı istek çakışması — yeni slot meşgul',
        );
      }
      throw err;
    } finally {
      // ── Adım 4: Kilitleri release ────────────────────────────────────────
      if (oldLockKey) await this.lock.releaseConcurrencyLock(oldLockKey);
      if (newLockKey) await this.lock.releaseConcurrencyLock(newLockKey);
    }

    // ── Adım 5: Availability cache invalidate (eski + yeni gün) ─────────────
    if (staffId) {
      await this.availability.invalidateMany(
        tenantId, staffId, [existing.startTime, newStartTime],
      );
    }

    return updated;
  }

  // ── updateStatus ────────────────────────────────────────────────────────────

  /**
   * Randevu durumunu günceller.
   *
   * Adımlar:
   *   1. findUnique ile mevcut durumu al (middleware dışı → manuel tenantId kontrolü)
   *   2. XState isValidTransition() ile geçiş doğrula
   *   3. $transaction: appointment.update + auditLog.create atomik
   *   4. COMPLETED → inventoryQueue + loyaltyQueue
   *   5. CANCELLED/NO_SHOW → availability cache invalidate
   */
  async updateStatus(
    tenantId:   string,
    id:         string,
    dto:        UpdateAppointmentStatusDto,
    actorId?:   string,
    actorRole?: string,
  ): Promise<Appointment> {
    // ── 1. Randevuyu bul — findFirst + tenantId filtresi enjekte edilir ──────
    const existing = await this.prisma.appointment.findFirst({ where: { id, tenantId } });

    if (!existing || existing.isDeleted) {
      throw new NotFoundException('Randevu bulunamadı');
    }

    // ── 2. XState geçiş doğrulaması ──────────────────────────────────────────
    if (!isValidTransition(existing.status, dto.status)) {
      throw new BadRequestException(
        `Geçersiz durum geçişi: ${existing.status} → ${dto.status}`,
      );
    }

    // ── Faz 24/25: Status event'leri için customer/staff/service snapshot ────────
    // CANCELLED, COMPLETED ve NO_SHOW durum geçişleri için ortak snapshot yükle.
    const needsSnapshot =
      dto.status === AppointmentStatus.CANCELLED ||
      dto.status === AppointmentStatus.COMPLETED  ||
      dto.status === AppointmentStatus.NO_SHOW;

    type StatusSnapshot = {
      customerName: string; customerPhone?: string; customerEmail?: string;
      staffName: string; serviceName: string;
    };
    let cancelSnapshot:     StatusSnapshot | null = null;
    let completionSnapshot: StatusSnapshot | null = null;

    if (needsSnapshot) {
      const [cust, stf, svc] = await Promise.all([
        existing.customerId ? this.prisma.customer.findFirst({
          where: { id: existing.customerId, tenantId }, select: { firstName: true, lastName: true, phone: true, email: true },
        }) : null,
        existing.staffId ? this.prisma.staffProfile.findFirst({
          where: { id: existing.staffId, tenantId }, select: { firstName: true, lastName: true },
        }) : null,
        existing.serviceId ? this.prisma.service.findFirst({
          where: { id: existing.serviceId, tenantId }, select: { name: true },
        }) : null,
      ]);
      const snap: StatusSnapshot = {
        customerName:  getFullName(cust?.firstName, cust?.lastName),
        customerPhone: cust?.phone ?? undefined,
        customerEmail: cust?.email ?? undefined,
        staffName:     getFullName(stf?.firstName, stf?.lastName),
        serviceName:   svc?.name   ?? '',
      };
      if (dto.status === AppointmentStatus.CANCELLED) {
        cancelSnapshot = snap;
      } else {
        completionSnapshot = snap;
      }
    }

    // ── 3. Atomik güncelleme + AuditLog + Ledger (COMPLETED hook) ────────────
    const updated = await this.prisma.$tenantTransaction(async (tx: DbTransaction) => {
      const appt = await tx.appointment.update({
        where: { id },
        data: {
          status: dto.status,
          ...(dto.status === AppointmentStatus.CANCELLED && {
            cancelledAt:        new Date(),
            cancellationReason: dto.cancellationReason ?? undefined,
          }),
        },
      });

      await tx.auditLog.create({
        data: {
          tenantId,
          entityType: 'Appointment',
          entityId:   id,
          action:     dto.status,
          actorId:    actorId   ?? undefined,
          actorRole:  actorRole ?? undefined,
          before:     { status: existing.status },
          after:      { status: dto.status },
        },
      });

      // ── Faz 24: booking.cancelled outbox event + reminder iptal (tx içinde) ─
      if (dto.status === AppointmentStatus.CANCELLED && cancelSnapshot) {
        await this.eventProducer.bookingCancelled(
          {
            bookingId:           appt.id,
            customerId:          appt.customerId,
            customerName:        cancelSnapshot.customerName,
            customerPhone:       cancelSnapshot.customerPhone,
            customerEmail:       cancelSnapshot.customerEmail,
            staffId:             appt.staffId ?? '',
            staffName:           cancelSnapshot.staffName,
            serviceId:           appt.serviceId ?? '',
            serviceName:         cancelSnapshot.serviceName,
            locationName:        '',
            startAtUtc:          appt.startTime.toISOString(),
            endAtUtc:            appt.endTime.toISOString(),
            tenantTimezone:      DEFAULT_TENANT_TIMEZONE,
            cancellationReason:  dto.cancellationReason ?? undefined,
            cancelledAt:         new Date().toISOString(),
          },
          tenantId,
          tx,
        );
        // Bekleyen reminder event'lerini aynı tx içinde iptal et.
        // Tx commit olmadan önce CANCELLED olursa dispatch asla göremez.
        await this.outbox.cancelByAggregateId(tenantId, appt.id, EVENT_NAMES.BOOKING_REMINDER_DUE, tx);
      }

      // ── COMPLETED → Deftere kayıt + Hakediş + Loyalty Outbox ──────────────
      if (dto.status === AppointmentStatus.COMPLETED) {
        if (!appt.totalPrice) {
          throw new BadRequestException('Tamamlanacak randevunun toplam tutarı girilmemiş');
        }
        const totalAmount = new Money(appt.totalPrice.toString());

        await this.ledger.record(
          {
            tenantId,
            appointmentId: id,
            type:        TransactionType.ADJUSTMENT,
            amount:      totalAmount.toString(),
            description: `XState tamamlama kaydı — Randevu: ${id}`,
          },
          tx,
        );

        if (appt.staffId) {
          await this.commission.calculateAndLogCommission(
            {
              tenantId,
              staffId:       appt.staffId,
              appointmentId: id,
              serviceAmount: totalAmount.toString(),
            },
            tx,
          );
        }

        const loyaltyIdempotencyKey =
          `${tenantId}:${id}:LOYALTY_EARNED_APPOINTMENT:v1`;

        await tx.auditLog.create({
          data: {
            tenantId,
            entityType: 'Appointment',
            entityId:   id,
            action:     'LOYALTY_EARN_REQUESTED',
            actorId:    actorId   ?? undefined,
            actorRole:  actorRole ?? undefined,
            after: {
              idempotencyKey: loyaltyIdempotencyKey,
              customerId:     appt.customerId,
              totalPrice:     String(totalAmount),
            },
          },
        });

        // Faz 25: booking.completed outbox event
        if (completionSnapshot) {
          await this.eventProducer.bookingCompleted(
            {
              bookingId:      appt.id,
              customerId:     appt.customerId ?? '',
              customerName:   completionSnapshot.customerName,
              customerPhone:  completionSnapshot.customerPhone,
              customerEmail:  completionSnapshot.customerEmail,
              staffId:        appt.staffId    ?? '',
              staffName:      completionSnapshot.staffName,
              serviceId:      appt.serviceId  ?? '',
              serviceName:    completionSnapshot.serviceName,
              locationName:   '',
              startAtUtc:     appt.startTime.toISOString(),
              endAtUtc:       appt.endTime.toISOString(),
              tenantTimezone: DEFAULT_TENANT_TIMEZONE,
              status:         appt.status,
            },
            tenantId,
            tx,
          );
        }
      }

      // ── Faz 25: booking.no_show outbox event ────────────────────────────────
      if (dto.status === AppointmentStatus.NO_SHOW && completionSnapshot) {
        await this.eventProducer.bookingNoShow(
          {
            bookingId:      appt.id,
            customerId:     appt.customerId ?? '',
            customerName:   completionSnapshot.customerName,
            customerPhone:  completionSnapshot.customerPhone,
            customerEmail:  completionSnapshot.customerEmail,
            staffId:        appt.staffId    ?? '',
            staffName:      completionSnapshot.staffName,
            serviceId:      appt.serviceId  ?? '',
            serviceName:    completionSnapshot.serviceName,
            locationName:   '',
            startAtUtc:     appt.startTime.toISOString(),
            endAtUtc:       appt.endTime.toISOString(),
            tenantTimezone: DEFAULT_TENANT_TIMEZONE,
            status:         appt.status,
          },
          tenantId,
          tx,
        );
      }

      return appt;
    });

    // ── 4. COMPLETED → stok düşme + puan kazanımı kuyruğu ───────────────────
    if (dto.status === AppointmentStatus.COMPLETED) {
      await this.inventoryQueue.add('deduct-stock', {
        appointmentId: id,
        tenantId,
        serviceId:     updated.serviceId,
      });

      const loyaltyPayload: EarnFromAppointmentPayload = {
        tenantId,
        customerId:     updated.customerId,
        appointmentId:  id,
        totalPrice:     String(updated.totalPrice ?? '0'),
        idempotencyKey: `${tenantId}:${id}:LOYALTY_EARNED_APPOINTMENT:v1`,
      };
      await this.loyaltyQueue.add('earn-points', loyaltyPayload);
    }

    // ── 5. CANCELLED/NO_SHOW → availability cache invalidate ─────────────────
    if (
      CANCELLATION_STATUSES.includes(dto.status as AppointmentStatus) &&
      existing.staffId
    ) {
      await this.availability.invalidate(
        tenantId, existing.staffId, existing.startTime,
      );
    }

    return updated;
  }
}
