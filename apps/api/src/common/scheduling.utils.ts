/**
 * SCHEDULING UTILS — Faz 23
 * ─────────────────────────────────────────────────────────────────────────────
 * Timezone-aware slot hesaplama ve availability yardımcıları.
 * Luxon kullanılır — DST-safe, sıfır belirsizlik.
 *
 * Dışa aktarılan fonksiyonlar:
 *   toUtcRangeForLocalDay  — Yerel tarihi UTC [start, end) aralığına çevirir
 *   utcToDayOfWeek         — UTC instant → tenant timezone yerel haftaiçi enum'u
 *   toLocalDateKey         — UTC Date → 'YYYY-MM-DD' (tenant timezone'unda)
 *   generateSlotCandidates — Çalışma saati ve molaya göre aday slotları üret
 *   overlapsAny            — Slot adayının dolu slotlarla çakışma kontrolü
 *   subtractShifts         — LEAVE/BLOCK vardiyaları slot listesinden çıkar
 * ─────────────────────────────────────────────────────────────────────────────
 */

import { DateTime } from 'luxon';
import { DayOfWeek } from '@prisma/client';

// ── Slot arayüzü (PublicService ile uyumlu) ───────────────────────────────
export interface SlotDto {
  startTime: string; // ISO 8601 UTC
  endTime:   string; // ISO 8601 UTC
}

// ── toUtcRangeForLocalDay ─────────────────────────────────────────────────

/**
 * Tenant timezone'undaki yerel bir tarihin UTC [start, end) aralığını döner.
 * DST-güvenli: Luxon DateTime zone-aware parse yapar.
 *
 * @param dateStr  'YYYY-MM-DD' (tenant yerel tarihi)
 * @param timezone 'Europe/Istanbul', 'UTC', vb.
 *
 * @example
 *   toUtcRangeForLocalDay('2026-01-31', 'Europe/Istanbul')
 *   // UTC: 2026-01-30T21:00:00Z .. 2026-01-31T21:00:00Z (+03:00)
 */
export function toUtcRangeForLocalDay(
  dateStr:  string,
  timezone: string,
): { start: Date; end: Date } {
  const localMidnight = DateTime.fromISO(dateStr, { zone: timezone }).startOf('day');
  const localEnd      = localMidnight.plus({ days: 1 });

  return {
    start: localMidnight.toUTC().toJSDate(),
    end:   localEnd.toUTC().toJSDate(),
  };
}

// ── utcToDayOfWeek ────────────────────────────────────────────────────────

/**
 * UTC Date nesnesini tenant timezone'unda Prisma DayOfWeek enum değerine çevirir.
 * StaffWorkingHour.dayOfWeek lookup'ında kullanılır.
 *
 * Luxon weekday: 1=Mon, 2=Tue, ..., 7=Sun
 * Prisma DayOfWeek: MON, TUE, ..., SUN
 */
export function utcToDayOfWeek(utcDate: Date, timezone: string): DayOfWeek {
  const localDay = DateTime.fromJSDate(utcDate, { zone: timezone }).weekday;
  const map: Record<number, DayOfWeek> = {
    1: DayOfWeek.MON,
    2: DayOfWeek.TUE,
    3: DayOfWeek.WED,
    4: DayOfWeek.THU,
    5: DayOfWeek.FRI,
    6: DayOfWeek.SAT,
    7: DayOfWeek.SUN,
  };
  return map[localDay]!;
}

// ── toLocalDateKey ────────────────────────────────────────────────────────

/**
 * UTC Date nesnesini tenant timezone'unda 'YYYY-MM-DD' string'ine dönüştürür.
 * Availability cache key için kullanılır.
 * UTC slice'ın aksine gece yarısı sınırlarını doğru işler.
 *
 * @example
 *   toLocalDateKey(new Date('2026-01-31T22:00Z'), 'Europe/Istanbul')
 *   → '2026-02-01'  // +03:00 → 01:00 yerel saat
 */
export function toLocalDateKey(utcDate: Date, timezone: string): string {
  return DateTime.fromJSDate(utcDate, { zone: timezone }).toFormat('yyyy-MM-dd');
}

// ── generateSlotCandidates ────────────────────────────────────────────────

/**
 * Verilen gün için 30 dakika aralıklı slot adaylarını üretir.
 * Her slot serviceDurationMin kadar uzar.
 * Mola saatlerini atlar (kısmi örtüşme dahil).
 *
 * NOT: Mevcut mantık timezone-naive UTC timestamp kullanır.
 * Tenant timezone'u getAvailability katmanında zaten işlenir (yerel gün → UTC range).
 * Çalışma saatleri de "HH:MM" string formatında locale-independent gelir.
 *
 * @param date              'YYYY-MM-DD' (tenant yerel tarihi)
 * @param workStart         "09:00"
 * @param workEnd           "18:00"
 * @param durationMin       Hizmet süresi (dakika)
 * @param breakStart        "12:00" | null
 * @param breakEnd          "13:00" | null
 */
export function generateSlotCandidates(
  date:        string,
  workStart:   string,
  workEnd:     string,
  durationMin: number,
  breakStart:  string | null,
  breakEnd:    string | null,
): SlotDto[] {
  const toMins = (t: string): number => {
    const [h, m] = t.split(':').map(Number);
    return h! * 60 + m!;
  };

  const startMins   = toMins(workStart);
  const endMins     = toMins(workEnd);
  const breakStartM = breakStart ? toMins(breakStart) : null;
  const breakEndM   = breakEnd   ? toMins(breakEnd)   : null;

  const [dateYear, dateMonth, dateDay] = date.split('-').map(Number);
  const INTERVAL = 30; // dk

  const slots: SlotDto[] = [];

  for (let m = startMins; m + durationMin <= endMins; m += INTERVAL) {
    const slotEnd = m + durationMin;

    // Mola ile çakışıyor mu? (tam veya kısmi örtüşme)
    if (breakStartM !== null && breakEndM !== null) {
      if (m < breakEndM && slotEnd > breakStartM) continue;
    }

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

// ── overlapsAny ───────────────────────────────────────────────────────────

/**
 * Bir slot adayının verilen dolu slot listesiyle çakışıp çakışmadığını kontrol eder.
 * Range overlap: slot.start < occ.end && slot.end > occ.start
 */
export function overlapsAny(
  slot:     SlotDto,
  occupied: Array<{ startTime: string | Date; endTime: string | Date }>,
): boolean {
  const s = new Date(slot.startTime).getTime();
  const e = new Date(slot.endTime).getTime();

  return occupied.some((occ) => {
    const os = new Date(occ.startTime).getTime();
    const oe = new Date(occ.endTime).getTime();
    // Örtüşme: slot başlamadan önce bitiyor mu? Hayır → çakışma var.
    return s < oe && e > os;
  });
}

// ── subtractShifts ────────────────────────────────────────────────────────

/**
 * LEAVE/BLOCK tipi vardiyaları slot listesinden çıkarır.
 * Bir slot vardiya süresiyle herhangi bir örtüşme varsa filtrelenir.
 *
 * @param slots   generateSlotCandidates'tan gelen aday listesi
 * @param shifts  StaffShift kayıtları (shiftType LEAVE veya BLOCK olanlar)
 */
export function subtractShifts(
  slots:  SlotDto[],
  shifts: Array<{ startTime: Date; endTime: Date }>,
): SlotDto[] {
  if (shifts.length === 0) return slots;

  return slots.filter((slot) => !overlapsAny(slot, shifts));
}
