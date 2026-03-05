/**
 * SITEMAP — Faz 16 + Faz 17
 * ──────────────────────────────────────────────────────────────────────────────
 * Faz 16: Aktif salon PLG URL'leri  (/luna-beauty)
 * Faz 17: Discovery URL'leri
 *           /istanbul
 *           /istanbul/sac-kesimi
 *           /istanbul/sac-kesimi/luna-beauty
 *
 * Discovery verisi: GET /public/discovery/sitemap-data (tek çağrı)
 * ──────────────────────────────────────────────────────────────────────────────
 */

import type { MetadataRoute } from 'next';
import { slugify }            from '@lib/utils';

const API_BASE = process.env['NEXT_PUBLIC_API_URL'] ?? 'http://localhost:4000';
const SITE_URL = process.env['NEXT_PUBLIC_SITE_URL'] ?? 'https://book.calon.com.tr';

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  try {
    // Paralel veri çekimi
    const [slugRes, discoveryRes] = await Promise.all([
      fetch(`${API_BASE}/api/v1/public/sitemap-slugs`,          { next: { revalidate: 3600 } }),
      fetch(`${API_BASE}/api/v1/public/discovery/sitemap-data`, { next: { revalidate: 3600 } }),
    ]);

    // ── Faz 16: salon PLG URL'leri ─────────────────────────────────────────
    const salonSlugs: string[] = slugRes.ok ? await slugRes.json() as string[] : [];
    const salonUrls: MetadataRoute.Sitemap = salonSlugs.map((slug) => ({
      url:             `${SITE_URL}/${slug}`,
      lastModified:    new Date(),
      changeFrequency: 'weekly',
      priority:        0.8,
    }));

    // ── Faz 17: discovery URL'leri ─────────────────────────────────────────
    interface SitemapData {
      cities:            string[];
      cityServices:      { city: string; serviceSlug: string }[];
      citySalonServices: { city: string; serviceSlug: string; salonSlug: string }[];
    }

    const discovery: SitemapData | null = discoveryRes.ok
      ? await discoveryRes.json() as SitemapData
      : null;

    const cityUrls: MetadataRoute.Sitemap = (discovery?.cities ?? []).map((city) => ({
      url:             `${SITE_URL}/${slugify(city)}`,
      lastModified:    new Date(),
      changeFrequency: 'daily',
      priority:        0.9,
    }));

    const serviceUrls: MetadataRoute.Sitemap = (discovery?.cityServices ?? []).map(
      ({ city, serviceSlug }) => ({
        url:             `${SITE_URL}/${slugify(city)}/${serviceSlug}`,
        lastModified:    new Date(),
        changeFrequency: 'daily',
        priority:        0.85,
      }),
    );

    const canonicalUrls: MetadataRoute.Sitemap = (discovery?.citySalonServices ?? []).map(
      ({ city, serviceSlug, salonSlug }) => ({
        url:             `${SITE_URL}/${slugify(city)}/${serviceSlug}/${salonSlug}`,
        lastModified:    new Date(),
        changeFrequency: 'weekly',
        priority:        0.75,
      }),
    );

    return [
      {
        url:             `${SITE_URL}`,
        lastModified:    new Date(),
        changeFrequency: 'daily',
        priority:        1.0,
      },
      ...cityUrls,
      ...serviceUrls,
      ...salonUrls,
      ...canonicalUrls,
    ];
  } catch {
    return [];
  }
}
