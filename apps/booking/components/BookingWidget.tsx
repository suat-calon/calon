'use client';

/**
 * BOOKING WIDGET — Faz 16
 * ──────────────────────────────────────────────────────────────────────────────
 * Multi-step booking akışı:
 *   Adım 1: Hizmet seç
 *   Adım 2: Personel seç
 *   Adım 3: Tarih seç
 *   Adım 4: Slot seç
 *   Adım 5: Müşteri bilgileri
 *   Adım 6: Onay ekranı
 */

import React, { useState, useCallback, useEffect } from 'react';
import {
  ChevronLeft,
  ChevronRight,
  Clock,
  User,
  Calendar,
  CheckCircle,
  AlertCircle,
  Loader2,
  Scissors,
} from 'lucide-react';

import type { SalonDto, ServiceDto, StaffDto, SlotDto, BookingResult } from '@lib/api';
import { fetchAvailability, createBooking, createPayment }            from '@lib/api';
import {
  cn,
  formatPrice,
  formatDuration,
  formatTime,
  formatDate,
  todayIso,
} from '@lib/utils';

// ── Adım tanımları ────────────────────────────────────────────────────────────

type Step = 'service' | 'staff' | 'date' | 'slot' | 'form' | 'confirm';

const STEPS: { id: Step; label: string }[] = [
  { id: 'service', label: 'Hizmet'   },
  { id: 'staff',   label: 'Personel' },
  { id: 'date',    label: 'Tarih'    },
  { id: 'slot',    label: 'Saat'     },
  { id: 'form',    label: 'Bilgiler' },
  { id: 'confirm', label: 'Onay'     },
];

const STEP_ORDER: Step[] = ['service', 'staff', 'date', 'slot', 'form', 'confirm'];

// ── Sabitler ──────────────────────────────────────────────────────────────────
const SITE_URL = process.env['NEXT_PUBLIC_BOOKING_URL'] ?? 'https://book.calon.com.tr';

// ── Props ─────────────────────────────────────────────────────────────────────

interface BookingWidgetProps {
  salon:    SalonDto;
  services: ServiceDto[];
  staff:    StaffDto[];
  /** Faz 18: URL'den gelen ?ref= kodu (server component tarafından geçilir) */
  initialReferralCode?: string;
}

// ── Widget durumu ─────────────────────────────────────────────────────────────

interface WidgetState {
  service:  ServiceDto | null;
  staff:    StaffDto   | null;
  date:     string;           // YYYY-MM-DD
  slot:     SlotDto    | null;
  firstName: string;
  lastName:  string;
  phone:     string;
  email:     string;
  notes:     string;
}

// ── Yardımcı: tarih inputu için min/max ───────────────────────────────────────
function getMinDate(): string {
  return todayIso();
}
function getMaxDate(): string {
  const d = new Date();
  d.setDate(d.getDate() + 60);
  return d.toISOString().slice(0, 10);
}

// ── Component ─────────────────────────────────────────────────────────────────

