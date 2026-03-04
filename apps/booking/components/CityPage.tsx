/**
 * CITY PAGE COMPONENT — Faz 17
 * ──────────────────────────────────────────────────────────────────────────────
 * Bir şehirdeki tüm aktif salonları listeler.
 * Server Component — ISR revalidate: 3600.
 *
 * Route: /[citySlug]  (örn: /istanbul)
 * ──────────────────────────────────────────────────────────────────────────────
 */

import { MapPin, Phone, ChevronRight, Scissors } from 'lucide-react';

import { type SalonCardDto, type ServiceDiscoveryDto } from '@lib/api';
import { slugify }                                     from '@lib/utils';

interface Props {
  citySlug: string;           // URL'deki slug (örn: "istanbul")
  cityName: string;           // Gerçek şehir adı (örn: "Istanbul")
  salons:   SalonCardDto[];
  services: ServiceDiscoveryDto[]; // Filtre çipleri için
}

export function CityPage({ citySlug, cityName, salons, services }: Props) {
  // Bu şehirde bulunan hizmet kategorilerini çıkar
  const cityServiceSlugs = new Set(
    salons.flatMap((s) => s.serviceNames.map((n) => slugify(n))),
  );
  const cityServices = services.filter((svc) => cityServiceSlugs.has(svc.slug));

  return (
    <div className="min-h-screen bg-white">

      {/* ── HERO ─────────────────────────────────────────────────────────── */}
      <section className="relative bg-gradient-to-br from-brand-900 via-brand-800 to-purple-900 text-white overflow-hidden">
        <div className="absolute inset-0 opacity-10">
          <div className="absolute top-0 left-1/4 w-96 h-96 bg-white rounded-full blur-3xl" />
          <div className="absolute bottom-0 right-1/4 w-64 h-64 bg-brand-300 rounded-full blur-2xl" />
        </div>

        <div className="relative max-w-5xl mx-auto px-6 py-20 text-center">
          <div className="inline-flex items-center gap-2 bg-white/10 rounded-full px-4 py-1.5 text-sm mb-6">
            <MapPin className="w-4 h-4" />
            Güzellik & Bakım
          </div>

          <h1 className="text-4xl md:text-6xl font-bold tracking-tight mb-4">
            {cityName}
          </h1>
          <p className="text-brand-200 text-lg mb-8">
            {salons.length} aktif güzellik salonu
          </p>

          {/* Hizmet filtre çipleri */}
          {cityServices.length > 0 && (
            <div className="flex flex-wrap justify-center gap-2 mt-4">
              {cityServices.map((svc) => (
                <a
                  key={svc.slug}
                  href={`/${citySlug}/${svc.slug}`}
                  className="inline-flex items-center gap-1.5 bg-white/15 hover:bg-white/25
                             text-white rounded-full px-4 py-1.5 text-sm font-medium
                             transition-colors duration-150"
                >
                  <Scissors className="w-3.5 h-3.5" />
                  {svc.name}
                </a>
              ))}
            </div>
          )}
        </div>
      </section>

      {/* ── SALON LİSTESİ ────────────────────────────────────────────────── */}
      <div className="max-w-5xl mx-auto px-6 py-12">
        <div className="flex items-center justify-between mb-8">
          <h2 className="text-2xl font-bold text-gray-900">
            {cityName}&apos;daki Salonlar
          </h2>
          <span className="text-gray-400 text-sm">{salons.length} salon</span>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-5">
          {salons.map((salon) => (
            <SalonCard key={salon.id} salon={salon} citySlug={citySlug} />
          ))}
        </div>
      </div>

      {/* ── FOOTER ───────────────────────────────────────────────────────── */}
      <footer className="border-t border-gray-100 mt-8 py-8 text-center text-gray-400 text-sm">
        <p>
          Randevu sistemi{' '}
          <a
            href="https://auralis.app"
            target="_blank"
            rel="noopener noreferrer"
            className="font-semibold text-brand-600 hover:text-brand-800 transition-colors"
          >
            Auralis
          </a>{' '}
          ile güçlendirilmiştir.{' '}
          <a
            href="https://auralis.app/register"
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

// ── Salon Kartı ───────────────────────────────────────────────────────────────

function SalonCard({
  salon,
  citySlug,
}: {
  salon:    SalonCardDto;
  citySlug: string;
}) {
  // Doğrudan PLG booking sayfasına yönlendir (Faz 16 ile uyumlu)
  const href = `/${salon.slug}`;

  return (
    <a
      href={href}
      className="group flex flex-col bg-white border border-gray-100 rounded-2xl p-5
                 shadow-sm hover:shadow-md transition-all duration-200"
    >
      {/* Salon Başlığı */}
      <div className="flex items-start gap-3 mb-3">
        {salon.logoUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={salon.logoUrl}
            alt={`${salon.name} logo`}
            className="w-12 h-12 rounded-xl object-cover shrink-0 ring-1 ring-gray-100"
          />
        ) : (
          <div
            className="w-12 h-12 rounded-xl flex items-center justify-center
                       text-white font-bold text-lg shrink-0"
            style={{ backgroundColor: salon.brandColor ?? '#7c3aed' }}
          >
            {salon.name[0]}
          </div>
        )}
        <div className="min-w-0">
          <h3 className="font-semibold text-gray-900 group-hover:text-brand-700
                         transition-colors leading-tight truncate">
            {salon.name}
          </h3>
          {salon.location?.city && (
            <p className="flex items-center gap-1 text-gray-400 text-xs mt-0.5">
              <MapPin className="w-3 h-3" />
              {salon.location.city}
            </p>
          )}
        </div>
      </div>

      {/* Adres */}
      {salon.location?.address && (
        <p className="text-gray-500 text-xs mb-3 line-clamp-2">
          {salon.location.address}
        </p>
      )}

      {/* Hizmet Etiketleri */}
      {salon.serviceNames.length > 0 && (
        <div className="flex flex-wrap gap-1 mb-4">
          {salon.serviceNames.slice(0, 4).map((name) => (
            <span
              key={name}
              className="inline-block bg-brand-50 text-brand-700 text-xs
                         rounded-full px-2.5 py-0.5 font-medium"
            >
              {name}
            </span>
          ))}
        </div>
      )}

      {/* Telefon + CTA */}
      <div className="mt-auto flex items-center justify-between pt-3 border-t border-gray-50">
        {salon.location?.phone ? (
          <span className="flex items-center gap-1 text-gray-400 text-xs">
            <Phone className="w-3 h-3" />
            {salon.location.phone}
          </span>
        ) : (
          <span />
        )}
        <span className="flex items-center gap-1 text-brand-600 text-xs font-semibold
                         group-hover:gap-2 transition-all duration-150">
          Randevu Al
          <ChevronRight className="w-3.5 h-3.5" />
        </span>
      </div>
    </a>
  );
}
