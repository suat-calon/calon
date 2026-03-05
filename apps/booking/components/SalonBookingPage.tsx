/**
 * SALON BOOKING PAGE COMPONENT — Faz 16 (bileşene taşındı)
 * ──────────────────────────────────────────────────────────────────────────────
 * Tam salon sayfası: Hero, Hizmetler, Personel, Booking Widget, Konum, Footer.
 * Server Component — SSR/ISR uyumlu.
 *
 * Kullanım:
 *   /[slug]           → PLG linki (salon slug'ı)
 *   /[city]/[svc]/[slug] → Canonical discovery sayfası
 * ──────────────────────────────────────────────────────────────────────────────
 */

import { MapPin, Phone, Star, Clock, CheckCircle } from 'lucide-react';

import { type SalonDto, type ServiceDto, type StaffDto } from '@lib/api';
import { formatPrice, formatDuration }                   from '@lib/utils';
import { BookingWidget }                                 from './BookingWidget';

interface Props {
  salon:    SalonDto;
  services: ServiceDto[];
  staff:    StaffDto[];
  /** Canonical URL varsa <link rel="canonical"> için */
  canonicalUrl?: string;
  /** Faz 18: URL'den gelen ?ref= kodu — BookingWidget'e iletilir */
  initialReferralCode?: string;
}

