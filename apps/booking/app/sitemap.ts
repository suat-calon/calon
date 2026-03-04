/**
 * SITEMAP — Faz 16
 * ──────────────────────────────────────────────────────────────────────────────
 * Tüm aktif salon slug'larını Google'a bildirir.
 * Status: ACTIVE olan tenant'lar dahil edilir.
 */

import type { MetadataRoute } from 'next';

const API_BASE = process.env['NEXT_PUBLIC_API_URL'] ?? 'http://localhost:4000';
const SITE_URL = process.env['NEXT_PUBLIC_SITE_URL'] ?? 'https://book.auralis.app';

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  try {
    const res = await fetch(`${API_BASE}/api/v1/public/sitemap-slugs`, {
      next: { revalidate: 3600 }, // 1 saat
    });

    const slugs: string[] = res.ok ? await res.json() as string[] : [];

    const salonUrls: MetadataRoute.Sitemap = slugs.map((slug) => ({
      url:              `${SITE_URL}/${slug}`,
      lastModified:     new Date(),
      changeFrequency:  'weekly',
      priority:         0.8,
    }));

    return [
      {
        url:             `${SITE_URL}`,
        lastModified:    new Date(),
        changeFrequency: 'daily',
        priority:        1.0,
      },
      ...salonUrls,
    ];
  } catch {
    return [];
  }
}
