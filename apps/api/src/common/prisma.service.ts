/**
 * CALON PRISMA SERVICE — ÇİFT KATMANLI İZOLASYON KÖPRÜSÜ
 * ──────────────────────────────────────────────────────────────────────────────
 * Prisma v6 $extends / query interceptor implementasyonu.
 * (Eski $use middleware tamamen kaldırıldı — deprecated, Prisma v7'de mevcut değil)
 *
 * İki kritik görev:
 *   1. Uygulama katmanı filtresi: toplu sorgularda WHERE tenantId = <current>
 *   2. PostgreSQL RLS köprüsü: $transaction([set_config, query]) ile
 *      aynı DB bağlantısında SET CONFIG + sorgu garantisi sağlar.
 *
 * Tasarım kararları (v2.0 — $extends):
 *   - $extends.query.$allModels.$allOperations: tüm model+operasyonları yakalar.
 *   - $transaction([SET_CONFIG, query(processedArgs)]): sequential batch →
 *     her iki işlem AYNI bağlantıda çalışır → bağlantı havuzu tenant sızıntısı yok.
 *   - __rlsConfigured flag (TenantStore): iç içe interceptor tetiklendiğinde
 *     çift sarmalama engellenir (SET CONFIG $transaction → query → interceptor).
 *   - findUnique hâlâ HARIÇ: unique where'e ek alan eklenmez.
 *     (ADIM 2: findFirst + tenantId servis katmanı sorumluluğundadır)
 *   - Object.assign(this, extended): NestJS DI referansını korur.
 * ──────────────────────────────────────────────────────────────────────────────
 */

import {
  Injectable,
  OnModuleInit,
  OnModuleDestroy,
  Logger,
} from '@nestjs/common';
import { PrismaClient } from '@prisma/client';
import { tenantContext } from './tenant.context';

// ─── Sabitler (Set → O(1) lookup) ────────────────────────────────────────────

/** Tenant izolasyonu uygulanan Prisma model adları (küçük harf) */
const TENANT_SCOPED_MODELS: ReadonlySet<string> = new Set([
  'location',        'room',             'usertenant',
  'staffprofile',    'staffworkinghour', 'staffshift',
  'servicecategory', 'service',          'staffservice',
  'product',         'stocklog',         'customer',
  'appointment',     'transactionledger','commissionlog',
  'loyaltytransaction', 'consentform',   'refreshtoken',
  'idempotencykey',  'auditlog',         'message',
  'campaigntemplate','customerphoto',    'referral',
]);

/** Soft-delete filtresi yalnızca bu modellere uygulanır (isDeleted alanı olanlar) */
const SOFT_DELETE_MODELS: ReadonlySet<string> = new Set([
  'tenant',       'user',        'location',    'room',
  'staffprofile', 'servicecategory', 'service', 'product',
  'customer',     'appointment', 'transactionledger', 'customerphoto',
]);

/** tenantId WHERE enjeksiyonu: findUnique HARIÇ bulk okumalar */
const BULK_READ_OPS: ReadonlySet<string> = new Set([
  'findFirst', 'findMany', 'count', 'aggregate', 'groupBy',
]);

/** tenantId enjeksiyonu gereken yazma işlemleri */
const WRITE_OPS: ReadonlySet<string> = new Set([
  'create', 'update', 'upsert', 'delete',
  'createMany', 'updateMany', 'deleteMany',
]);

// ─── Servis ───────────────────────────────────────────────────────────────────

