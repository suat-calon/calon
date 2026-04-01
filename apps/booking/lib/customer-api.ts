/**
 * CUSTOMER PORTAL API CLIENT — Phase 1
 * ──────────────────────────────────────────────────────────────────────────────
 * Client-side fetch'ler — customer portal components'te kullanılır.
 * Cookie-based auth (calon_customer HttpOnly cookie).
 */

const API_BASE = '/api/v1';

// ── Tipler ──────────────────────────────────────────────────────────────────

export interface CustomerProfile {
  id:            string;
  firstName:     string;
  lastName:      string;
  phone:         string | null;
  email:         string | null;
  loyaltyTier:   'BRONZE' | 'SILVER' | 'GOLD' | 'PLATINUM';
  loyaltyPoints: number;
  createdAt:     string;
}

export interface CustomerAppointment {
  id:        string;
  startTime: string;
  endTime:   string;
  status:    string;
  notes:     string | null;
  cancelledAt:        string | null;
  cancellationReason: string | null;
  service:  { id: string; name: string; durationMin: number; price: string; currency: string };
  staff:    { id: string; firstName: string; lastName: string; title: string | null; colorHex: string | null };
  location: { id: string; name: string; address: string; city: string; phone: string | null };
}

export interface AppointmentDetail extends CustomerAppointment {
  createdAt: string;
}

// ── Auth ────────────────────────────────────────────────────────────────────

export async function requestOtp(slug: string, phone: string): Promise<{ message: string; otpCode?: string }> {
  const res = await fetch(`${API_BASE}/public/customer/request-otp`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ slug, phone }),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.message ?? 'OTP isteği başarısız.');
  }
  return res.json();
}

export async function verifyOtp(slug: string, phone: string, otpCode: string): Promise<void> {
  const res = await fetch(`${API_BASE}/public/customer/verify-otp`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    credentials: 'include',
    body: JSON.stringify({ slug, phone, otpCode }),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.message ?? 'Doğrulama başarısız.');
  }
}

// ── Portal data ─────────────────────────────────────────────────────────────

export async function fetchCustomerMe(): Promise<CustomerProfile | null> {
  const res = await fetch(`${API_BASE}/public/customer/me`, { credentials: 'include' });
  if (res.status === 401) return null;
  if (!res.ok) return null;
  return res.json();
}

export async function fetchCustomerAppointments(
  status: 'upcoming' | 'past',
): Promise<CustomerAppointment[]> {
  const res = await fetch(`${API_BASE}/public/customer/appointments?status=${status}`, {
    credentials: 'include',
  });
  if (!res.ok) return [];
  return res.json();
}

export async function fetchAppointmentDetail(id: string): Promise<AppointmentDetail | null> {
  const res = await fetch(`${API_BASE}/public/customer/appointments/${id}`, {
    credentials: 'include',
  });
  if (!res.ok) return null;
  return res.json();
}

export async function cancelAppointment(id: string): Promise<boolean> {
  const res = await fetch(`${API_BASE}/public/customer/appointments/${id}/cancel`, {
    method: 'PATCH',
    credentials: 'include',
  });
  return res.ok;
}
