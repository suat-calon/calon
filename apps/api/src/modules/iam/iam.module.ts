import { Module }           from '@nestjs/common';
import { AuthService }      from './auth.service';
import { AuthController }   from './auth.controller';
import { TenantController } from './tenant.controller';

/**
 * IAM Module — Kimlik ve Erişim Yönetimi
 *
 * Bağımlılıklar (AppModule üzerinden global):
 *   - JwtModule    : @nestjs/jwt (global, AppModule'de kayıtlı)
 *   - DatabaseModule: PrismaService (global, DatabaseModule'de kayıtlı)
 *   - ConfigModule : @nestjs/config (global, AppModule'de kayıtlı)
 */
@Module({
  controllers: [AuthController, TenantController],
  providers:   [AuthService],
  exports:     [AuthService],
})
export class IamModule {}
