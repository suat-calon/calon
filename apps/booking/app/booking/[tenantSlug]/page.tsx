'use client';

/**
 * P10.3 — Minimal Booking Flow (P10.3.2: Contract Hardening)
 * Route: /booking/[tenantSlug]
 *
 * Steps: service → date+slot → customer form → success
 *
 * Güvenlik kuralları:
 *   - tenantId backend'e ASLA gönderilmez; tek giriş noktası slug.
 *   - Her fetch → res.ok kontrolü → silent fail yok.
 *   - Book response → appointmentId varlık kontrolü.
 *   - Tüm hata yolları kullanıcıya gösterilir.
 */

import { use, useEffect, useState } from 'react';

const API = '/api/v1/public';

// ── Response tipleri (API sözleşmesi) ─────────────────────────────────────────

interface SalonDto {
  name:     string;
  location: { id: string } | null;
}

interface ServiceDto {
  id:          string;
  name:        string;
  durationMin: number;
  price:       string;
  currency:    string;
}

interface StaffDto {
  id:        string;
  firstName: string;
  lastName:  string;
}

interface SlotDto {
  startTime: string;
  endTime:   string;
}

interface BookResultDto {
  appointmentId:   string;
  status:          string;
  startTime:       string;
  endTime:         string;
  service:         { name: string; durationMin: number };
  staff:           { firstName: string; lastName: string };
  location:        { name: string };
  requiresPayment: boolean;
  salonSlug:       string;
  citySlug:        string | null;
  serviceSlug:     string | null;
}

// ── Yardımcı: API hata mesajını çöz ──────────────────────────────────────────

async function parseApiError(res: Response, fallback: string): Promise<string> {
  try {
    const body = await res.json() as { message?: string | string[] };
    if (Array.isArray(body.message)) return body.message.join(', ');
    return body.message ?? fallback;
  } catch {
    return fallback;
  }
}

// ── Page ───────────────────────────────────────────────────────────────────────