export function BookingWidget({ salon, services, staff, initialReferralCode }: BookingWidgetProps) {
  const [step, setStep]             = useState<Step>('service');
  const [state, setState]           = useState<WidgetState>({
    service:   null,
    staff:     null,
    date:      todayIso(),
    slot:      null,
    firstName: '',
    lastName:  '',
    phone:     '',
    email:     '',
    notes:     '',
  });
  const [slots, setSlots]           = useState<SlotDto[]>([]);
  const [loadingSlots, setLoading]  = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [result, setResult]         = useState<BookingResult | null>(null);
  const [error, setError]           = useState<string | null>(null);

  // Slot yükle (tarih veya personel değişince)
  const loadSlots = useCallback(async () => {
    if (!state.staff || !state.date || !state.service) return;
    setLoading(true);
    setSlots([]);
    setState((s) => ({ ...s, slot: null }));
    try {
      const data = await fetchAvailability(
        salon.slug,
        state.staff.id,
        state.date,
        state.service.durationMin,
      );
      setSlots(data);
    } catch {
      setSlots([]);
    } finally {
      setLoading(false);
    }
  }, [salon.slug, state.staff, state.date, state.service]);

  useEffect(() => {
    if (step === 'slot') loadSlots();
  }, [step, loadSlots]);

  // Personeli hizmete göre filtrele
  const filteredStaff = state.service
    ? staff.filter((s) => s.serviceIds.includes(state.service!.id))
    : staff;

  // Adım ileri
  const next = () => {
    const idx = STEP_ORDER.indexOf(step);
    if (idx < STEP_ORDER.length - 1) setStep(STEP_ORDER[idx + 1]!);
  };
  const prev = () => {
    const idx = STEP_ORDER.indexOf(step);
    if (idx > 0) setStep(STEP_ORDER[idx - 1]!);
  };

  // Form gönder
  const handleSubmit = async () => {
    if (!state.service || !state.staff || !state.slot || !salon.location) return;
    setSubmitting(true);
    setError(null);
    try {
      const res = await createBooking({
        slug:         salon.slug,
        locationId:   salon.location.id,
        staffId:      state.staff.id,
        serviceId:    state.service.id,
        startTime:    state.slot.startTime,
        firstName:    state.firstName.trim(),
        lastName:     state.lastName.trim(),
        phone:        state.phone.trim(),
        email:        state.email.trim() || undefined,
        notes:        state.notes.trim() || undefined,
        // Faz 18: Referral kodu varsa API'ye ilet
        referralCode: initialReferralCode || undefined,
      });

      // Faz 19: Ödeme gerekiyorsa İyzico Checkout Form'a yönlendir
      if (res.requiresPayment) {
        const payRes = await createPayment({
          appointmentId: res.appointmentId,
          buyerName:     `${state.firstName.trim()} ${state.lastName.trim()}`,
          buyerEmail:    state.email.trim() || 'musteri@calon.local',
        });
        // Tarayıcıyı İyzico ödeme sayfasına yönlendir — state güncellemeye gerek yok
        window.location.href = payRes.paymentUrl;
        return;
      }

      setResult(res);
      setStep('confirm');
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Randevu oluşturulamadı.');
    } finally {
      setSubmitting(false);
    }
  };

  // İlerleme çubuğu (confirm hariç)
  const currentIdx = STEP_ORDER.indexOf(step);

  return (
    <div className="bg-white rounded-3xl shadow-sm border border-gray-100 overflow-hidden">

      {/* ── Progress stepper — Untitled-inspired clean hierarchy ──────── */}
      {step !== 'confirm' && (
        <div className="px-6 pt-5 pb-3">
          <div className="flex items-center gap-1">
            {STEPS.filter((s) => s.id !== 'confirm').map((s, i) => (
              <React.Fragment key={s.id}>
                <div className="flex items-center gap-1.5">
                  <div
                    className={cn(
                      'w-6 h-6 rounded-full flex items-center justify-center text-xs font-semibold transition-all',
                      i < currentIdx
                        ? 'bg-brand-600 text-white shadow-sm'
                        : i === currentIdx
                          ? 'bg-brand-50 text-brand-700 ring-2 ring-brand-500/50 shadow-sm'
                          : 'bg-gray-100 text-gray-400',
                    )}
                  >
                    {i < currentIdx ? (
                      <CheckCircle className="w-3.5 h-3.5" />
                    ) : (
                      i + 1
                    )}
                  </div>
                  <span className={cn(
                    'hidden sm:inline text-xs font-medium transition-colors',
                    i <= currentIdx ? 'text-gray-900' : 'text-gray-400',
                  )}>
                    {s.label}
                  </span>
                </div>
                {i < STEPS.filter((s) => s.id !== 'confirm').length - 1 && (
                  <div className={cn(
                    'flex-1 h-[2px] rounded-full mx-1 transition-colors',
                    i < currentIdx ? 'bg-brand-500' : 'bg-gray-200',
                  )} />
                )}
              </React.Fragment>
            ))}
          </div>
        </div>
      )}

      <div className="px-6 pb-6 step-enter">

        {/* ══ ADIM 1: HİZMET ══════════════════════════════════════════ */}
        {step === 'service' && (
          <div>
            <h3 className="text-base font-semibold text-gray-900 mb-4">
              Hangi hizmeti almak istersiniz?
            </h3>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              {services.map((svc) => (
                <button
                  key={svc.id}
                  onClick={() => {
                    setState((s) => ({ ...s, service: svc, staff: null, slot: null }));
                    next();
                  }}
                  className={cn(
                    'text-left p-4 rounded-2xl border-2 transition-all duration-150',
                    'hover:border-brand-400 hover:bg-brand-50',
                    state.service?.id === svc.id
                      ? 'border-brand-500 bg-brand-50'
                      : 'border-gray-100 bg-white',
                  )}
                >
                  <div className="flex items-start justify-between gap-2">
                    <div className="flex items-center gap-2">
                      <Scissors className="w-4 h-4 text-brand-500 shrink-0 mt-0.5" />
                      <span className="font-medium text-gray-900 text-sm">{svc.name}</span>
                    </div>
                    <span className="text-brand-600 font-bold text-sm shrink-0">
                      {formatPrice(svc.price, svc.currency)}
                    </span>
                  </div>
                  <div className="flex items-center gap-1 mt-2 ml-6 text-gray-400 text-xs">
                    <Clock className="w-3 h-3" />
                    <span>{formatDuration(svc.durationMin)}</span>
                  </div>
                </button>
              ))}
            </div>
          </div>
        )}

        {/* ══ ADIM 2: PERSONEL ════════════════════════════════════════ */}
        {step === 'staff' && (
          <div>
            <h3 className="text-base font-semibold text-gray-900 mb-1">
              Personel seçin
            </h3>
            <p className="text-gray-400 text-xs mb-4">
              {state.service?.name} hizmeti için müsait personeller gösterilmektedir.
            </p>

            {filteredStaff.length === 0 ? (
              <div className="text-center py-10">
                <div className="w-12 h-12 rounded-full bg-gray-100 flex items-center justify-center mx-auto mb-3">
                  <User className="w-5 h-5 text-gray-400" />
                </div>
                <p className="text-gray-600 text-sm font-medium">Bu hizmet için müsait personel yok</p>
                <p className="text-gray-400 text-xs mt-1">Farklı bir hizmet seçmeyi deneyin.</p>
              </div>
            ) : (
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                {filteredStaff.map((member) => (
                  <button
                    key={member.id}
                    onClick={() => {
                      setState((s) => ({ ...s, staff: member, slot: null }));
                      next();
                    }}
                    className={cn(
                      'flex items-center gap-3 p-4 rounded-2xl border-2 transition-all text-left',
                      'hover:border-brand-400 hover:bg-brand-50',
                      state.staff?.id === member.id
                        ? 'border-brand-500 bg-brand-50'
                        : 'border-gray-100 bg-white',
                    )}
                  >
                    <div
                      className="w-10 h-10 rounded-full flex items-center justify-center text-white
                                 font-semibold text-sm shrink-0"
                      style={{ backgroundColor: member.colorHex }}
                    >
                      {member.firstName[0]}{member.lastName[0]}
                    </div>
                    <div>
                      <p className="font-medium text-gray-900 text-sm">
                        {member.firstName} {member.lastName}
                      </p>
                      {member.title && (
                        <p className="text-gray-400 text-xs">{member.title}</p>
                      )}
                    </div>
                  </button>
                ))}
              </div>
            )}

            <BackButton onClick={prev} />
          </div>
        )}

        {/* ══ ADIM 3: TARİH ═══════════════════════════════════════════ */}
        {step === 'date' && (
          <div>
            <h3 className="text-base font-semibold text-gray-900 mb-4">
              Tarih seçin
            </h3>
            <div className="max-w-xs">
              <input
                type="date"
                min={getMinDate()}
                max={getMaxDate()}
                value={state.date}
                onChange={(e) =>
                  setState((s) => ({ ...s, date: e.target.value, slot: null }))
                }
                className="w-full border-2 border-gray-200 rounded-xl px-4 py-3 text-sm
                           focus:outline-none focus:border-brand-500 transition-colors
                           text-gray-900 bg-white"
              />
            </div>
            <div className="flex gap-3 mt-6">
              <BackButton onClick={prev} />
              <button
                onClick={next}
                disabled={!state.date}
                className={cn(
                  'flex items-center gap-2 px-5 py-2.5 rounded-xl text-sm font-semibold transition-all',
                  state.date
                    ? 'bg-brand-600 text-white hover:bg-brand-700'
                    : 'bg-gray-100 text-gray-400 cursor-not-allowed',
                )}
              >
                Devam
                <ChevronRight className="w-4 h-4" />
              </button>
            </div>
          </div>
        )}

        {/* ══ ADIM 4: SLOT ════════════════════════════════════════════ */}
        {step === 'slot' && (
          <div>
            <h3 className="text-base font-semibold text-gray-900 mb-1">
              Saat seçin
            </h3>
            <p className="text-gray-400 text-xs mb-4">
              {formatDate(state.date + 'T00:00:00Z')} — {state.staff?.firstName} {state.staff?.lastName}
            </p>

            {loadingSlots ? (
              <div className="flex flex-col items-center justify-center py-14 gap-3">
                <div className="w-8 h-8 rounded-full border-[3px] border-gray-200 border-t-brand-500 animate-spin" />
                <p className="text-gray-400 text-xs">Müsait saatler yükleniyor...</p>
              </div>
            ) : slots.length === 0 ? (
              <div className="text-center py-10">
                <div className="w-12 h-12 rounded-full bg-gray-100 flex items-center justify-center mx-auto mb-3">
                  <Clock className="w-5 h-5 text-gray-400" />
                </div>
                <p className="text-gray-600 text-sm font-medium">Bu tarihte müsait saat yok</p>
                <p className="text-gray-400 text-xs mt-1">Farklı bir tarih veya personel seçmeyi deneyin.</p>
              </div>
            ) : (
              <div className="grid grid-cols-3 sm:grid-cols-4 md:grid-cols-6 gap-2">
                {slots.map((slot) => (
                  <button
                    key={slot.startTime}
                    onClick={() => {
                      setState((s) => ({ ...s, slot }));
                      next();
                    }}
                    className={cn(
                      'py-2.5 px-2 rounded-xl border-2 text-sm font-medium transition-all',
                      'hover:border-brand-400 hover:bg-brand-50',
                      state.slot?.startTime === slot.startTime
                        ? 'border-brand-500 bg-brand-50 text-brand-700'
                        : 'border-gray-100 text-gray-700',
                    )}
                  >
                    {formatTime(slot.startTime)}
                  </button>
                ))}
              </div>
            )}

            <BackButton onClick={prev} />
          </div>
        )}

        {/* ══ ADIM 5: MÜŞTERİ BİLGİLERİ ══════════════════════════════ */}
        {step === 'form' && (
          <div>
            <h3 className="text-base font-semibold text-gray-900 mb-1">
              Bilgileriniz
            </h3>
            <p className="text-gray-400 text-xs mb-5">
              Randevu onayı için aşağıdaki alanları doldurun.
            </p>

            {/* Özet */}
            <div className="bg-brand-50 rounded-xl p-4 mb-5 text-sm">
              <div className="flex items-center gap-2 text-brand-800">
                <Scissors className="w-4 h-4" />
                <span className="font-medium">{state.service?.name}</span>
                <span className="text-brand-500 ml-auto font-semibold">
                  {formatPrice(state.service?.price ?? '0', state.service?.currency)}
                </span>
              </div>
              <div className="flex items-center gap-2 text-brand-700 mt-1.5">
                <User className="w-4 h-4" />
                <span>{state.staff?.firstName} {state.staff?.lastName}</span>
              </div>
              <div className="flex items-center gap-2 text-brand-700 mt-1.5">
                <Calendar className="w-4 h-4" />
                <span>
                  {formatDate(state.date + 'T00:00:00Z')}, {state.slot && formatTime(state.slot.startTime)}
                  {state.slot && state.service && ` – ${formatTime(state.slot.endTime)}`}
                </span>
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <label className="block text-xs font-medium text-gray-700 mb-1">
                  Ad <span className="text-red-500">*</span>
                </label>
                <input
                  type="text"
                  placeholder="Ayşe"
                  value={state.firstName}
                  onChange={(e) => setState((s) => ({ ...s, firstName: e.target.value }))}
                  className="w-full border-2 border-gray-200 rounded-xl px-3 py-2.5 text-sm
                             focus:outline-none focus:border-brand-500 transition-colors"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-700 mb-1">
                  Soyad <span className="text-red-500">*</span>
                </label>
                <input
                  type="text"
                  placeholder="Yılmaz"
                  value={state.lastName}
                  onChange={(e) => setState((s) => ({ ...s, lastName: e.target.value }))}
                  className="w-full border-2 border-gray-200 rounded-xl px-3 py-2.5 text-sm
                             focus:outline-none focus:border-brand-500 transition-colors"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-700 mb-1">
                  Telefon <span className="text-red-500">*</span>
                </label>
                <input
                  type="tel"
                  placeholder="0532 000 00 00"
                  value={state.phone}
                  onChange={(e) => setState((s) => ({ ...s, phone: e.target.value }))}
                  className="w-full border-2 border-gray-200 rounded-xl px-3 py-2.5 text-sm
                             focus:outline-none focus:border-brand-500 transition-colors"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-700 mb-1">
                  E-posta (opsiyonel)
                </label>
                <input
                  type="email"
                  placeholder="ayse@ornek.com"
                  value={state.email}
                  onChange={(e) => setState((s) => ({ ...s, email: e.target.value }))}
                  className="w-full border-2 border-gray-200 rounded-xl px-3 py-2.5 text-sm
                             focus:outline-none focus:border-brand-500 transition-colors"
                />
              </div>
              <div className="sm:col-span-2">
                <label className="block text-xs font-medium text-gray-700 mb-1">
                  Not (opsiyonel)
                </label>
                <textarea
                  placeholder="Özel bir isteğiniz var mı?"
                  value={state.notes}
                  onChange={(e) => setState((s) => ({ ...s, notes: e.target.value }))}
                  rows={2}
                  className="w-full border-2 border-gray-200 rounded-xl px-3 py-2.5 text-sm
                             focus:outline-none focus:border-brand-500 transition-colors resize-none"
                />
              </div>
            </div>

            {error && (
              <div className="flex items-start gap-2.5 mt-4 p-3.5 bg-red-50 rounded-xl border border-red-100">
                <AlertCircle className="w-4 h-4 shrink-0 text-red-500 mt-0.5" />
                <div>
                  <p className="text-red-800 text-sm font-medium">Bir hata oluştu</p>
                  <p className="text-red-600 text-xs mt-0.5">{error}</p>
                </div>
              </div>
            )}

            <div className="flex gap-3 mt-5">
              <BackButton onClick={prev} />
              <button
                onClick={handleSubmit}
                disabled={
                  submitting ||
                  !state.firstName.trim() ||
                  !state.lastName.trim() ||
                  !state.phone.trim()
                }
                className={cn(
                  'flex items-center gap-2 px-6 py-2.5 rounded-xl text-sm font-semibold transition-all',
                  submitting || !state.firstName || !state.lastName || !state.phone
                    ? 'bg-gray-100 text-gray-400 cursor-not-allowed'
                    : 'bg-brand-600 text-white hover:bg-brand-700',
                )}
              >
                {submitting ? (
                  <Loader2 className="w-4 h-4 animate-spin" />
                ) : (
                  <CheckCircle className="w-4 h-4" />
                )}
                {submitting ? 'Oluşturuluyor...' : 'Randevuyu Onayla'}
              </button>
            </div>
          </div>
        )}

        {/* ══ ADIM 6: ONAY ════════════════════════════════════════════ */}
        {step === 'confirm' && result && (
          <div className="py-6 text-center step-enter">
            <div className="w-14 h-14 bg-green-50 rounded-full flex items-center justify-center mx-auto mb-4 ring-4 ring-green-100">
              <CheckCircle className="w-7 h-7 text-green-600" />
            </div>
            <h3 className="text-xl font-bold text-gray-900 mb-1">
              Randevunuz Oluşturuldu!
            </h3>
            <p className="text-gray-500 text-sm mb-6">
              Aşağıdaki bilgilerle randevunuz kaydedildi.
            </p>

            <div className="bg-gray-50 rounded-2xl p-5 text-left max-w-sm mx-auto space-y-3 border border-gray-100">
              <Detail icon={<Scissors />} label="Hizmet"   value={result.service.name} />
              <Detail
                icon={<User />}
                label="Personel"
                value={`${result.staff.firstName} ${result.staff.lastName}`}
              />
              <Detail
                icon={<Calendar />}
                label="Zaman"
                value={`${formatDate(result.startTime)}, ${formatTime(result.startTime)} – ${formatTime(result.endTime)}`}
              />
              <Detail icon={<MapPin />}  label="Konum"    value={result.location.name} />
            </div>

            <p className="text-gray-400 text-xs mt-6">
              Randevu referansı: <span className="font-mono text-gray-600">{result.appointmentId.slice(0, 8)}</span>
            </p>

            {/* ── Faz 18 + Faz 19: Referral Share Widget ────────────── */}
            {result.referralCode && (
              <ReferralShareWidget
                referralCode={result.referralCode}
                salonSlug={result.salonSlug}
                salonName={salon.name}
                citySlug={result.citySlug}
                serviceSlug={result.serviceSlug}
              />
            )}

            <button
              onClick={() => {
                setState({
                  service: null, staff: null, date: todayIso(),
                  slot: null, firstName: '', lastName: '',
                  phone: '', email: '', notes: '',
                });
                setResult(null);
                setStep('service');
              }}
              className="mt-4 text-brand-600 text-sm font-medium hover:underline"
            >
              Yeni Randevu Al
            </button>
          </div>
        )}

      </div>
    </div>
  );
}

