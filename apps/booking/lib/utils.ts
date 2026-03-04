import { clsx, type ClassValue } from 'clsx';
import { twMerge }               from 'tailwind-merge';

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

/** "2026-03-15T10:00:00.000Z" → "10:00" (UTC saat) */
export function formatTime(iso: string): string {
  const d = new Date(iso);
  return d.toISOString().slice(11, 16);
}

/** "2026-03-15T10:00:00.000Z" → "15 Mart 2026" (tr-TR) */
export function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString('tr-TR', {
    day:   'numeric',
    month: 'long',
    year:  'numeric',
    timeZone: 'UTC',
  });
}

/** "120" → "2 sa." */
export function formatDuration(minutes: number): string {
  if (minutes < 60) return `${minutes} dk.`;
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  return m > 0 ? `${h} sa. ${m} dk.` : `${h} sa.`;
}

/** Ondalık sayıyı para formatına çevirir */
export function formatPrice(price: string, currency = 'TRY'): string {
  return new Intl.NumberFormat('tr-TR', {
    style:                 'currency',
    currency,
    minimumFractionDigits: 0,
    maximumFractionDigits: 2,
  }).format(parseFloat(price));
}

/** YYYY-MM-DD formatında bugünün tarihini döner */
export function todayIso(): string {
  return new Date().toISOString().slice(0, 10);
}

/** ISO date string → YYYY-MM-DD */
export function toDateStr(iso: string): string {
  return new Date(iso).toISOString().slice(0, 10);
}
