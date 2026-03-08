/**
 * SCHEDULING AVAILABILITY SERVICE — Faz 23
 * ─────────────────────────────────────────────────────────────────────────────
 * AppointmentAvailabilityService'i sarmalayarak Faz 23 katmanlarını ekler:
 *
 *   1. Timezone-aware gün sınırı  — toUtcRangeForLocalDay (Luxon, DST-safe)
 *   2. Doğru yerel haftaiçi      — utcToDayOfWeek (UTC instant → tenant tz weekday)
 *   3. LEAVE/BLOCK vardiya çıkarma — subtractShifts (StaffShift tablosundan)
 *   4. Aktif hold çıkarma         — DB range overlap (appointment_holds ACTIVE)
 *   5. Legacy Redis hold filtresi — AppointmentLockService.getHeldSlots (Faz 20 uyumu)
 *
 * Mevcut AppointmentAvailabilityService (60s Redis cache) korunur —
 * bu servis onun üstünde bir katman olarak çalışır.
 *
 * PublicService.getAvailability() bu servise delege eder.
 * ─────────────────────────────────────────────────────────────────────────────
 */

import { Injectable, Logger } from '@nestjs/common';
import { PrismaService }                   from '../../../common/prisma.service';
import { AppointmentAvailabilityService }  from './appointment-availability.service';
import { AppointmentLockService }          from './appointment-lock.service';
import {
  SlotDto,
  toUtcRangeForLocalDay,
  utcToDayOfWeek,
  generateSlotCandidates,
  overlapsAny,
  subtractShifts,
} from '../../../common/scheduling.utils';

@Injectable()
export class SchedulingAvailabilityService {
  private readonly logger = new Logger(SchedulingAvailabilityService.name);

  constructor(
    private readonly prisma:        PrismaService,
    private readonly availability:  AppointmentAvailabilityService,
    private readonly lockService:   AppointmentLockService,
  ) {}

  // ── getAvailableSlots ─────────────────────────────────────────────────────

