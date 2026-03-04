/**
 * CANONICAL SALON PAGE — Faz 17
 * ──────────────────────────────────────────────────────────────────────────────
 * Route: /[citySlug]/[serviceSlug]/[salonSlug]
 * Örn:   /istanbul/sac-kesimi/luna-beauty
 *
 * Server Component — ISR revalidate: 3600.
 * Tam booking widget dahil (Faz 16 ile aynı UX).
 * Canonical: kendi URL'sine işaret eder (SEO).
 *
 * generateStaticParams: SSG için city × service × salon kombinasyonları.
 * ──────────────────────────────────────────────────────────────────────────────
 */

import { Metadata }  from 'next';
import { notFound }  from 'next/navigation';

import {
  fetchSalon,
  fetchServices,
  fetchStaff,
  fetchCities,
  fetchDiscoveryServices,
  fetchCityServiceSalons,
} from '@lib/api';
import { slugify } from '@lib/utils';

import { SalonBookingPage } from '@components/SalonBookingPage';

const SITE_URL = process.env['NEXT_PUBLIC_SITE_URL'] ?? 'https://book.auralis.app';

// ── ISR ───────────────────────────────────────────────────────────────────────
export const revalidate = 3600;

// ── SSG: Tüm city × service × salon kombinasyonları ───────────────────────────
export async function generateStaticParams() {
  const [cities, services] = await Promise.all([
    fetchCities(),
    fetchDiscoveryServices(),
  ]);

  const params: { slug: string; service: string; salonSlug: string }[] = [];

  for (const { city } of cities) {
    for (const svc of services) {
      const salons = await fetchCityServiceSalons(city, svc.slug);
      for (const salon of salons) {
        params.push({
          slug:      slugify(city),
          service:   svc.slug,
          salonSlug: salon.slug,
        });
      }
    }
  }

  return params;
}

// ── Metadata ───────────────────────────────────────────────────────────────────
export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug: string; service: string; salonSlug: string }>;
}): Promise<Metadata> {
  const { slug, service, salonSlug } = await params;

  const [salon, allServices] = await Promise.all([
    fetchSalon(salonSlug),
    fetchDiscoveryServices(),
  ]);

  if (!salon) return { title: 'Salon Bulunamadı | Auralis' };

  const city        = salon.location?.city ?? slug;
  const matchedSvc  = allServices.find((s) => s.slug === service);
  const serviceName = matchedSvc?.name ?? service.replace(/-/g, ' ');

  const title       = `${salon.name} — ${serviceName} | ${city} — Auralis`;
  const description = `${city} bölgesinde ${salon.name} salonunda ${serviceName} için online randevu alın.`;
  const canonical   = `${SITE_URL}/${slug}/${service}/${salonSlug}`;

  return {
    title,
    description,
    openGraph: {
      title,
      description,
      type:   'website',
      images: salon.logoUrl ? [{ url: salon.logoUrl }] : [],
    },
    twitter: { card: 'summary', title, description },
    alternates: { canonical },
    robots: { index: true, follow: true },
  };
}

// ── Sayfa ──────────────────────────────────────────────────────────────────────
export default async function CanonicalSalonPage({
  params,
}: {
  params: Promise<{ slug: string; service: string; salonSlug: string }>;
}) {
  const { slug, service, salonSlug } = await params;

  const salon = await fetchSalon(salonSlug);
  if (!salon) notFound();

  const [servicesData, staffData] = await Promise.all([
    fetchServices(salon.id),
    fetchStaff(salon.id),
  ]);

  const canonicalUrl = `${SITE_URL}/${slug}/${service}/${salonSlug}`;

  return (
    <SalonBookingPage
      salon={salon}
      services={servicesData}
      staff={staffData}
      canonicalUrl={canonicalUrl}
    />
  );
}
