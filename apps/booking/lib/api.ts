/**
 * PUBLIC BOOKING API CLIENT — Faz 16
 * ──────────────────────────────────────────────────────────────────────────────
 * Server Component ve Client Component tarafından kullanılan fetch sarmalayıcıları.
 * Server Component'lerde Next.js Data Cache (revalidate: 60) aktif.
 */

const API_BASE =
  typeof window === 'undefined'
    ? (process.env['NEXT_PUBLIC_API_URL'] ?? 'http://localhost:4000') + '/api/v1'
    : '/api/v1'; // Client-side: next.config.ts proxy

// ── Tipler ────────────────────────────────────────────────────────────────────

export interface SalonDto {
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

export interface ServiceDto {
  id:           string;
  name:         string;
  description:  string | null;
  durationMin:  number;
  price:        string;
  currency:     string;
  categoryName: string;
}

export interface StaffDto {
  id:         string;
  firstName:  string;
  lastName:   string;
  title:      string | null;
  avatarUrl:  string | null;
  colorHex:   string;
  serviceIds: string[];
}

export interface SlotDto {
  startTime: string;
  endTime:   string;
}

export interface BookingPayload {
  tenantId:   string;
  locationId: string;
  staffId:    string;
  serviceId:  string;
  startTime:  string;
  firstName:  string;
  lastName:   string;
  phone:      string;
  email?:     string;
  notes?:     string;
}

export interface BookingResult {
  appointmentId: string;
  startTime:     string;
  endTime:       string;
  service:  { name: string; durationMin: number };
  staff:    { firstName: string; lastName: string };
  location: { name: string };
}

// ── API Fonksiyonları ─────────────────────────────────────────────────────────

export async function fetchSalon(slug: string): Promise<SalonDto | null> {
  try {
    const res = await fetch(`${API_BASE}/public/salon/${slug}`, {
      next: { revalidate: 60 },
    });
    if (res.status === 404) return null;
    if (!res.ok) throw new Error(`Salon fetch failed: ${res.status}`);
    return res.json() as Promise<SalonDto>;
  } catch {
    return null;
  }
}

export async function fetchServices(tenantId: string): Promise<ServiceDto[]> {
  const res = await fetch(`${API_BASE}/public/services?tenantId=${tenantId}`, {
    next: { revalidate: 60 },
  });
  if (!res.ok) return [];
  return res.json() as Promise<ServiceDto[]>;
}

export async function fetchStaff(tenantId: string): Promise<StaffDto[]> {
  const res = await fetch(`${API_BASE}/public/staff?tenantId=${tenantId}`, {
    next: { revalidate: 60 },
  });
  if (!res.ok) return [];
  return res.json() as Promise<StaffDto[]>;
}

export async function fetchAvailability(
  tenantId:          string,
  staffId:           string,
  date:              string,
  serviceDurationMin: number,
): Promise<SlotDto[]> {
  const url =
    `${API_BASE}/public/availability` +
    `?tenantId=${tenantId}&staffId=${staffId}&date=${date}&serviceDurationMin=${serviceDurationMin}`;
  const res = await fetch(url, { cache: 'no-store' }); // Slot'lar gerçek zamanlı
  if (!res.ok) return [];
  return res.json() as Promise<SlotDto[]>;
}

export async function createBooking(payload: BookingPayload): Promise<BookingResult> {
  const res = await fetch(`${API_BASE}/public/book`, {
    method:  'POST',
    headers: { 'Content-Type': 'application/json' },
    body:    JSON.stringify(payload),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({})) as { message?: string };
    throw new Error(err.message ?? 'Randevu oluşturulamadı.');
  }
  return res.json() as Promise<BookingResult>;
}
