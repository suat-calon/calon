/**
 * CALON PRISMA SERVICE — ÇİFT KATMANLI İZOLASYON KÖPRÜSÜ
 * ──────────────────────────────────────────────────────────────────────────────
 * Prisma v6 $extends / query interceptor implementasyonu.
 *
 * Katman 1 — Uygulama filtresi (interceptor):
 *   Toplu sorgulara WHERE tenantId = <current> enjekte eder.
 *   Interceptor $transaction/set_config YAPMAZ — saf filtre.
 *
 * Katman 2 — PostgreSQL RLS ($tenantTransaction):
 *   Interactive $transaction içinde set_config('app.tenant_id', ...) çağırır.
 *   RLS policy'leri NULLIF ile boş string'e toleranslıdır (crash yerine 0 satır).
 *
 * Tasarım kararları (v3.0 — filter-only interceptor):
 *   - $extends.query.$allModels.$allOperations: tüm model+operasyonları yakalar.
 *   - Interceptor SADECE WHERE/data filtresi uygular, doğrudan query() döner.
 *   - $tenantTransaction: interactive tx + set_config → RLS uyumlu.
 *   - findUnique HARIÇ: unique where'e ek alan eklenmez.
 *   - Object.assign(this, extended): NestJS DI referansını korur.
 * ──────────────────────────────────────────────────────────────────────────────
 */

import {
  Injectable,
  OnModuleInit,
  OnModuleDestroy,
  Logger,
} from '@nestjs/common';
import { Prisma, PrismaClient } from '@prisma/client';
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
  'campaigntemplate','customerphoto',    'payment',
  'referral',        'appointmenthold',
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

            // Tenant context yok → filtre uygulama (health, seed, @Public)
            if (!store?.tenantId) {
              return query(args);
            }

            const { tenantId } = store;
            const modelLower   = (model as string).toLowerCase();

            // Filtre enjeksiyonu → doğrudan query() çağır
            // set_config/RLS sorumluluğu $tenantTransaction'dadır.
            const processedArgs = self.applyFilters(args, operation, modelLower, tenantId);
            return query(processedArgs);
          },
        },
      },
    });

    // NestJS DI bağımlılık referansını koruyarak extension'ı uygula
    Object.assign(this, extended);
  }

  // ─── Interactive $transaction + RLS köprüsü ────────────────────────────────

  /**
   * Interactive $transaction içinde RLS set_config garantisi sağlar.
   *
   * Interceptor artık set_config YAPMAZ — sadece WHERE filtresi uygular.
   * RLS gerektiren interactive transaction'lar bu helper ile sarılmalıdır:
   *   1. tx.$executeRawUnsafe(set_config) → aynı connection'da tenant_id
   *   2. Callback içindeki tüm sorgular (model + raw) RLS ile uyumlu çalışır
   *
   * RLS policy'leri NULLIF ile toleranslı: set_config yapılmamış sorgularda
   * boş string → NULL → satır dönmez (crash yerine).
   */
  async $tenantTransaction<T>(
    fn: (tx: Prisma.TransactionClient) => Promise<T>,
    options?: { maxWait?: number; timeout?: number; isolationLevel?: Prisma.TransactionIsolationLevel },
  ): Promise<T> {
    const store = tenantContext.getStore();
    const tenantId = store?.tenantId;

    // Tenant context yoksa → normal $transaction (seed, migration, vb.)
    if (!tenantId) {
      return this.$transaction(fn, options);
    }

    return this.$transaction(async (tx) => {
      // Aynı connection'da set_config → RLS policy tenant_id'yi görür
      await tx.$executeRawUnsafe(
        `SELECT set_config('app.tenant_id', $1, true)`,
        tenantId,
      );
      return fn(tx);
    }, options);
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