  /**
   * Belirtilen gün ve personel için müsait randevu slotlarını döner.
   *
   * Pipeline:
   *   1. Tenant timezone'una göre UTC gün sınırlarını hesapla
   *   2. Yerel gün (DayOfWeek) → çalışma saatini getir
   *   3. 30 dk aralıklı slot adayları üret (mola dahil)
   *   4. LEAVE/BLOCK vardiyaları çıkar
   *   5. Dolu randevuları çıkar (AppointmentAvailabilityService cache)
   *   6. Aktif ve süresi dolmamış hold'ları çıkar (DB range overlap)
   *   7. Legacy Redis hold kilitleri çıkar (Faz 20 geriye uyumluluk)
   *
   * @param tenantId          Tenant kimliği
   * @param staffId           Personel kimliği
   * @param date              'YYYY-MM-DD' — tenant timezone'undaki yerel tarih
   * @param timezone          Tenant timezone (örn: 'Europe/Istanbul')
   * @param serviceDurationMin Hizmet süresi (dakika)
   * @returns                 Müsait slot listesi (ISO 8601 UTC)
   */
  async getAvailableSlots(
    tenantId:           string,
    staffId:            string,
    date:               string,
    timezone:           string,
    serviceDurationMin: number,
  ): Promise<SlotDto[]> {
    // ── 1. UTC gün sınırları ──────────────────────────────────────────────
    // DST-safe: Luxon yerel gece yarısını UTC'ye çevirir.
    const { start: utcStart, end: utcEnd } = toUtcRangeForLocalDay(date, timezone);

    // ── 2. Çalışma saati ──────────────────────────────────────────────────
    // utcToDayOfWeek: UTC instant → tenant timezone'unda yerel haftaiçi enum'u
    // Pazar gece yarısı işlemleri için kritik (UTC pazartesi = yerel pazar)
    const dayEnum = utcToDayOfWeek(utcStart, timezone);

    const wh = await this.prisma.staffWorkingHour.findUnique({
      where: { staffId_dayOfWeek: { staffId, dayOfWeek: dayEnum } },
    });

    if (!wh || !wh.isWorkingDay) {
      this.logger.debug(
        `getAvailableSlots: çalışma saati yok (staffId=${staffId}, date=${date}, day=${dayEnum})`,
      );
      return [];
    }

    // ── 3. Slot adayları ──────────────────────────────────────────────────
    // generateSlotCandidates: 30 dk aralıklı, mola dahil slot üreteci
    // Çalışma saatleri HH:MM string olarak gelir (timezone-naive — sayısal işlem)
    const candidates = generateSlotCandidates(
      date,
      wh.startTime,
      wh.endTime,
      serviceDurationMin,
      wh.breakStart ?? null,
      wh.breakEnd   ?? null,
    );

    if (candidates.length === 0) return [];

    // ── 4. LEAVE/BLOCK vardiyaları çıkar ──────────────────────────────────
    // StaffShift.shiftType IN ['LEAVE', 'BLOCK'] olan vardiyaları filtrele.
    // Vardiya tarih alanı DB'de `date` (Date türü) — UTC gün sınırıyla eşleştir.
    const shifts = await this.prisma.staffShift.findMany({
      where: {
        tenantId,
        staffId,
        shiftType: { in: ['LEAVE', 'BLOCK'] },
        // Gün sınırı: UTC [utcStart, utcEnd) range overlap
        startTime: { lt: utcEnd   },
        endTime:   { gt: utcStart },
      },
      select: { startTime: true, endTime: true },
    });

    const afterShifts = subtractShifts(candidates, shifts);

    if (afterShifts.length === 0) return [];

    // ── 5. Dolu randevuları çıkar ─────────────────────────────────────────
    // AppointmentAvailabilityService: 60s Redis cache + DB fallback.
    // date: YYYY-MM-DD (UTC — cache key formatına uygun)
    const occupied = await this.availability.getOccupiedSlots(tenantId, staffId, date);

    const afterOccupied = afterShifts.filter(
      (slot) => !overlapsAny(slot, occupied),
    );

    if (afterOccupied.length === 0) return [];

    // ── 6. Aktif hold'ları çıkar ──────────────────────────────────────────
    // DB range overlap: ACTIVE + expiresAt > now + gün sınırı içinde.
    // expiresAt > now: cron gecikmesi olan süresi dolmuş hold'ları filtreler.
    const activeHolds = await this.prisma.appointmentHold.findMany({
      where: {
        tenantId,
        staffId,
        status:    'ACTIVE',
        expiresAt: { gt: new Date() }, // süresi dolmamış
        startTime: { lt: utcEnd   },   // hold günden önce bitmemiş
        endTime:   { gt: utcStart },   // hold günde başlamış veya devam ediyor
      },
      select: { startTime: true, endTime: true },
    });

    const afterHolds = afterOccupied.filter((slot) => {
      const slotStart = new Date(slot.startTime).getTime();
      const slotEnd   = new Date(slot.endTime).getTime();
      return !activeHolds.some((h) => {
        const holdStart = h.startTime.getTime();
        const holdEnd   = h.endTime.getTime();
        // Range overlap: slot.start < hold.end AND slot.end > hold.start
        return slotStart < holdEnd && slotEnd > holdStart;
      });
    });

    if (afterHolds.length === 0) return [];

    // ── 7. Legacy Redis hold kilitleri (Faz 20 geriye uyumluluk) ─────────
    // AppointmentLockService.getHeldSlots() eski SETNX hold key'lerini okur.
    // Faz 23'te DB-backed hold'lar birincil mekanizma; bu katman geçiş sürecinde
    // DB hold'u olmayan eski hold key'lerini de filtreler.
    const heldStartTimes = await this.lockService
      .getHeldSlots(tenantId, staffId, date)
      .catch(() => [] as string[]);

    const heldSet = new Set(heldStartTimes);

    const freeSlots = heldSet.size === 0
      ? afterHolds
      : afterHolds.filter((slot) => !heldSet.has(slot.startTime));

    this.logger.debug(
      `getAvailableSlots: ${candidates.length} aday → ${freeSlots.length} müsait ` +
      `(shifts=${shifts.length}, occupied=${occupied.length}, holds=${activeHolds.length}) ` +
      `staffId=${staffId} date=${date}`,
    );

    return freeSlots;
  }
}
