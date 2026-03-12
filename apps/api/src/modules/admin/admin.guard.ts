/**
 * ADMIN GUARD — x-admin-api-key header doğrulama
 * ──────────────────────────────────────────────────────────────────────────────
 * Super Admin API'ye erişim için gelen istek, `x-admin-api-key` header'ında
 * ADMIN_API_KEY ortam değişkeniyle eşleşen bir değer taşımalıdır.
 *
 * Tasarım kararı:
 *   • AdminController, global TenantGuard'ı @Public() ile atlar.
 *   • AdminGuard yalnızca controller seviyesinde uygulanır —
 *     JWT tabanlı kimlik doğrulamanın yerini almaz, kendi katmanını kurar.
 *   • ADMIN_API_KEY ortamda yoksa tüm erişim reddedilir (fail-closed).
 * ──────────────────────────────────────────────────────────────────────────────
 */

import {
  Injectable,
  CanActivate,
  ExecutionContext,
  UnauthorizedException,
} from '@nestjs/common';
import type { Request } from 'express';

@Injectable()
export class AdminGuard implements CanActivate {
  canActivate(context: ExecutionContext): boolean {
    const request  = context.switchToHttp().getRequest<Request>();
    const provided = request.headers['x-admin-api-key'];
    const expected = process.env['ADMIN_API_KEY'];

    // Fail-closed: ortam değişkeni yoksa erişim kapalı
    if (!expected) {
      throw new UnauthorizedException(
        'Admin API anahtarı sunucu tarafında yapılandırılmamış.',
      );
    }

    if (!provided || provided !== expected) {
      throw new UnauthorizedException(
        "Geçersiz veya eksik x-admin-api-key header'ı.",
      );
    }

    return true;
  }
}
