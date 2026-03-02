import { Module }              from '@nestjs/common';
import { ConfigModule }        from '@nestjs/config';
import { APP_GUARD }           from '@nestjs/core';
import { JwtModule }           from '@nestjs/jwt';
import { DatabaseModule }      from './common/database.module';
import { RedisModule }         from './common/redis.module';
import { TenantGuard }         from './modules/iam/guards/tenant.guard';
import { IamModule }           from './modules/iam/iam.module';
import { OperationsModule }    from './modules/operations/operations.module';
import { InventoryModule }     from './modules/inventory/inventory.module';
import { CatalogModule }       from './modules/catalog/catalog.module';
import { FinanceModule }       from './modules/finance/finance.module';
import { CrmModule }          from './modules/crm/crm.module';
import { StaffModule }        from './modules/staff/staff.module';

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
  ],
  providers: [
    // ── TenantGuard global: Tüm endpoint'leri korur ──────────────────────────
    // @Public() decorator ile seçici olarak devre dışı bırakılır
    {
      provide:  APP_GUARD,
      useClass: TenantGuard,
    },
  ],
})
export class AppModule {}
