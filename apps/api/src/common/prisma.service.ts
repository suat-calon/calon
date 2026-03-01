/**
 * AURALIS PRISMA SERVICE — ÇİFT KATMANLI İZOLASYON KÖPRÜSÜ
 * ──────────────────────────────────────────────────────────────────────────────
 * Prisma v6 uyumlu implementasyon ($use middleware — deprecated ama hâlâ çalışır).
 * Prisma v7'ye geçişte $extends/query API'ye taşınacak.
 *
 * İki kritik görev:
 *   1. Uygulama katmanı filtresi: Toplu sorgularda WHERE tenantId = <current>
 *   2. PostgreSQL RLS köprüsü: set_config('app.tenant_id', ...) ile
 *      PostgreSQL kernel'ına tenant bilgisini enjekte eder
 *
 * Tasarım kararları (v1.1 güncelleme):
 *   - findUnique, middleware'den HARIÇ tutulur: Prisma, unique indeks dışı
 *     alan içeren where nesnesini reddeder. RLS 2. katman olarak korumayı sağlar.
 *   - Soft-delete filtresi YALNIZCA isDeleted alanına sahip modellere uygulanır.
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

// ---------------------------------------------------------------------------
// Tenant izolasyonu uygulanan modeller (Prisma'nın küçük harfli model adları)
// ---------------------------------------------------------------------------
const TENANT_SCOPED_MODELS: readonly string[] = [
  'location',        'room',             'usertenant',
  'staffprofile',    'staffworkinghour', 'staffshift',
  'servicecategory', 'service',          'staffservice',
  'product',         'stocklog',         'customer',
  'appointment',     'transactionledger','commissionlog',
  'loyaltytransaction', 'consentform',   'refreshtoken',
  'idempotencykey',  'auditlog',         'message',
  'campaigntemplate',
];

// ---------------------------------------------------------------------------
// Soft-delete filtresi YALNIZCA bu modellere uygulanır
// (isDeleted alanı olmayan modeller bu listede yer almaz)
// ---------------------------------------------------------------------------
const SOFT_DELETE_MODELS: readonly string[] = [
  'tenant',    'user',     'location',    'room',
  'staffprofile', 'servicecategory', 'service', 'product',
  'customer',  'appointment', 'transactionledger',
];

// findUnique HARIÇ — Prisma unique where'e ek alan kabul etmez
const BULK_READ_OPS = ['findFirst', 'findMany', 'count', 'aggregate', 'groupBy'] as const;
const WRITE_OPS     = ['create', 'update', 'upsert', 'delete', 'createMany', 'updateMany', 'deleteMany'] as const;

// Prisma v6'da $use callback için yerel tip tanımı
// (Prisma.MiddlewareParams v6'da kaldırıldı)
type MiddlewareParams = {
  model?:  string;
  action:  string;
  args:    Record<string, unknown>;
  dataPath: string[];
  runInTransaction: boolean;
};
type MiddlewareNext = (params: MiddlewareParams) => Promise<unknown>;

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

    this.registerMiddleware();
  }

  async onModuleInit(): Promise<void> {
    await this.$connect();
    this.logger.log('PostgreSQL bağlantısı kuruldu');
  }

  async onModuleDestroy(): Promise<void> {
    await this.$disconnect();
  }

  // ---------------------------------------------------------------------------
  // ÇİFT KATMANLI İZOLASYON MİDDLEWARE
  // ---------------------------------------------------------------------------
  private registerMiddleware(): void {

    // ── MİDDLEWARE 1: Tenant izolasyon filtresi ─────────────────────────────
    this.$use(async (params: MiddlewareParams, next: MiddlewareNext) => {
      const store = tenantContext.getStore();

      // Tenant context yoksa (health check, seed, migration, @Public endpoint)
      if (!store?.tenantId) {
        return next(params);
      }

      const { tenantId } = store;
      const modelName    = (params.model ?? '').toLowerCase();

      if (!TENANT_SCOPED_MODELS.includes(modelName)) {
        return next(params);
      }

      // ── KATMAN 1: Uygulama seviyesi filtre enjeksiyonu ──
      // findUnique HARIÇ: unique where'e ek alan eklenmez
      if ((BULK_READ_OPS as readonly string[]).includes(params.action)) {
        params.args['where'] = {
          ...(params.args['where'] as Record<string, unknown> ?? {}),
          tenantId,
        };
      }

      if ((WRITE_OPS as readonly string[]).includes(params.action)) {
        this.injectTenantWrite(params, tenantId);
      }

      // ── KATMAN 2: PostgreSQL RLS köprüsü ──
      // set_config(..., true) = transaction-local
      // Bağlantı havuzunda başka tenant bağlamı sızmaz
      await this.$executeRaw`SELECT set_config('app.tenant_id', ${tenantId}, true)`;

      return next(params);
    });

    // ── MİDDLEWARE 2: Soft-delete filtresi ──────────────────────────────────
    // Yalnızca isDeleted alanına sahip modeller + findUnique hariç bulk okumalar
    this.$use(async (params: MiddlewareParams, next: MiddlewareNext) => {
      const modelName = (params.model ?? '').toLowerCase();

      if (
        (BULK_READ_OPS as readonly string[]).includes(params.action) &&
        SOFT_DELETE_MODELS.includes(modelName)
      ) {
        params.args['where'] = {
          ...(params.args['where'] as Record<string, unknown> ?? {}),
          isDeleted: false,
        };
      }
      return next(params);
    });
  }

  // ---------------------------------------------------------------------------
  // YAZMA İŞLEMLERİNDE TENANT ENJEKSİYONU
  // ---------------------------------------------------------------------------
  private injectTenantWrite(params: MiddlewareParams, tenantId: string): void {
    switch (params.action) {
      case 'create':
        params.args['data'] = {
          ...(params.args['data'] as Record<string, unknown> ?? {}),
          tenantId,
        };
        break;

      case 'createMany':
        if (Array.isArray(params.args['data'])) {
          params.args['data'] = (params.args['data'] as Record<string, unknown>[]).map(
            (item) => ({ ...item, tenantId }),
          );
        }
        break;

      case 'update':
      case 'upsert':
      case 'delete':
      case 'updateMany':
      case 'deleteMany':
        params.args['where'] = {
          ...(params.args['where'] as Record<string, unknown> ?? {}),
          tenantId,
        };
        break;
    }
  }
}
