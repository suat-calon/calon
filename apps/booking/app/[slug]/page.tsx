/**
 * SMART DISPATCH PAGE — Faz 16 + Faz 17
 * ──────────────────────────────────────────────────────────────────────────────
 * Route: /[slug]
 * Server Component — SSR/ISR, Edge cache uyumlu.
 *
 * Öncelik sırası:
 *   1. Salon PLG sayfası   → slug = tenant.slug  (Faz 16)
 *   2. Şehir keşif sayfası → slug ≈ şehir adı    (Faz 17)
 *   3. 404
 *
 * Bu yapı, Faz 16 PLG linklerini (/luna-beauty) korurken Faz 17 şehir
 * sayfalarına (/istanbul) da izin verir.
 * ──────────────────────────────────────────────────────────────────────────────
 */

import { Metadata }   from 'next';
import { notFound }   from 'next/navigation';

import {
  fetchSalon,
  fetchServices,
  fetchStaff,
  fetchCitySalons,
  fetchDiscoveryServices,
  type SalonCardDto,
  type ServiceDiscoveryDto,
} from '@lib/api';
import { slugify }    from '@lib/utils';

import { SalonBookingPage } from '@components/SalonBookingPage';
import { CityPage }         from '@components/CityPage';

const SITE_URL = process.env['NEXT_PUBLIC_BOOKING_URL'] ?? 'https://book.calon.com.tr';

// ── Metadata ───────────────────────────────────────────────────────────────────

export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug: string }>;
}): Promise<Metadata> {
  const { slug } = await params;

  // 1. Salon dene
  const salon = await fetchSalon(slug);
  if (salon) {
    const city        = salon.location?.city ?? 'Türkiye';
    const description = `${salon.name} salonunda online randevu alın. ${city} bölgesinde profesyonel güzellik hizmetleri.`;
    return {
      title:       `${salon.name} | ${city} Randevu — Calon`,
      description,
      // Faz 18: ?ref= parametresi canonical'dan çıkarılır — duplicate content önlemi
      alternates:  { canonical: `${SITE_URL}/${slug}` },
      openGraph: {
        title:       `${salon.name} - Online Randevu`,
        description,
        type:        'website',
        images:      salon.logoUrl ? [{ url: salon.logoUrl }] : [],
      },
      twitter: { card: 'summary', title: `${salon.name} - Online Randevu`, description },
      robots:  { index: true, follow: true },
    };
  }

  // 2. Şehir dene
  const salons = await fetchCitySalons(slug);
  if (salons.length > 0) {
    const city        = salons[0]?.location?.city ?? slug;
    const description = `${city} bölgesindeki güzellik salonlarını keşfedin ve online randevu alın.`;
    return {
      title:       `${city} Salonları | Online Randevu — Calon`,
      description,
      openGraph:   { title: `${city} Salonları`, description, type: 'website' },
      robots:      { index: true, follow: true },
    };
  }

  return { title: 'Bulunamadı | Calon' };
}

// ── Sayfa ──────────────────────────────────────────────────────────────────────

export default async function SlugPage({
  params,
  searchParams,
}: {
  params:       Promise<{ slug: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const [{ slug }, sp] = await Promise.all([params, searchParams]);

  // Faz 18: ?ref= query parametresinden referral kodu al
  const refParam            = sp['ref'];
  const initialReferralCode = typeof refParam === 'string' ? refParam : undefined;

  // ── 1. Salon PLG sayfası (Faz 16) ─────────────────────────────────────────
  const salon = await fetchSalon(slug);
  if (salon) {
    const [servicesData, staffData] = await Promise.all([
      fetchServices(salon.slug),
      fetchStaff(salon.slug),
    ]);
    return (
      <SalonBookingPage
        salon={salon}
        services={servicesData}
        staff={staffData}
        initialReferralCode={initialReferralCode}
      />
    );
  }

  // ── 2. Şehir keşif sayfası (Faz 17) ───────────────────────────────────────
  const [citySalons, allServices] = await Promise.all([
    fetchCitySalons(slug),
    fetchDiscoveryServices(),
  ]);
  if (citySalons.length > 0) {
    const city = citySalons[0]?.location?.city ?? slug;
    return (
      <CityPage
        citySlug={slug}
        cityName={city}
        salons={citySalons}
        services={allServices}
      />
    );
  }

  // ── 3. 404 ────────────────────────────────────────────────────────────────
  notFound();
}
