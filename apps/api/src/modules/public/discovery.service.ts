/**
 * DISCOVERY SERVICE — Faz 17
 * ──────────────────────────────────────────────────────────────────────────────
 * Cross-tenant marketplace sorgular.
 *
 * KRİTİK: Bu serviste runInContext() KULLANILMAZ.
 *   Prisma Middleware 1 yalnızca tenantContext.getStore()?.tenantId truthy
 *   olduğunda devreye girer. Context yoksa tenant filtresi eklenmez →
 *   tüm aktif tenant'lar cross-tenant sorgulanabilir.
 *
 *   RLS: auralis_app table owner olduğu için marketplace_read_* politikaları
 *   uygulanmaz (owner bypass). Mevcut uygulama sorguları etkilenmez.
 * ──────────────────────────────────────────────────────────────────────────────
 */

import { Injectable, Logger } from '@nestjs/common';
import { TenantStatus }       from '@prisma/client';
import { PrismaService }      from '../../common/prisma.service';

// ── Türkçe destekli slugify ────────────────────────────────────────────────────
function slugify(text: string): string {
  return text
    .toLowerCase()
    .replace(/ı/g, 'i')
    .replace(/ğ/g, 'g')
    .replace(/ü/g, 'u')
    .replace(/ş/g, 's')
    .replace(/ö/g, 'o')
    .replace(/ç/g, 'c')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '');
}

// ── DTOlar ────────────────────────────────────────────────────────────────────

export interface CityDto {
  city:  string;
  count: number; // aktif salon sayısı
}

export interface ServiceDiscoveryDto {
  name:  string;
  slug:  string;
  count: number; // bu hizmeti sunan tenant sayısı
}

export interface SalonCardDto {
  id:         string;
  name:       string;
  slug:       string;
  logoUrl:    string | null;
  brandColor: string | null;
  location: {
    name:    string;
    address: string | null;
    city:    string | null;
    phone:   string | null;
  } | null;
  serviceNames: string[];
}

export interface SitemapDiscoveryDto {
  cities:            string[];
  cityServices:      { city: string; serviceSlug: string }[];
  citySalonServices: { city: string; serviceSlug: string; salonSlug: string }[];
}

// ─────────────────────────────────────────────────────────────────────────────

@Injectable()
export class DiscoveryService {
  private readonly logger = new Logger(DiscoveryService.name);

  constructor(private readonly prisma: PrismaService) {}

  // ═══════════════════════════════════════════════════════════════════════════
  // GET /public/discovery/cities
  // ═══════════════════════════════════════════════════════════════════════════

