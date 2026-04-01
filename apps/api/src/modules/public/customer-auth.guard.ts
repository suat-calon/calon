/**
 * CUSTOMER AUTH GUARD — Customer Portal Phase 1
 * ──────────────────────────────────────────────────────────────────────────────
 * Customer session JWT'sini doğrular.
 * Tenant-scoped: customerId + tenantId token'dan alınır.
 * Staff/tenant JWT'leri reddeder (type !== 'customer').
 * ──────────────────────────────────────────────────────────────────────────────
 */

import {
  Injectable,
  CanActivate,
  ExecutionContext,
  UnauthorizedException,
} from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { CustomerSessionPayload } from './customer-auth.service';

@Injectable()
export class CustomerAuthGuard implements CanActivate {
  constructor(private readonly jwtService: JwtService) {}

  canActivate(context: ExecutionContext): boolean {
    const request = context.switchToHttp().getRequest<{
      headers: { authorization?: string };
      cookies: Record<string, string>;
      customerId?: string;
      customerTenantId?: string;
    }>();

    // Token: Authorization header veya calon_customer cookie
    const authHeader = request.headers.authorization;
    let token: string | undefined;

    if (authHeader?.startsWith('Bearer ')) {
      token = authHeader.slice(7);
    } else if (request.cookies?.['calon_customer']) {
      token = request.cookies['calon_customer'] as string;
    }

    if (!token) {
      throw new UnauthorizedException('Müşteri oturumu bulunamadı. Lütfen giriş yapın.');
    }

    let payload: CustomerSessionPayload;
    try {
      payload = this.jwtService.verify<CustomerSessionPayload>(token);
    } catch {
      throw new UnauthorizedException('Oturum süresi dolmuş. Lütfen tekrar giriş yapın.');
    }

    // Type check: staff/tenant JWT'leri reddet
    if (payload.type !== 'customer') {
      throw new UnauthorizedException('Geçersiz oturum türü.');
    }

    if (!payload.customerId || !payload.tenantId) {
      throw new UnauthorizedException('Oturum bilgisi eksik.');
    }

    // Request'e ekle — controller'lar erişebilir
    request.customerId       = payload.customerId;
    request.customerTenantId = payload.tenantId;

    return true;
  }
}
