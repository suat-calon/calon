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
} from '@nestjs/common';
import { InjectQueue }      from '@nestjs/bull';
import { Queue }            from 'bull';
import {
  Prisma,
  Appointment,
  AppointmentStatus,
  TransactionType,
} from '@prisma/client';

import { PrismaService }                  from '../../../common/prisma.service';
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

// ── GIST / Deadlock yardımcıları ─────────────────────────────────────────────

/**
 * PostgreSQL GIST exclusion constraint ihlalini (23P01) tespit eder.
 * Prisma P2010 "raw query failed" kodu veya mesajdaki 23P01 değeri kontrol edilir.
 */
function isGistExclusionViolation(err: unknown): boolean {
  if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2010') {
    const meta = err.meta as { code?: string; message?: string } | undefined;
    if (meta?.code === '23P01') return true;
    if (meta?.message?.includes('23P01')) return true;
  }
  if (err instanceof Error && err.message.includes('23P01')) return true;
  return false;
}

/**
 * PostgreSQL deadlock (40P01) tespit eder.
 * Yüksek eşzamanlılıkta GIST yarışı sırasında oluşabilir.
 */
function isDeadlock(err: unknown): boolean {
  if (err instanceof Error && err.message.includes('40P01')) return true;
  if (err instanceof Error && err.message.toLowerCase().includes('deadlock')) return true;
  return false;
}

// ── Raw SQL overlap kontrolü ──────────────────────────────────────────────────

/**
 * Belirli bir personel için zaman aralığında aktif randevu çakışması kontrolü.
 * GIST constraint'e ek olarak transaction içinde çalışan yazılımsal güvenlik katmanı.
 *
 * @param excludeId  Reschedule'da mevcut randevunun kendi ID'si — çakışma sayılmaz
 */
async function checkOverlapRaw(
  tx:        Prisma.TransactionClient,
  tenantId:  string,
  staffId:   string,
  startTime: Date,
  endTime:   Date,
  excludeId?: string,
): Promise<void> {
  // Not: tenantId ve staffId UUID sütunlarıdır; PostgreSQL text=$1 ile karşılaştıramaz.
  // ::uuid cast ile parametre, sütun tipiyle uyumlu hale getirilir.
  // FAZ 14.1: Filtre, GIST constraint'i ile birebir hizalı olmalı:
  // CANCELLED ve NO_SHOW dışla; isDeleted=false zorunlu.
  // Not: COMPLETED dışlanmaz — tamamlanmış randevular slotu bloke eder (GIST ile aynı semantik).
  const rows = excludeId
    ? await tx.$queryRaw<{ id: string }[]>`
        SELECT id FROM appointments
        WHERE
          "tenantId" = ${tenantId}::uuid
          AND "staffId" = ${staffId}::uuid
          AND "isDeleted" = false
          AND status NOT IN ('CANCELLED', 'NO_SHOW')
          AND tsrange("startTime", "endTime") && tsrange(${startTime}::timestamp, ${endTime}::timestamp)
          AND id <> ${excludeId}::uuid
        LIMIT 1
      `
    : await tx.$queryRaw<{ id: string }[]>`
        SELECT id FROM appointments
        WHERE
          "tenantId" = ${tenantId}::uuid
          AND "staffId" = ${staffId}::uuid
          AND "isDeleted" = false
          AND status NOT IN ('CANCELLED', 'NO_SHOW')
          AND tsrange("startTime", "endTime") && tsrange(${startTime}::timestamp, ${endTime}::timestamp)
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
  constructor(
    private readonly prisma:       PrismaService,
    private readonly ledger:       LedgerService,
    private readonly lock:         AppointmentLockService,
    private readonly availability: AppointmentAvailabilityService,
    private readonly commission:   CommissionService,
    @InjectQueue(QUEUE_NAMES.STOCK_DEDUCT)
    private readonly inventoryQueue: Queue,
    @InjectQueue(QUEUE_NAMES.LOYALTY_EARN)
    private readonly loyaltyQueue: Queue,
  ) {}

  // ── create ──────────────────────────────────────────────────────────────────

  /**
   * Yeni randevu oluşturur.
   *
   * Adımlar:
   *   1. Redis concurrency lock al (10s TTL, NX)
   *   2. $transaction: raw SQL overlap kontrolü → appointment INSERT
   *   3. finally: Concurrency lock release
   *   4. Redis hold kilidini sil
   *   5. Availability cache invalidate
   */
  async create(
    tenantId: string,
    dto:      CreateAppointmentDto,
    actorId?: string,
  ): Promise<Appointment> {
    const startTime = new Date(dto.startTime);
    const endTime   = new Date(dto.endTime);

    // ── Adım 1: Concurrency lock al ─────────────────────────────────────────
    // staffId yoksa lock atlanır (GIST NULL güvenli davranır)
    const lockKey = dto.staffId
      ? await this.lock.acquireConcurrencyLock(tenantId, dto.staffId, startTime)
      : null;

    let appointment: Appointment;

    try {
      // ── Adım 2: Transaction: overlap check → INSERT ────────────────────────
      appointment = await this.prisma.$transaction(async (tx) => {
        // Yazılımsal overlap kontrolü (GIST constraint yedekçisi)
        if (dto.staffId) {
          await checkOverlapRaw(tx, tenantId, dto.staffId, startTime, endTime);
        }

        return tx.appointment.create({
          data: {
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
            totalPrice:    dto.totalPrice,
            depositPaid:   dto.depositPaid,
          },
        });
      });
    } catch (err: unknown) {
      if (isGistExclusionViolation(err)) {
        throw new ConflictException(
          'Seçilen saat bu personel veya oda için müsait değil',
        );
      }
      if (isDeadlock(err)) {
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

    // ── Adım 4: Redis hold kilidini kaldır (DEL idempotent) ─────────────────
    if (dto.staffId) {
      await this.lock.releaseSlot(tenantId, dto.staffId, dto.startTime);
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
    const existing = await this.prisma.appointment.findUnique({ where: { id } });

    if (!existing || existing.tenantId !== tenantId || existing.isDeleted) {
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
      updated = await this.prisma.$transaction(async (tx) => {
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

        return appt;
      });
    } catch (err: unknown) {
      if (isGistExclusionViolation(err)) {
        throw new ConflictException(
          'Yeni saat bu personel veya oda için müsait değil',
        );
      }
      if (isDeadlock(err)) {
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
    // ── 1. Randevuyu bul (findUnique middleware'den hariç — manuel tenantId kontrolü) ──
    const existing = await this.prisma.appointment.findUnique({ where: { id } });

    if (!existing || existing.tenantId !== tenantId || existing.isDeleted) {
      throw new NotFoundException('Randevu bulunamadı');
    }

    // ── 2. XState geçiş doğrulaması ──────────────────────────────────────────
    if (!isValidTransition(existing.status, dto.status)) {
      throw new BadRequestException(
        `Geçersiz durum geçişi: ${existing.status} → ${dto.status}`,
      );
    }

    // ── 3. Atomik güncelleme + AuditLog + Ledger (COMPLETED hook) ────────────
    const updated = await this.prisma.$transaction(async (tx: Prisma.TransactionClient) => {
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

      // ── COMPLETED → Deftere kayıt + Hakediş + Loyalty Outbox ──────────────
      if (dto.status === AppointmentStatus.COMPLETED) {
        const totalAmount = appt.totalPrice ?? new Prisma.Decimal(0);

        await this.ledger.record(
          {
            tenantId,
            appointmentId: id,
            type:        TransactionType.ADJUSTMENT,
            amount:      totalAmount,
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
              serviceAmount: totalAmount,
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
