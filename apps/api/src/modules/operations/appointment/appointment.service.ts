/**
 * APPOINTMENT SERVICE
 * ─────────────────────────────────────────────────────────────────────────────
 * İş kuralları:
 *   • create()       — GIST exclusion constraint ihlalini ConflictException'a çevirir;
 *                      Prisma kaydı başarılı olunca Redis hold kilidini siler
 *   • updateStatus() — XState ile geçiş doğrular, AuditLog yazar, COMPLETED'da stok kuyruğu tetikler
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

import { PrismaService }              from '../../../common/prisma.service';
import { QUEUE_NAMES }                from '../../../common/redis.module';
import { LedgerService }              from '../../finance/ledger.service';
import { CommissionService }          from '../../staff/commission.service';
import { AppointmentLockService }     from './appointment-lock.service';
import { isValidTransition }          from './appointment.machine';
import { CreateAppointmentDto }       from './dto/create-appointment.dto';
import { UpdateAppointmentStatusDto } from './dto/update-appointment-status.dto';

// ── GIST yardımcısı ───────────────────────────────────────────────────────────

/**
 * PostgreSQL GIST exclusion constraint ihlalini (23P01) tespit eder.
 * Prisma P2010 "raw query failed" kodu veya mesajdaki 23P01 değeri kontrol edilir.
 */
function isGistExclusionViolation(err: unknown): boolean {
  // Prisma'nın sarmaladığı bilinen istek hatası
  if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2010') {
    const meta = err.meta as { code?: string; message?: string } | undefined;
    if (meta?.code === '23P01') return true;
    if (meta?.message?.includes('23P01')) return true;
  }
  // Güvenlik ağı: ham hata mesajında 23P01 kontrolü
  if (err instanceof Error && err.message.includes('23P01')) return true;
  return false;
}

// ── Servis ────────────────────────────────────────────────────────────────────

@Injectable()
export class AppointmentService {
  constructor(
    private readonly prisma:      PrismaService,
    private readonly ledger:      LedgerService,
    private readonly lock:        AppointmentLockService,
    private readonly commission:  CommissionService,
    @InjectQueue(QUEUE_NAMES.STOCK_DEDUCT)
    private readonly inventoryQueue: Queue,
  ) {}

  // ── create ──────────────────────────────────────────────────────────────────

  /**
   * Yeni randevu oluşturur.
   *
   * Adımlar:
   *   1. Prisma'ya randevu kaydı oluştur
   *      → GIST exclusion constraint ihlali → ConflictException (çakışan saat/personel/oda)
   *   2. Başarılı kayıt sonrası Redis hold kilidini sil (releaseSlot)
   *      → TTL dolmuş veya kilit hiç açılmamışsa DEL no-op yapar (güvenli)
   */
  async create(
    tenantId: string,
    dto:      CreateAppointmentDto,
    actorId?: string,
  ): Promise<Appointment> {
    let appointment: Appointment;

    try {
      appointment = await this.prisma.appointment.create({
        data: {
          tenantId,
          customerId:    dto.customerId,
          staffId:       dto.staffId,
          serviceId:     dto.serviceId,
          locationId:    dto.locationId,
          roomId:        dto.roomId,
          startTime:     new Date(dto.startTime),
          endTime:       new Date(dto.endTime),
          source:        dto.source,
          notes:         dto.notes,
          internalNotes: dto.internalNotes,
          totalPrice:    dto.totalPrice,
          depositPaid:   dto.depositPaid,
        },
      });
    } catch (err: unknown) {
      if (isGistExclusionViolation(err)) {
        throw new ConflictException(
          'Seçilen saat bu personel veya oda için müsait değil',
        );
      }
      throw err;
    }

    // ── Adım 2: Prisma kaydı başarılı → Redis hold kilidini kaldır ─────────
    // staffId ve startTime, DTO'dan doğrudan alınır.
    // releaseSlot hata fırlatmaz (DEL idempotent'tir).
    await this.lock.releaseSlot(tenantId, dto.staffId, dto.startTime);

    return appointment;
  }

  // ── updateStatus ────────────────────────────────────────────────────────────

  /**
   * Randevu durumunu günceller.
   *
   * Adımlar:
   *   1. findUnique ile mevcut durumu al (middleware dışı → manuel tenantId kontrolü)
   *   2. XState isValidTransition() ile geçiş doğrula
   *   3. $transaction: appointment.update + auditLog.create atomik
   *   4. COMPLETED → inventoryQueue 'deduct-stock' işi
   */
  async updateStatus(
    tenantId:  string,
    id:        string,
    dto:       UpdateAppointmentStatusDto,
    actorId?:  string,
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
          // İptal edildiyse ek alanlar
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

      // ── XState COMPLETED → Deftere kayıt + Hakediş (Faz 6 Adım 3 / Faz 9 Adım 3) ──
      // 1. Ledger: ADJUSTMENT tipiyle finansal kayıt
      // 2. CommissionService: personel hakedişini hesapla + logla
      //    Her iki işlem aynı $transaction içinde; birinde hata → tam rollback.
      if (dto.status === AppointmentStatus.COMPLETED) {
        const totalAmount = appt.totalPrice ?? new Prisma.Decimal(0);

        // ── 3a. Ledger kaydı ──────────────────────────────────────────────────
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

        // ── 3b. Hakediş hesapla + logla (staffId null ise atlanır) ────────────
        // commissionRate === 0 veya personel bulunamazsa CommissionService
        // null döner ya da NotFoundException fırlatır → rollback tetiklenir.
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
      }

      return appt;
    });

    // ── 4. COMPLETED → stok düşme kuyruğu ───────────────────────────────────
    if (dto.status === AppointmentStatus.COMPLETED) {
      await this.inventoryQueue.add('deduct-stock', {
        appointmentId: id,
        tenantId,
        serviceId:     updated.serviceId,
      });
    }

    return updated;
  }
}
