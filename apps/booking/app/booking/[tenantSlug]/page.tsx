'use client';

/**
 * P10.3 — Minimal Booking Flow (P10.3.1: slug-first contract)
 * Route: /booking/[tenantSlug]
 *
 * Steps: service → date+slot → customer form → success
 *
 * tenantId backend'e ASLA gönderilmez — tek giriş noktası slug.
 */

import { use, useEffect, useState } from 'react';

const API = '/api/v1/public';

// ── Types ──────────────────────────────────────────────────────────────────────

interface Salon {
  name:     string;
  location: { id: string } | null;
}

interface Service {
  id:          string;
  name:        string;
  durationMin: number;
  price:       string;
  currency:    string;
}

interface Staff {
  id:        string;
  firstName: string;
  lastName:  string;
}

interface Slot {
  startTime: string;
  endTime:   string;
}

// ── Page ───────────────────────────────────────────────────────────────────────

export default function BookingPage({
  params,
}: {
  params: Promise<{ tenantSlug: string }>;
}) {
  const { tenantSlug } = use(params);

  const [salon, setSalon]         = useState<Salon | null>(null);
  const [services, setServices]   = useState<Service[]>([]);
  const [service, setService]     = useState<Service | null>(null);
  const [staff, setStaff]         = useState<Staff[]>([]);
  const [date, setDate]           = useState('');
  const [slots, setSlots]         = useState<Slot[]>([]);
  const [slot, setSlot]           = useState<Slot | null>(null);
  const [firstName, setFirstName] = useState('');
  const [lastName, setLastName]   = useState('');
  const [phone, setPhone]         = useState('');
  const [loading, setLoading]     = useState(false);
  const [error, setError]         = useState('');
  const [success, setSuccess]     = useState(false);

  // ── Step 1: Load salon + services (slug-first) ─────────────────────────────

  useEffect(() => {
    fetch(`${API}/salon/${tenantSlug}`)
      .then((r) => r.ok ? r.json() : null)
      .then((s: Salon | null) => {
        if (!s) { setError('Salon bulunamadı.'); return; }
        setSalon(s);
        // slug gönder — tenantId asla frontend'de olmaz
        return fetch(`${API}/services?slug=${tenantSlug}`)
          .then((r) => r.json() as Promise<Service[]>)
          .then(setServices);
      })
      .catch(() => setError('Bağlantı hatası.'));
  }, [tenantSlug]);

  // ── Step 2: Load staff when service selected (slug-first) ─────────────────

  useEffect(() => {
    if (!service) return;
    fetch(`${API}/staff?slug=${tenantSlug}`)
      .then((r) => r.json() as Promise<Staff[]>)
      .then(setStaff)
      .catch(() => {});
  }, [tenantSlug, service]);

  // ── Step 3: Load slots when date selected (slug-first) ────────────────────

  useEffect(() => {
    if (!service || !date || staff.length === 0) return;
    const staffId = staff[0]!.id;
    const url = `${API}/availability?slug=${tenantSlug}&staffId=${staffId}&date=${date}&serviceDurationMin=${service.durationMin}`;
    fetch(url)
      .then((r) => r.json() as Promise<Slot[]>)
      .then(setSlots)
      .catch(() => setSlots([]));
  }, [tenantSlug, service, date, staff]);

  // ── Submit (slug-first — tenantId body'de YOK) ────────────────────────────

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
          slug:       tenantSlug,   // ← tenantId değil, slug gönder
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
        const err = await res.json().catch(() => ({})) as { message?: string };
        throw new Error(err.message ?? 'Randevu oluşturulamadı.');
      }
      setSuccess(true);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Hata oluştu.');
    } finally {
      setLoading(false);
    }
  }

  // ── Render ─────────────────────────────────────────────────────────────────

  if (error && !salon) {
    return <div className="p-8 text-red-600">{error}</div>;
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
          onClick={() => { setSuccess(false); setSlot(null); setService(null); setDate(''); }}
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
      </section>

      {/* STEP 2: Date + Slots */}
      {service && (
        <section>
          <h2 className="text-lg font-semibold mb-3">Tarih seçin</h2>
          <input
            type="date"
            value={date}
            min={new Date().toISOString().slice(0, 10)}
            onChange={(e) => { setDate(e.target.value); setSlot(null); }}
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
              placeholder="Ad"
              value={firstName}
              onChange={(e) => setFirstName(e.target.value)}
              className="w-full border rounded px-3 py-2"
            />
            <input
              required
              placeholder="Soyad"
              value={lastName}
              onChange={(e) => setLastName(e.target.value)}
              className="w-full border rounded px-3 py-2"
            />
            <input
              required
              placeholder="Telefon"
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
              className="w-full border rounded px-3 py-2"
            />
            {error && <p className="text-red-600 text-sm">{error}</p>}
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