// ── Alt bileşenler ────────────────────────────────────────────────────────────

/**
 * Faz 18 + Faz 19: Referral Share Widget
 * Yeni müşteriye canonical paylaşım linki + WhatsApp butonu gösterir.
 * Canonical format: /{citySlug}/{serviceSlug}/{salonSlug}?ref={code}
 */
function ReferralShareWidget({
  referralCode,
  salonSlug,
  citySlug,
  serviceSlug,
}: {
  referralCode: string;
  salonSlug:    string;
  salonName:    string;  // kept for API compat
  citySlug?:    string | null;
  serviceSlug?: string | null;
}) {
  const [copied, setCopied] = useState(false);

  // Canonical URL: /{city}/{service}/{salon}?ref=... — her ikisi de varsa
  const canonicalPath = citySlug && serviceSlug
    ? `/${citySlug}/${serviceSlug}/${salonSlug}`
    : `/${salonSlug}`;
  const shareUrl = `${SITE_URL}${canonicalPath}?ref=${referralCode}`;

  // B3 — Viral WhatsApp mesajı
  const waMsg    = encodeURIComponent(
    `Randevumu Calon üzerinden aldım ✨ Sen de randevunu buradan alabilirsin: ${shareUrl}`,
  );

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(shareUrl);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // clipboard erişimi yoksa sessizce geç
    }
  };

  return (
    <div className="mt-6 bg-gradient-to-br from-brand-50 to-purple-50 rounded-2xl p-5 border border-brand-100 text-left">
      <div className="flex items-center gap-2 mb-1">
        <span className="text-lg">🎁</span>
        <h4 className="text-sm font-bold text-brand-800">
          Arkadaşlarınızı Davet Edin, 50 Puan Kazanın!
        </h4>
      </div>
      <p className="text-xs text-brand-600 mb-3 ml-7">
        Davet linkinizle arkadaşlarınız randevu aldığında siz 50 sadakat puanı kazanırsınız.
      </p>

      {/* Link kutusu */}
      <div className="flex items-center gap-2 bg-white rounded-xl p-3 border border-brand-100 mb-3">
        <code className="text-xs text-gray-700 flex-1 truncate font-mono">
          {shareUrl}
        </code>
        <button
          onClick={handleCopy}
          className={cn(
            'shrink-0 px-3 py-1.5 rounded-lg text-xs font-semibold transition-all',
            copied
              ? 'bg-green-100 text-green-700'
              : 'bg-brand-100 text-brand-700 hover:bg-brand-200',
          )}
        >
          {copied ? '✓ Kopyalandı' : 'Kopyala'}
        </button>
      </div>

      {/* WhatsApp paylaşım butonu */}
      <a
        href={`https://wa.me/?text=${waMsg}`}
        target="_blank"
        rel="noopener noreferrer"
        className="inline-flex items-center gap-2 w-full justify-center bg-[#25D366]
                   text-white rounded-xl px-4 py-2.5 text-sm font-semibold
                   hover:bg-[#1ebe5d] transition-colors"
      >
        <svg viewBox="0 0 24 24" className="w-4 h-4 fill-current">
          <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413Z"/>
        </svg>
        WhatsApp ile Paylaş
      </a>
    </div>
  );
}

function BackButton({ onClick }: { onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      className="mt-4 flex items-center gap-1 text-gray-400 text-sm hover:text-gray-600 transition-colors"
    >
      <ChevronLeft className="w-4 h-4" />
      Geri
    </button>
  );
}

function MapPin({ className }: { className?: string }) {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      className={cn('w-4 h-4', className)}
    >
      <path d="M20 10c0 6-8 12-8 12s-8-6-8-12a8 8 0 0 1 16 0Z" />
      <circle cx="12" cy="10" r="3" />
    </svg>
  );
}

function Detail({
  icon,
  label,
  value,
}: {
  icon:  React.ReactNode;
  label: string;
  value: string;
}) {
  return (
    <div className="flex items-start gap-2.5">
      <span className="text-brand-500 mt-0.5 shrink-0 w-4 h-4">{icon}</span>
      <div>
        <p className="text-xs text-gray-400">{label}</p>
        <p className="text-sm font-medium text-gray-900">{value}</p>
      </div>
    </div>
  );
}