@Injectable()
export class PrismaService extends PrismaClient implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(PrismaService.name);

  constructor() {
    super({
      log: [
        { emit: 'event',  level: 'error' },
        { emit: 'event',  level: 'warn'  },
        ...(process.env['NODE_ENV'] === 'development'
          ? [{ emit: 'stdout' as const, level: 'query' as const }]
          : []),
      ],
    });
  }

  async onModuleInit(): Promise<void> {
    await this.$connect();
    // $connect() tamamlandıktan sonra extension uygulanmalı
    this.applyExtensions();
    this.logger.log('PostgreSQL bağlantısı kuruldu ($extends interceptor aktif)');
  }

  async onModuleDestroy(): Promise<void> {
    await this.$disconnect();
  }

  // ─── $extends: query interceptor ──────────────────────────────────────────

  private applyExtensions(): void {
    // eslint-disable-next-line @typescript-eslint/no-this-alias
    const self = this;

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const extended = (this as any).$extends({
      query: {
        $allModels: {
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          async $allOperations({ model, operation, args, query }: any) {
            const store = tenantContext.getStore();

            // ── 1. Tenant context yok → filtre uygulama (health, seed, @Public) ──
            if (!store?.tenantId) {
              return query(args);
            }

            const { tenantId } = store;
            const modelLower   = (model as string).toLowerCase();

            // ── 2. İç içe çağrı koruması ──────────────────────────────────────
            // SET CONFIG $transaction → query(processedArgs) → interceptor yeniden
            // tetiklenir. Flag set ise: yalnızca filtre uygula, sarmalama yapma.
            if (store.__rlsConfigured) {
              return query(self.applyFilters(args, operation, modelLower, tenantId));
            }

            // ── 3. Filtre enjeksiyonu ─────────────────────────────────────────
            const processedArgs = self.applyFilters(args, operation, modelLower, tenantId);

            // ── 4. Aynı bağlantıda SET CONFIG + sorgu (batch $transaction) ────
            // $transaction dizisi: PostgreSQL aynı bağlantıyı kullanır →
            // set_config transaction-local → başka tenant bağlamı sızmaz.
            store.__rlsConfigured = true;
            try {
              // eslint-disable-next-line @typescript-eslint/no-explicit-any
              const [, result] = await (self as any).$transaction([
                // eslint-disable-next-line @typescript-eslint/no-explicit-any
                (self as any).$executeRawUnsafe(
                  `SELECT set_config('app.tenant_id', $1, true)`,
                  tenantId,
                ),
                query(processedArgs),
              ]);
              return result;
            } finally {
              // Bayrağı her durumda temizle (hata dahil)
              store.__rlsConfigured = false;
            }
          },
        },
      },
    });

    // NestJS DI bağımlılık referansını koruyarak extension'ı uygula
    Object.assign(this, extended);
  }

  // ─── Filtre enjeksiyon yardımcıları ──────────────────────────────────────

  private applyFilters(
    args:      Record<string, unknown>,
    operation: string,
    modelName: string,
    tenantId:  string,
  ): Record<string, unknown> {
    const processed: Record<string, unknown> = { ...args };

    if (TENANT_SCOPED_MODELS.has(modelName)) {
      // Bulk okuma: WHERE tenantId ekle
      if (BULK_READ_OPS.has(operation)) {
        processed['where'] = {
          ...(processed['where'] as Record<string, unknown> ?? {}),
          tenantId,
        };
      }
      // Yazma: operasyon tipine göre tenantId enjekte et
      if (WRITE_OPS.has(operation)) {
        this.injectTenantWrite(processed, operation, tenantId);
      }
    }

    // Soft-delete filtresi (tüm tenant-scoped olmayan modeller dahil)
    if (BULK_READ_OPS.has(operation) && SOFT_DELETE_MODELS.has(modelName)) {
      processed['where'] = {
        ...(processed['where'] as Record<string, unknown> ?? {}),
        isDeleted: false,
      };
    }

    return processed;
  }

  private injectTenantWrite(
    args:      Record<string, unknown>,
    operation: string,
    tenantId:  string,
  ): void {
    switch (operation) {
      case 'create':
        args['data'] = {
          ...(args['data'] as Record<string, unknown> ?? {}),
          tenantId,
        };
        break;

      case 'createMany':
        if (Array.isArray(args['data'])) {
          args['data'] = (args['data'] as Record<string, unknown>[]).map(
            (item) => ({ ...item, tenantId }),
          );
        }
        break;

      case 'update':
      case 'upsert':
      case 'delete':
      case 'updateMany':
      case 'deleteMany':
        args['where'] = {
          ...(args['where'] as Record<string, unknown> ?? {}),
          tenantId,
        };
        break;
    }
  }
}
