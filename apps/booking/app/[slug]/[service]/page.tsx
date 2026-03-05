/**
 * CITY × SERVICE DISCOVERY PAGE — Faz 17
 * ──────────────────────────────────────────────────────────────────────────────
 * Route: /[citySlug]/[serviceSlug]
 * Örn:   /istanbul/sac-kesimi
 *
 * Server Component — ISR revalidate: 3600.
 * generateStaticParams: SSG için city × service kombinasyonları.
 * ──────────────────────────────────────────────────────────────────────────────
 */

import { Metadata }   from 'next';
import { notFound }   from 'next/navigation';
import { MapPin, Phone, ChevronRight, Scissors, ArrowLeft } from 'lucide-react';

import {
  fetchCities,
  fetchDiscoveryServices,
  fetchCityServiceSalons,
  type SalonCardDto,
} from '@lib/api';
import { slugify } from '@lib/utils';

// ── ISR ───────────────────────────────────────────────────────────────────────
export const revalidate = 3600;

// ── SSG: Tüm city × service kombinasyonları ───────────────────────────────────
export async function generateStaticParams() {
  const [cities, services] = await Promise.all([
    fetchCities(),
    fetchDiscoveryServices(),
  ]);

  const params: { slug: string; service: string }[] = [];

  for (const { city } of cities) {
    for (const svc of services) {
      const salons = await fetchCityServiceSalons(city, svc.slug);
      if (salons.length > 0) {
        params.push({ slug: slugify(city), service: svc.slug });
      }
    }
  }

  return params;
}

// ── Metadata ───────────────────────────────────────────────────────────────────
export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug: string; service: string }>;
}): Promise<Metadata> {
  const { slug, service } = await params;

  const allServices  = await fetchDiscoveryServices();
  const matchedSvc   = allServices.find((s) => s.slug === service);
  const serviceName  = matchedSvc?.name ?? service.replace(/-/g, ' ');

  const salons = await fetchCityServiceSalons(slug, service);
  const city   = salons[0]?.location?.city ?? slug;

  const title       = `${city}'da ${serviceName} | Online Randevu — Calon`;
  const description = `${city} bölgesinde ${serviceName} hizmeti sunan ${salons.length} salonu keşfedin ve online randevu alın.`;

  return {
    title,
    description,
    openGraph: { title, description, type: 'website' },
    alternates: {
      canonical: `${process.env['NEXT_PUBLIC_SITE_URL'] ?? 'https://book.calon.com.tr'}/${slug}/${service}`,
    },
    robots: { index: true, follow: true },
  };
}

// ── Sayfa ──────────────────────────────────────────────────────────────────────
export default async function CityServicePage({
  params,
}: {
  params: Promise<{ slug: string; service: string }>;
}) {
  const { slug, service } = await params;

  const [salons, allServices] = await Promise.all([
    fetchCityServiceSalons(slug, service),
    fetchDiscoveryServices(),
  ]);

  if (salons.length === 0) notFound();

  const city        = salons[0]?.location?.city ?? slug;
  const matchedSvc  = allServices.find((s) => s.slug === service);
  const serviceName = matchedSvc?.name ?? service.replace(/-/g, ' ');

  return (
    <div className="min-h-screen bg-white">

      {/* ── HERO ───────────────────────────────────────────────────────── */}
      <section className="relative bg-gradient-to-br from-brand-900 via-brand-800 to-purple-900 text-white overflow-hidden">
        <div className="absolute inset-0 opacity-10">
          <div className="absolute top-0 left-1/4 w-96 h-96 bg-white rounded-full blur-3xl" />
          <div className="absolute bottom-0 right-1/4 w-64 h-64 bg-brand-300 rounded-full blur-2xl" />
        </div>

        <div className="relative max-w-5xl mx-auto px-6 py-20 text-center">
          {/* Breadcrumb */}
          <a
            href={`/${slug}`}
            className="inline-flex items-center gap-1.5 text-brand-200 hover:text-white
                       text-sm mb-6 transition-colors"
          >
            <ArrowLeft className="w-4 h-4" />
            {city}
          </a>

          <div className="inline-flex items-center gap-2 bg-white/10 rounded-full px-4 py-1.5 text-sm mb-4">
            <Scissors className="w-4 h-4" />
            {serviceName}
          </div>

          <h1 className="text-4xl md:text-5xl font-bold tracking-tight mb-4">
            {city}&apos;da {serviceName}
          </h1>
          <p className="text-brand-200 text-lg">
            {salons.length} salon bu hizmeti sunuyor
          </p>
        </div>
      </section>

      {/* ── SALON LİSTESİ ─────────────────────────────────────────────── */}
      <div className="max-w-5xl mx-auto px-6 py-12">
        <h2 className="text-2xl font-bold text-gray-900 mb-8">
          {city}&apos;da {serviceName} Sunan Salonlar
        </h2>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-5">
          {salons.map((salon) => (
            <ServiceSalonCard
              key={salon.id}
              salon={salon}
              citySlug={slug}
              serviceSlug={service}
            />
          ))}
        </div>
      </div>

      {/* ── FOOTER ───────────────────────────────────────────────────────── */}
      <footer className="border-t border-gray-100 mt-8 py-8 text-center text-gray-400 text-sm">
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
          ile güçlendirilmiştir.
        </p>
      </footer>
    </div>
  );
}

// ── Salon Kartı (canonical linke yönlenir) ────────────────────────────────────

function ServiceSalonCard({
  salon,
  citySlug,
  serviceSlug,
}: {
  salon:       SalonCardDto;
  citySlug:    string;
  serviceSlug: string;
}) {
  // Canonical 3-seviyeli URL → bu hizmeti bu sehirde bu salonda randevu al
  const href = `/${citySlug}/${serviceSlug}/${salon.slug}`;

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

      {/* CTA */}
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
