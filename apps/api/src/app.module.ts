import { Module, NestModule, MiddlewareConsumer }  from '@nestjs/common';
import { envValidationSchema } from './config/env.validation';
import { ConfigModule }        from '@nestjs/config';
import { APP_FILTER, APP_GUARD, APP_INTERCEPTOR } from '@nestjs/core';
import { JwtModule }           from '@nestjs/jwt';
import { ThrottlerModule, ThrottlerGuard } from '@nestjs/throttler';
import type Redis              from 'ioredis';
import { DatabaseModule }      from './common/database.module';
import { RedisModule, REDIS_CLIENT } from './common/redis.module';
import { RedisThrottlerStorage } from './common/throttler/redis-throttler.storage';
import { LoggingModule }            from './common/logging/logging.module';
import { CorrelationMiddleware }         from './common/logging/correlation.middleware';
import { RequestLoggerMiddleware }       from './common/middleware/request-logger.middleware';
import { LoggingInterceptor }       from './common/logging/logging.interceptor';
import { ThrottlerExceptionFilter } from './common/logging/throttler-exception.filter';
import { TenantGuard }         from './modules/iam/guards/tenant.guard';
import { BillingGuard }        from './modules/billing/guards/billing.guard';
import { IamModule }           from './modules/iam/iam.module';
import { BillingModule }       from './modules/billing/billing.module';
import { OperationsModule }    from './modules/operations/operations.module';
import { InventoryModule }     from './modules/inventory/inventory.module';
import { CatalogModule }       from './modules/catalog/catalog.module';
import { FinanceModule }       from './modules/finance/finance.module';
import { CrmModule }          from './modules/crm/crm.module';
import { StaffModule }        from './modules/staff/staff.module';
import { LoyaltyModule }      from './modules/loyalty/loyalty.module';
import { OnboardingModule }  from './modules/onboarding/onboarding.module';
import { PublicModule }      from './modules/public/public.module';
// ── Faz 24: Event & Notification Backbone ──────────────────────────────────
import { EventModule }        from './modules/event/event.module';
import { DeliveryModule }     from './modules/delivery/delivery.module';
import { ProviderModule }     from './modules/provider/provider.module';
import { NotificationModule } from './modules/notification/notification.module';
import { WorkerModule }       from './modules/worker/worker.module';
import { HealthModule }       from './modules/health/health.module';
// ── Faz 5: Super Admin Platform ───────────────────────────────────────────────
import { AdminModule }       from './modules/admin/admin.module';

@Module({
  imports: [
    // ── Ortam değişkenleri (global) ──────────────────────────────────────────
    ConfigModule.forRoot({
      isGlobal:         true,
      validationSchema: envValidationSchema,
      envFilePath:      ['.env.local', '.env'],
    }),

    // ── JWT — global, TenantGuard + AuthService tarafından kullanılır ────────
    JwtModule.register({
      global:      true,
      secret:      process.env['JWT_SECRET'] ?? 'CHANGE_IN_PRODUCTION',
      signOptions: { expiresIn: '15m' },
    }),

    // ── Observability: Pino logger + CorrelationMiddleware + Metrics ─────────
    // (Faz 13 — console.log YASAK, Pino kullan)
    LoggingModule,

    // ── Rate limiting (global, Redis-backed) — ThrottlerGuard APP_GUARD ile ──
    // Default: 100 istek / 60 saniye per IP (generous — internal API).
    // @Throttle() dekoratörü endpoint bazlı override sağlar (örn: POST /public/holds: 10/60s).
    // Redis storage: yatay ölçekleme ve pod yeniden başlatma sonrası sayaç korunur.
    ThrottlerModule.forRootAsync({
      inject:      [REDIS_CLIENT],
      useFactory: (redis: Redis) => ({
        throttlers: [{ name: 'default', ttl: 60_000, limit: 100 }],
        storage:    new RedisThrottlerStorage(redis),
      }),
    }),

    // ── Veritabanı (global — PrismaService tüm modüllere açık) ──────────────
    DatabaseModule,

    // ── Redis / BullMQ (global) ───────────────────────────────────────────────
    RedisModule,

    // ── IAM: Kayıt, giriş, token yenileme ────────────────────────────────────
    IamModule,

    // ── Billing: Plan Engine, Entitlements, State Machine, Cron (Faz 12) ────
    BillingModule,

    // ── Operations: Randevu motoru ────────────────────────────────────────────
    OperationsModule,

    // ── Inventory: Asenkron stok düşüm worker'ı ──────────────────────────────
    InventoryModule,

    // ── Catalog: Ürün ve hizmet kataloğu ─────────────────────────────────────
    CatalogModule,

    // ── Finance: Değiştirilemez defter, kaparo ve ödeme işlemleri ─────────────
    FinanceModule,

    // ── CRM: Müşteri profilleri, KVKK/GDPR motoru, onam formları, galeri ──────
    CrmModule,

    // ── Staff: Personel profili, çalışma saatleri, vardiya ve hakediş ────────
    StaffModule,

    // ── Loyalty: Sadakat puanı motoru (Faz 11 — Pro+ plan zorunlu) ───────────
    LoyaltyModule,

    // ── Onboarding: Self-service kayıt + wizard (Faz 15) ─────────────────────
    OnboardingModule,

    // ── Public Booking: SEO salon sayfası + booking engine (Faz 16) ──────────
    PublicModule,

    // ── Faz 24: Event & Notification Backbone ────────────────────────────────
    EventModule,        // @Global — OutboxRepository, EventProducerService
    DeliveryModule,     // @Global — DeliveryRepository
    ProviderModule,     // @Global — ProviderRegistryService + stub adapter'lar
    NotificationModule, // @Global — TemplateResolver, PreferenceResolver, CostPolicyEngine
    WorkerModule,       // Dispatcher + Delivery + Recovery processor'lar + cron

    // ── Health: Docker healthcheck + uptime probe ─────────────────────────────
    HealthModule,       // GET /api/v1/health → { status: 'ok' } — @Public(), auth bypass

    // ── Faz 5: Super Admin Platform ──────────────────────────────────────────
    AdminModule,        // GET/POST /api/v1/admin/tenants/** — x-admin-api-key guard
  ],
  providers: [
    // ── ThrottlerGuard global: rate limiting (Faz 23) ────────────────────────
    // @Throttle() dekoratörü endpoint bazlı override; @SkipThrottle() devre dışı bırakır.
    {
      provide:  APP_GUARD,
      useClass: ThrottlerGuard,
    },
    // ── TenantGuard global: JWT doğrulama + tenantId enjeksiyonu ─────────────
    {
      provide:  APP_GUARD,
      useClass: TenantGuard,
    },
    // ── BillingGuard global: SUSPENDED/PAST_DUE erişim kontrolü (Faz 12) ────
    {
      provide:  APP_GUARD,
      useClass: BillingGuard,
    },
    // ── LoggingInterceptor global: her request için structured log + metrics ─
    {
      provide:  APP_INTERCEPTOR,
      useClass: LoggingInterceptor,
    },
    // ── ThrottlerExceptionFilter global: 429 → Prometheus rate_limit_rejections_total ──
    {
      provide:  APP_FILTER,
      useClass: ThrottlerExceptionFilter,
    },
  ],
})
export class AppModule implements NestModule {
  /**
   * CorrelationMiddleware'i tüm route'lara uygular.
   * Guard'lardan önce çalışır → correlationId her log satırında mevcut olur.
   */
  configure(consumer: MiddlewareConsumer): void {
    consumer
      .apply(CorrelationMiddleware, RequestLoggerMiddleware)
      .forRoutes('*');
  }
}