  async getCities(): Promise<CityDto[]> {
    const locations = await this.prisma.location.findMany({
      where: {
        isDeleted: false,
        isActive:  true,
        city:      { not: null },
        tenant: {
          status:    TenantStatus.ACTIVE,
          isDeleted: false,
        },
      },
      select: { city: true },
    });

    // Şehir bazında say (TypeScript aggregation)
    const cityMap = new Map<string, number>();
    for (const loc of locations) {
      if (!loc.city) continue;
      const key = loc.city.trim();
      cityMap.set(key, (cityMap.get(key) ?? 0) + 1);
    }

    return Array.from(cityMap.entries())
      .map(([city, count]) => ({ city, count }))
      .sort((a, b) => b.count - a.count || a.city.localeCompare(b.city, 'tr'));
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // GET /public/discovery/services
  // ═══════════════════════════════════════════════════════════════════════════

  async getDiscoveryServices(): Promise<ServiceDiscoveryDto[]> {
    // (categoryId, tenantId) unique çiftlerini çek
    const rows = await this.prisma.service.findMany({
      where: {
        isActive:  true,
        isDeleted: false,
        tenant: {
          status:    TenantStatus.ACTIVE,
          isDeleted: false,
        },
      },
      select: {
        categoryId: true,
        tenantId:   true,
        category:   { select: { name: true } },
      },
      distinct: ['categoryId', 'tenantId'],
    });

    // Her kategori → kaç farklı tenant
    const catMap = new Map<string, { name: string; tenants: Set<string> }>();
    for (const row of rows) {
      const name = row.category.name;
      if (!catMap.has(row.categoryId)) {
        catMap.set(row.categoryId, { name, tenants: new Set() });
      }
      catMap.get(row.categoryId)!.tenants.add(row.tenantId);
    }

    return Array.from(catMap.values())
      .map(({ name, tenants }) => ({
        name,
        slug:  slugify(name),
        count: tenants.size,
      }))
      .sort((a, b) => b.count - a.count || a.name.localeCompare(b.name, 'tr'));
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // GET /public/discovery/city/:city
  // ═══════════════════════════════════════════════════════════════════════════

  async getCitySalons(city: string): Promise<SalonCardDto[]> {
    const tenants = await this.prisma.tenant.findMany({
      where: {
        status:    TenantStatus.ACTIVE,
        isDeleted: false,
        locations: {
          some: {
            city:      { equals: city, mode: 'insensitive' },
            isDeleted: false,
            isActive:  true,
          },
        },
      },
      select: {
        id:         true,
        name:       true,
        slug:       true,
        logoUrl:    true,
        brandColor: true,
        locations: {
          where: {
            city:      { equals: city, mode: 'insensitive' },
            isDeleted: false,
            isActive:  true,
          },
          select: { name: true, address: true, city: true, phone: true },
          take:   1,
        },
        services: {
          where:  { isActive: true, isDeleted: false },
          select: { categoryId: true, category: { select: { name: true } } },
          take:   20,
        },
      },
      orderBy: { name: 'asc' },
    });

    return tenants.map((t) => ({
      id:         t.id,
      name:       t.name,
      slug:       t.slug,
      logoUrl:    t.logoUrl,
      brandColor: t.brandColor,
      location:   t.locations[0]
        ? {
            name:    t.locations[0].name,
            address: t.locations[0].address,
            city:    t.locations[0].city,
            phone:   t.locations[0].phone,
          }
        : null,
      serviceNames: this.uniqueServiceNames(t.services),
    }));
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // GET /public/discovery/service/:city/:service
  // ═══════════════════════════════════════════════════════════════════════════

  async getCityServiceSalons(
    city:        string,
    serviceSlug: string,
  ): Promise<SalonCardDto[]> {
    // Slug → kategori eşleştirmesi
    const allCategories = await this.prisma.serviceCategory.findMany({
      select: { id: true, name: true },
    });
    const category = allCategories.find((c) => slugify(c.name) === serviceSlug);
    if (!category) return [];

    const tenants = await this.prisma.tenant.findMany({
      where: {
        status:    TenantStatus.ACTIVE,
        isDeleted: false,
        locations: {
          some: {
            city:      { equals: city, mode: 'insensitive' },
            isDeleted: false,
            isActive:  true,
          },
        },
        services: {
          some: {
            isActive:   true,
            isDeleted:  false,
            categoryId: category.id,
          },
        },
      },
      select: {
        id:         true,
        name:       true,
        slug:       true,
        logoUrl:    true,
        brandColor: true,
        locations: {
          where: {
            city:      { equals: city, mode: 'insensitive' },
            isDeleted: false,
            isActive:  true,
          },
          select: { name: true, address: true, city: true, phone: true },
          take:   1,
        },
        services: {
          where:  { isActive: true, isDeleted: false, categoryId: category.id },
          select: { categoryId: true, category: { select: { name: true } } },
          take:   10,
        },
      },
      orderBy: { name: 'asc' },
    });

    return tenants.map((t) => ({
      id:         t.id,
      name:       t.name,
      slug:       t.slug,
      logoUrl:    t.logoUrl,
      brandColor: t.brandColor,
      location:   t.locations[0]
        ? {
            name:    t.locations[0].name,
            address: t.locations[0].address,
            city:    t.locations[0].city,
            phone:   t.locations[0].phone,
          }
        : null,
      serviceNames: [category.name],
    }));
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // GET /public/discovery/sitemap-data  (sitemap.ts tarafından kullanılır)
  // ═══════════════════════════════════════════════════════════════════════════

  async getSitemapData(): Promise<SitemapDiscoveryDto> {
    const [cities, services] = await Promise.all([
      this.getCities(),
      this.getDiscoveryServices(),
    ]);

    const cityServices:      { city: string; serviceSlug: string }[]                        = [];
    const citySalonServices: { city: string; serviceSlug: string; salonSlug: string }[]     = [];

    for (const { city } of cities) {
      for (const { slug: serviceSlug } of services) {
        const salons = await this.getCityServiceSalons(city, serviceSlug);
        if (salons.length > 0) {
          cityServices.push({ city, serviceSlug });
          for (const salon of salons) {
            citySalonServices.push({ city, serviceSlug, salonSlug: salon.slug });
          }
        }
      }
    }

    return {
      cities:            cities.map((c) => c.city),
      cityServices,
      citySalonServices,
    };
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // ÖZEL YARDIMCILAR
  // ═══════════════════════════════════════════════════════════════════════════

  /** Tekrarlanan kategorileri kaldır, maks 5 ad döndür */
  private uniqueServiceNames(
    services: { categoryId: string; category: { name: string } }[],
  ): string[] {
    const seen  = new Set<string>();
    const names: string[] = [];
    for (const s of services) {
      if (!seen.has(s.categoryId)) {
        seen.add(s.categoryId);
        names.push(s.category.name);
        if (names.length >= 5) break;
      }
    }
    return names;
  }
}
