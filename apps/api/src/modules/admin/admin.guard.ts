/**
 * ADMIN GUARD — JWT role-based super admin access control
 * ──────────────────────────────────────────────────────────────────────────────
 * Super Admin endpoint'lerine erişim yalnızca JWT'de role=SUPER_ADMIN olan
 * oturumlara açıktır.
 *
 * Tasarım kararı:
 *   • TenantGuard JWT'yi parse edip request'e userId/tenantId/role atar.
 *   • AdminGuard, TenantGuard'dan SONRA çalışır ve role kontrolü yapar.
 *   • SUPER_ADMIN kullanıcıları tenantId olmadan platform-level erişim alır.
 *   • Diğer roller (TENANT_OWNER, STAFF vb.) reddedilir.
 *
 * Migrasyon notu:
 *   Önceki model x-admin-api-key header'ına dayanıyordu.
 *   Bu model JWT session tabanlı gerçek auth'a taşınmıştır (2026-03-31).
 * ──────────────────────────────────────────────────────────────────────────────
 */

import {
  Injectable,
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  UnauthorizedException,
} from '@nestjs/common';

@Injectable()
export class AdminGuard implements CanActivate {
  canActivate(context: ExecutionContext): boolean {
    const request = context.switchToHttp().getRequest<{
      userId?: string;
      userRole?: string;
    }>();

    // TenantGuard should have already parsed JWT and set userId/userRole
    if (!request.userId) {
      throw new UnauthorizedException(
        'Oturum bulunamadı. Lütfen giriş yapın.',
      );
    }

    if (request.userRole !== 'SUPER_ADMIN') {
      throw new ForbiddenException(
        'Bu alan yalnızca platform yöneticilerine açıktır.',
      );
    }

    return true;
  }
}