export function SalonBookingPage({ salon, services, staff, canonicalUrl, initialReferralCode }: Props) {
  const city = salon.location?.city ?? '';

  return (
    <div className="min-h-screen bg-white">

      {/* ── 1. HERO ─────────────────────────────────────────────────────── */}
      <section className="relative bg-gradient-to-br from-brand-900 via-brand-800 to-purple-900 text-white overflow-hidden">
        {/* Arka plan dekorasyon */}
        <div className="absolute inset-0 opacity-10">
          <div className="absolute top-0 left-1/4 w-96 h-96 bg-white rounded-full blur-3xl" />
          <div className="absolute bottom-0 right-1/4 w-64 h-64 bg-brand-300 rounded-full blur-2xl" />
        </div>

        <div className="relative max-w-5xl mx-auto px-6 py-20 text-center">
          {/* Logo */}
          {salon.logoUrl && (
            <div className="flex justify-center mb-6">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={salon.logoUrl}
                alt={`${salon.name} logo`}
                className="w-20 h-20 rounded-2xl object-cover shadow-xl ring-4 ring-white/20"
              />
            </div>
          )}

          <h1 className="text-4xl md:text-6xl font-bold tracking-tight mb-3">
            {salon.name}
          </h1>

          <div className="flex items-center justify-center gap-4 text-brand-200 text-sm mt-4 mb-8">
            {city && (
              <span className="flex items-center gap-1">
                <MapPin className="w-4 h-4" />
                {city}
              </span>
            )}
            <span className="flex items-center gap-1">
              <Star className="w-4 h-4 fill-yellow-400 text-yellow-400" />
              <Star className="w-4 h-4 fill-yellow-400 text-yellow-400" />
              <Star className="w-4 h-4 fill-yellow-400 text-yellow-400" />
              <Star className="w-4 h-4 fill-yellow-400 text-yellow-400" />
              <Star className="w-4 h-4 fill-yellow-400 text-yellow-400" />
            </span>
            {salon.location?.phone && (
              <span className="flex items-center gap-1">
                <Phone className="w-4 h-4" />
                {salon.location.phone}
              </span>
            )}
          </div>

          <a
            href="#booking"
            className="inline-flex items-center gap-2 bg-white text-brand-800 font-semibold
                       px-8 py-4 rounded-2xl text-lg shadow-xl hover:shadow-2xl
                       hover:bg-brand-50 transition-all duration-200"
          >
            <CheckCircle className="w-5 h-5" />
            Randevu Al
          </a>
        </div>
      </section>

      <div className="max-w-5xl mx-auto px-6">

        {/* ── 2. HİZMETLER ──────────────────────────────────────────────── */}
        {services.length > 0 && (
          <section className="py-16">
            <h2 className="text-2xl font-bold text-gray-900 mb-8">
              Hizmetlerimiz
            </h2>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
              {services.map((service) => (
                <div
                  key={service.id}
                  className="bg-white border border-gray-100 rounded-2xl p-5 shadow-sm
                             hover:shadow-md transition-shadow duration-200"
                >
                  <div className="flex items-start justify-between mb-2">
                    <h3 className="font-semibold text-gray-900 text-sm leading-tight">
                      {service.name}
                    </h3>
                    <span className="text-brand-600 font-bold text-sm ml-2 shrink-0">
                      {formatPrice(service.price, service.currency)}
                    </span>
                  </div>
                  {service.description && (
                    <p className="text-gray-500 text-xs mb-3 line-clamp-2">
                      {service.description}
                    </p>
                  )}
                  <div className="flex items-center gap-1 text-gray-400 text-xs">
                    <Clock className="w-3.5 h-3.5" />
                    <span>{formatDuration(service.durationMin)}</span>
                    <span className="mx-1">•</span>
                    <span className="text-brand-500 font-medium text-xs">
                      {service.categoryName}
                    </span>
                  </div>
                </div>
              ))}
            </div>
          </section>
        )}

        {/* ── 3. PERSONEL ───────────────────────────────────────────────── */}
        {staff.length > 0 && (
          <section className="py-8 border-t border-gray-100">
            <h2 className="text-2xl font-bold text-gray-900 mb-8">
              Ekibimiz
            </h2>
            <div className="flex flex-wrap gap-4">
              {staff.map((member) => (
                <div
                  key={member.id}
                  className="flex items-center gap-3 bg-gray-50 rounded-2xl px-4 py-3"
                >
                  <div
                    className="w-10 h-10 rounded-full flex items-center justify-center
                                text-white font-semibold text-sm shrink-0"
                    style={{ backgroundColor: member.colorHex }}
                  >
                    {member.firstName[0]}{member.lastName[0]}
                  </div>
                  <div>
                    <p className="font-medium text-gray-900 text-sm">
                      {member.firstName} {member.lastName}
                    </p>
                    {member.title && (
                      <p className="text-gray-500 text-xs">{member.title}</p>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </section>
        )}

        {/* ── 4. BOOKING WIDGET ─────────────────────────────────────────── */}
        <section id="booking" className="py-16 border-t border-gray-100">
          <h2 className="text-2xl font-bold text-gray-900 mb-2">
            Online Randevu
          </h2>
          <p className="text-gray-500 text-sm mb-8">
            Hizmet ve personel seçerek uygun bir slot rezerve edin.
          </p>
          <BookingWidget
            salon={salon}
            services={services}
            staff={staff}
            initialReferralCode={initialReferralCode}
          />
        </section>

        {/* ── 5. KONUM ──────────────────────────────────────────────────── */}
        {salon.location && (
          <section className="py-8 border-t border-gray-100">
            <h2 className="text-2xl font-bold text-gray-900 mb-4">Konum</h2>
            <div className="flex items-start gap-3 mb-4 text-gray-700">
              <MapPin className="w-5 h-5 text-brand-500 mt-0.5 shrink-0" />
              <div>
                <p className="font-medium">{salon.location.name}</p>
                {salon.location.address && (
                  <p className="text-sm text-gray-500 mt-0.5">
                    {salon.location.address}
                    {salon.location.city && `, ${salon.location.city}`}
                  </p>
                )}
              </div>
            </div>
            {/* Google Maps embed (adres bazlı) */}
            {salon.location.address && (
              <div className="rounded-2xl overflow-hidden shadow-sm border border-gray-100 h-64">
                <iframe
                  className="w-full h-full"
                  loading="lazy"
                  allowFullScreen
                  referrerPolicy="no-referrer-when-downgrade"
                  src={`https://maps.google.com/maps?q=${encodeURIComponent(
                    [salon.location.address, salon.location.city].filter(Boolean).join(', '),
                  )}&output=embed`}
                />
              </div>
            )}
          </section>
        )}
      </div>

      {/* ── 6. FOOTER — Growth Element ────────────────────────────────────── */}
      <footer className="border-t border-gray-100 mt-16 py-8 text-center text-gray-400 text-sm">
        <p>
          Randevu sistemi{' '}
          <a
            href="https://calon.com.tr"
            target="_blank"
            rel="noopener noreferrer"
            className="font-semibold text-brand-600 hover:text-brand-800 transition-colors"
          >
            Calon
          </a>{' '}
          ile güçlendirilmiştir.{' '}
          <a
            href="https://calon.com.tr/register"
            target="_blank"
            rel="noopener noreferrer"
            className="underline hover:text-gray-600 transition-colors"
          >
            Kendi salonunuz için randevu sistemi kurun →
          </a>
        </p>
      </footer>
    </div>
  );
}