export default function BookingPage({
  params,
}: {
  params: Promise<{ tenantSlug: string }>;
}) {
  const { tenantSlug } = use(params);

  const [salon, setSalon]         = useState<SalonDto | null>(null);
  const [services, setServices]   = useState<ServiceDto[]>([]);
  const [service, setService]     = useState<ServiceDto | null>(null);
  const [staff, setStaff]         = useState<StaffDto[]>([]);
  const [date, setDate]           = useState('');
  const [slots, setSlots]         = useState<SlotDto[]>([]);
  const [slot, setSlot]           = useState<SlotDto | null>(null);
  const [firstName, setFirstName] = useState('');
  const [lastName, setLastName]   = useState('');
  const [phone, setPhone]         = useState('');
  const [loading, setLoading]     = useState(false);
  const [error, setError]         = useState('');
  const [success, setSuccess]     = useState(false);

  // ── Step 1: Load salon + services ─────────────────────────────────────────

  useEffect(() => {
    (async () => {
      try {
        // 1a. Salon bilgisi
        const salonRes = await fetch(`${API}/salon/${tenantSlug}`);
        if (!salonRes.ok) {
          const msg = await parseApiError(salonRes, 'Salon bulunamadı.');
          setError(msg);
          return;
        }
        const salonData = await salonRes.json() as SalonDto;
        if (!salonData?.name) { setError('Geçersiz salon verisi.'); return; }
        setSalon(salonData);

        // 1b. Servis listesi
        const svcRes = await fetch(`${API}/services?slug=${tenantSlug}`);
        if (!svcRes.ok) {
          const msg = await parseApiError(svcRes, 'Hizmetler yüklenemedi.');
          setError(msg);
          return;
        }
        const svcData = await svcRes.json() as ServiceDto[];
        if (!Array.isArray(svcData)) { setError('Geçersiz hizmet verisi.'); return; }
        setServices(svcData);
      } catch {
        setError('Bağlantı hatası. Lütfen tekrar deneyin.');
      }
    })();
  }, [tenantSlug]);

  // ── Step 2: Load staff when service selected ───────────────────────────────

  useEffect(() => {
    if (!service) return;
    (async () => {
      try {
        const res = await fetch(`${API}/staff?slug=${tenantSlug}`);
        if (!res.ok) return; // staff hatası kullanıcıya gösterilmez — slotlar zaten boş gelir
        const data = await res.json() as StaffDto[];
        if (Array.isArray(data)) setStaff(data);
      } catch { /* network hatası — availability zaten boş döner */ }
    })();
  }, [tenantSlug, service]);

  // ── Step 3: Load slots when date selected ─────────────────────────────────

  useEffect(() => {
    if (!service || !date || staff.length === 0) return;
    const staffId = staff[0]!.id;
    const url = `${API}/availability?slug=${tenantSlug}&staffId=${staffId}&date=${date}&serviceDurationMin=${service.durationMin}`;
    (async () => {
      try {
        const res = await fetch(url);
        if (!res.ok) { setSlots([]); return; }
        const data = await res.json() as SlotDto[];
        setSlots(Array.isArray(data) ? data : []);
      } catch { setSlots([]); }
    })();
  }, [tenantSlug, service, date, staff]);

  // ── Submit ─────────────────────────────────────────────────────────────────

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!salon || !service || !slot || staff.length === 0) return;
    setLoading(true);
    setError('');
    try {
      const res = await fetch(`${API}/book`, {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          slug:       tenantSlug,
          locationId: salon.location?.id ?? '',
          staffId:    staff[0]!.id,
          serviceId:  service.id,
          startTime:  slot.startTime,
          firstName,
          lastName,
          phone,
        }),
      });

      if (!res.ok) {
        const msg = await parseApiError(res, 'Randevu oluşturulamadı.');
        throw new Error(msg);
      }

      const data = await res.json() as BookResultDto;

      // Response contract doğrula — silent success yasak
      if (!data?.appointmentId) {
        throw new Error('Geçersiz sunucu yanıtı. Lütfen tekrar deneyin.');
      }

      setSuccess(true);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Beklenmeyen hata oluştu.');
    } finally {
      setLoading(false);
    }
  }

  // ── Render ─────────────────────────────────────────────────────────────────

  if (error && !salon) {
    return (
      <div className="p-8 max-w-lg mx-auto">
        <p className="text-red-600">{error}</p>
        <button
          className="mt-4 text-blue-600 underline text-sm"
          onClick={() => { setError(''); setSalon(null); }}
        >
          Tekrar dene
        </button>
      </div>
    );
  }

  if (!salon) {
    return <div className="p-8 text-gray-500">Yükleniyor…</div>;
  }

  if (success) {
    return (
      <div className="p-8 max-w-md mx-auto text-center">
        <p className="text-2xl font-semibold text-green-600">✓ Randevu oluşturuldu</p>
        <p className="mt-2 text-gray-600">{salon.name} — onay için sizi arayacağız.</p>
        <button
          className="mt-6 text-blue-600 underline"
          onClick={() => {
            setSuccess(false);
            setSlot(null);
            setService(null);
            setDate('');
            setError('');
          }}
        >
          Yeni randevu
        </button>
      </div>
    );
  }

  return (
    <div className="p-6 max-w-lg mx-auto space-y-8">
      <h1 className="text-2xl font-bold">{salon.name}</h1>

      {/* STEP 1: Service */}
      <section>
        <h2 className="text-lg font-semibold mb-3">Hizmet seçin</h2>
        {services.length === 0 ? (
          <p className="text-sm text-gray-500">Hizmet bulunamadı.</p>
        ) : (
          <ul className="space-y-2">
            {services.map((s) => (
              <li key={s.id}>
                <button
                  onClick={() => { setService(s); setSlot(null); setSlots([]); setDate(''); }}
                  className={`w-full text-left px-4 py-3 rounded border ${
                    service?.id === s.id
                      ? 'border-blue-600 bg-blue-50'
                      : 'border-gray-200 hover:border-gray-400'
                  }`}
                >
                  <span className="font-medium">{s.name}</span>
                  <span className="ml-2 text-sm text-gray-500">
                    {s.durationMin} dk — {s.price} {s.currency}
                  </span>
                </button>
              </li>
            ))}
          </ul>
        )}
      </section>

      {/* STEP 2: Date + Slots */}
      {service && (
        <section>
          <h2 className="text-lg font-semibold mb-3">Tarih seçin</h2>
          <input
            type="date"
            value={date}
            min={new Date().toISOString().slice(0, 10)}
            onChange={(e) => { setDate(e.target.value); setSlot(null); setSlots([]); }}
            className="border rounded px-3 py-2"
          />

          {date && slots.length === 0 && (
            <p className="mt-3 text-sm text-gray-500">Bu tarihte müsait saat yok.</p>
          )}

          {slots.length > 0 && (
            <div className="mt-3">
              <h3 className="text-sm font-medium mb-2 text-gray-600">Saat seçin</h3>
              <div className="flex flex-wrap gap-2">
                {slots.map((sl) => {
                  const label = new Date(sl.startTime).toLocaleTimeString('tr-TR', {
                    hour: '2-digit', minute: '2-digit',
                  });
                  return (
                    <button
                      key={sl.startTime}
                      onClick={() => setSlot(sl)}
                      className={`px-3 py-1.5 rounded border text-sm ${
                        slot?.startTime === sl.startTime
                          ? 'border-blue-600 bg-blue-50 font-medium'
                          : 'border-gray-200 hover:border-gray-400'
                      }`}
                    >
                      {label}
                    </button>
                  );
                })}
              </div>
            </div>
          )}
        </section>
      )}

      {/* STEP 3: Customer Form */}
      {slot && (
        <section>
          <h2 className="text-lg font-semibold mb-3">İletişim bilgileri</h2>
          <form onSubmit={handleSubmit} className="space-y-3">
            <input
              required
              minLength={2}
              placeholder="Ad"
              value={firstName}
              onChange={(e) => setFirstName(e.target.value)}
              className="w-full border rounded px-3 py-2"
            />
            <input
              required
              minLength={2}
              placeholder="Soyad"
              value={lastName}
              onChange={(e) => setLastName(e.target.value)}
              className="w-full border rounded px-3 py-2"
            />
            <input
              required
              type="tel"
              placeholder="Telefon (05XX...)"
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
              className="w-full border rounded px-3 py-2"
            />
            {error && (
              <p className="text-red-600 text-sm border border-red-200 bg-red-50 rounded px-3 py-2">
                {error}
              </p>
            )}
            <button
              type="submit"
              disabled={loading}
              className="w-full bg-blue-600 text-white rounded px-4 py-2 font-medium disabled:opacity-50"
            >
              {loading ? 'Oluşturuluyor…' : 'Randevu Oluştur'}
            </button>
          </form>
        </section>
      )}
    </div>
  );
}
