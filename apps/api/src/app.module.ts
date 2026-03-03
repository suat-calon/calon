import { Module }              from '@nestjs/common';
import { ConfigModule }        from '@nestjs/config';
import { APP_GUARD }           from '@nestjs/core';
import { JwtModule }           from '@nestjs/jwt';
import { DatabaseModule }      from './common/database.module';
import { RedisModule }         from './common/redis.module';
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
import { LoyaltyModule }     from './modules/loyalty/loyalty.module';

@Module({
  imports: [
    // ── Ortam değişkenleri (global) ──────────────────────────────────────────
    ConfigModule.forRoot({
      isGlobal:    true,
      envFilePath: ['.env.local', '.env'],
    }),

    // ── JWT — global, TenantGuard + AuthService tarafından kullanılır ────────
    // signOptions.expiresIn: Access token varsayılanı.
    // AuthService.generateTokenPair() bu ayarı devralır.
    JwtModule.register({
      global:      true,
      secret:      process.env['JWT_SECRET'] ?? 'CHANGE_IN_PRODUCTION',
      signOptions: { expiresIn: '15m' },
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
  ],
  providers: [
    // ── TenantGuard global: JWT doğrulama + tenantId enjeksiyonu ─────────────
    {
      provide:  APP_GUARD,
      useClass: TenantGuard,
    },
    // ── BillingGuard global: SUSPENDED/PAST_DUE erişim kontrolü (Faz 12) ────
    // TenantGuard'dan sonra çalışır (sıra önemli — provider sırası = çalışma sırası)
    {
      provide:  APP_GUARD,
      useClass: BillingGuard,
    },
  ],
})
export class AppModule {}
