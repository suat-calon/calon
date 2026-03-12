/**
 * PUBLIC BOOKING API CLIENT — Faz 16 + Faz 17
 * ──────────────────────────────────────────────────────────────────────────────
 * Faz 16: Salon booking fetch sarmalayıcıları.
 * Faz 17: Discovery marketplace fetch sarmalayıcıları.
 *
 * Server Component'lerde Next.js Data Cache (revalidate) aktif.
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
  tenantId:     string;
  locationId:   string;
  staffId:      string;
  serviceId:    string;
  startTime:    string;
  firstName:    string;
  lastName:     string;
  phone:        string;
  email?:       string;
  notes?:       string;
  // Faz 18: Referral kodu (?ref= query parametresinden)
  referralCode?: string;
}

export interface BookingResult {
  appointmentId: string;
  startTime:     string;
  endTime:       string;
  service:  { name: string; durationMin: number };
  staff:    { firstName: string; lastName: string };
  location: { name: string };
  // Faz 18: Referral — yeni müşteriye üretilen kod + salon slug
  referralCode?: string;
  salonSlug:     string;
  // Faz 19: Ödeme motor entegrasyonu
  requiresPayment: boolean;
  citySlug:        string | null;
  serviceSlug:     string | null;
}

// ── Faz 19: Ödeme ─────────────────────────────────────────────────────────────

export interface CreatePaymentPayload {
  appointmentId: string;
  buyerName:     string;
  buyerEmail:    string;
}

export interface CreatePaymentResult {
  paymentUrl: string;
  paymentId:  string;
}

export async function createPayment(
  payload: CreatePaymentPayload,
): Promise<CreatePaymentResult> {
  const res = await fetch(`${API_BASE}/public/payments/create`, {
    method:  'POST',
    headers: { 'Content-Type': 'application/json' },
    body:    JSON.stringify(payload),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({})) as { message?: string };
    throw new Error(err.message ?? 'Ödeme başlatılamadı.');
  }
  return res.json() as Promise<CreatePaymentResult>;
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

// ═══════════════════════════════════════════════════════════════════════════════
// FAZ 17 TİPLERİ — Discovery
// ═══════════════════════════════════════════════════════════════════════════════

export interface CityDto {
  city:  string;
  count: number;
}

export interface ServiceDiscoveryDto {
  name:  string;
  slug:  string;
  count: number;
}

export interface SalonCardDto {
  id:         string;
  name:       string;
  slug:       string;
  logoUrl:    string | null;
  brandColor: string | null;
  location: {
    name:    string;
    address: string | null;
    city:    string | null;
    phone:   string | null;
  } | null;
  serviceNames: string[];
}

export interface SitemapDiscoveryDto {
  cities:            string[];
  cityServices:      { city: string; serviceSlug: string }[];
  citySalonServices: { city: string; serviceSlug: string; salonSlug: string }[];
}

// ═══════════════════════════════════════════════════════════════════════════════
// FAZ 17 API FONKSİYONLARI — Discovery
// ═══════════════════════════════════════════════════════════════════════════════

export async function fetchCities(): Promise<CityDto[]> {
  try {
    const res = await fetch(`${API_BASE}/public/discovery/cities`, {
      next: { revalidate: 3600 },
    });
    if (!res.ok) return [];
    return res.json() as Promise<CityDto[]>;
  } catch {
    return [];
  }
}

export async function fetchDiscoveryServices(): Promise<ServiceDiscoveryDto[]> {
  try {
    const res = await fetch(`${API_BASE}/public/discovery/services`, {
      next: { revalidate: 3600 },
    });
    if (!res.ok) return [];
    return res.json() as Promise<ServiceDiscoveryDto[]>;
  } catch {
    return [];
  }
}

export async function fetchCitySalons(city: string): Promise<SalonCardDto[]> {
  try {
    const res = await fetch(
      `${API_BASE}/public/discovery/city/${encodeURIComponent(city)}`,
      { next: { revalidate: 3600 } },
    );
    if (!res.ok) return [];
    return res.json() as Promise<SalonCardDto[]>;
  } catch {
    return [];
  }
}

export async function fetchCityServiceSalons(
  city:        string,
  serviceSlug: string,
): Promise<SalonCardDto[]> {
  try {
    const res = await fetch(
      `${API_BASE}/public/discovery/service/${encodeURIComponent(city)}/${encodeURIComponent(serviceSlug)}`,
      { next: { revalidate: 3600 } },
    );
    if (!res.ok) return [];
    return res.json() as Promise<SalonCardDto[]>;
  } catch {
    return [];
  }
}

export async function fetchSitemapDiscovery(): Promise<SitemapDiscoveryDto | null> {
  try {
    const res = await fetch(`${API_BASE}/public/discovery/sitemap-data`, {
      next: { revalidate: 3600 },
    });
    if (!res.ok) return null;
    return res.json() as Promise<SitemapDiscoveryDto>;
  } catch {
    return null;
  }
}
