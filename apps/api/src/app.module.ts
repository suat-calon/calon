import { Module }              from '@nestjs/common';
import { ConfigModule }        from '@nestjs/config';
import { APP_GUARD }           from '@nestjs/core';
import { JwtModule }           from '@nestjs/jwt';
import { DatabaseModule }      from './common/database.module';
import { RedisModule }         from './common/redis.module';
import { TenantGuard }         from './modules/iam/guards/tenant.guard';

@Module({
  imports: [
    // Env değişkenlerini tüm modüllere sun
    ConfigModule.forRoot({
      isGlobal:   true,
      envFilePath: ['.env.local', '.env'],
    }),

    // JWT — TenantGuard tarafından kullanılır
    JwtModule.register({
      global:  true,
      secret:  process.env.JWT_SECRET ?? 'CHANGE_IN_PRODUCTION',
      signOptions: { expiresIn: '15m' }, // Kısa ömürlü access token
    }),

    // Veritabanı (Global — tüm modüllere açık)
    DatabaseModule,

    // Redis / BullMQ (Global)
    RedisModule,

    // Modüller buraya eklenecek (v1 sprint'lerde)
    // IamModule,
    // OperationsModule,
  ],
  providers: [
    // TenantGuard global — tüm endpoint'leri korur
    // @Public() decorator ile seçici olarak devre dışı bırakılır
    {
      provide:  APP_GUARD,
      useClass: TenantGuard,
    },
  ],
})
export class AppModule {}
