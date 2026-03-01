/**
 * AURALIS PRISMA SERVICE — ÇİFT KATMANLI İZOLASYON KÖPRÜSÜ
 * ──────────────────────────────────────────────────────────────────────────────
 * Prisma v6 uyumlu implementasyon ($use middleware — deprecated ama hâlâ çalışır).
 * Prisma v7'ye geçişte $extends/query API'ye taşınacak.
 *
 * İki kritik görev:
 *   1. Uygulama katmanı filtresi: Her sorguda WHERE tenantId = <current>
 *   2. PostgreSQL RLS köprüsü: set_config('app.tenant_id', ...) ile
 *      PostgreSQL kernel'ına tenant bilgisini enjekte eder
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

// Tenant izolasyonu uygulanan modeller (küçük harf — Prisma model adı)
const TENANT_SCOPED_MODELS: readonly string[] = [
  'location',     'room',           'usertenant',
  'staffprofile', 'staffworkinghour', 'staffshift',
  'servicecategory', 'service',     'staffservice',
  'product',      'stocklog',       'customer',
  'appointment',  'transactionledger', 'commissionlog',
  'loyaltytransaction', 'consentform', 'refreshtoken',
  'idempotencykey', 'auditlog',     'message',
  'campaigntemplate',
];

const READ_OPS  = ['findUnique', 'findFirst', 'findMany', 'count', 'aggregate', 'groupBy'];
const WRITE_OPS = ['create', 'update', 'upsert', 'delete', 'createMany', 'updateMany', 'deleteMany'];

// Prisma v6'da $use callback için tip tanımı
type MiddlewareParams = {
  model?:  string;
  action:  string;
  args:    Record<string, any>;
  dataPath: string[];
  runInTransaction: boolean;
};
type MiddlewareNext = (params: MiddlewareParams) => Promise<any>;

@Injectable()
export class PrismaService extends PrismaClient implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(PrismaService.name);

  constructor() {
    super({
      log: [
        { emit: 'event', level: 'error' },
        { emit: 'event', level: 'warn' },
        // 'query' log'u production'da kapatılır
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
    // Ana tenant izolasyon middleware'i
    this.$use(async (params: MiddlewareParams, next: MiddlewareNext) => {
      const store = tenantContext.getStore();

      // Tenant context yoksa (health check, seed, migration) dokunma
      if (!store?.tenantId) {
        return next(params);
      }

      const { tenantId } = store;
      const modelName = (params.model ?? '').toLowerCase();

      if (!TENANT_SCOPED_MODELS.includes(modelName)) {
        return next(params);
      }

      // -------------------------------------------------------------------
      // KATMAN 1: Uygulama seviyesi filtre enjeksiyonu
      // Geliştirici WHERE'e tenantId koymayı unutsa bile Prisma ekler
      // -------------------------------------------------------------------
      this.injectTenantFilter(params, tenantId);

      // -------------------------------------------------------------------
      // KATMAN 2: PostgreSQL RLS köprüsü
      // set_config(..., true) = transaction-local (sadece bu TX'de geçerli)
      // Connection pool'da başka bir tenant'ın bağlamı sızmaz
      // -------------------------------------------------------------------
      await this.$executeRaw`SELECT set_config('app.tenant_id', ${tenantId}, true)`;

      return next(params);
    });

    // Soft-delete filtresi: isDeleted:false her okuma sorgusuna eklenir
    this.$use(async (params: MiddlewareParams, next: MiddlewareNext) => {
      if (READ_OPS.includes(params.action)) {
        params.args ??= {};
        params.args['where'] = {
          ...(params.args['where'] ?? {}),
          isDeleted: false,
        };
      }
      return next(params);
    });
  }

  // ---------------------------------------------------------------------------
  // TENANT FİLTRESİ ENJEKSİYONU
  // ---------------------------------------------------------------------------
  private injectTenantFilter(params: MiddlewareParams, tenantId: string): void {
    params.args ??= {};

    if (READ_OPS.includes(params.action)) {
      params.args['where'] = {
        ...(params.args['where'] ?? {}),
        tenantId,
      };
    }

    if (WRITE_OPS.includes(params.action)) {
      switch (params.action) {
        case 'create':
          params.args['data'] = { ...(params.args['data'] ?? {}), tenantId };
          break;

        case 'createMany':
          if (Array.isArray(params.args['data'])) {
            params.args['data'] = params.args['data'].map(
              (item: Record<string, unknown>) => ({ ...item, tenantId }),
            );
          }
          break;

        case 'update':
        case 'upsert':
        case 'delete':
        case 'updateMany':
        case 'deleteMany':
          params.args['where'] = {
            ...(params.args['where'] ?? {}),
            tenantId,
          };
          break;
      }
    }
  }
}
