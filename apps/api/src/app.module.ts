import { Module }              from '@nestjs/common';
import { ConfigModule }        from '@nestjs/config';
import { APP_GUARD }           from '@nestjs/core';
import { JwtModule }           from '@nestjs/jwt';
import { DatabaseModule }      from './common/database.module';
import { RedisModule }         from './common/redis.module';
import { TenantGuard }         from './modules/iam/guards/tenant.guard';
import { IamModule }           from './modules/iam/iam.module';

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

    // Gelecek modüller (v1 sprint'lerinde açılacak):
    // OperationsModule,   // Randevu, müşteri, personel CRUD
    // FinanceModule,      // Ödeme ve komisyon
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
