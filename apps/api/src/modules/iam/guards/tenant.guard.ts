/**
 * TENANT GUARD — İZOLASYON KÖPRÜSÜNÜN GİRİŞ KAPISI
 * ──────────────────────────────────────────────────────────────────────────────
 * Her korumalı HTTP isteğinde:
 *   1. Authorization header'dan JWT'yi doğrular
 *   2. tenantId'yi SADECE doğrulanmış token'dan alır (body/query'den ASLA)
 *   3. AsyncLocalStorage'a (tenantContext) yazar
 *   4. Prisma middleware bu store'u okuyarak DB sorgularına enjekte eder
 *
 * IDOR Koruması: tenantId kullanıcı girdisinden hiçbir zaman alınmaz.
 * ──────────────────────────────────────────────────────────────────────────────
 */

import {
  Injectable,
  CanActivate,
  ExecutionContext,
  UnauthorizedException,
  ForbiddenException,
} from '@nestjs/common';
import { JwtService }     from '@nestjs/jwt';
import { Reflector }      from '@nestjs/core';
import { tenantContext }  from '../../../common/tenant.context';

export const IS_PUBLIC_KEY = 'isPublic';

/** @Public() decorator — guard'ı atlayan endpoint'ler için */
import { SetMetadata } from '@nestjs/common';
export const Public = () => SetMetadata(IS_PUBLIC_KEY, true);

export interface JwtPayload {
  sub:      string;  // userId
  tenantId: string;
  role:     string;
  iat?:     number;
  exp?:     number;
}

@Injectable()
export class TenantGuard implements CanActivate {
  constructor(
    private readonly jwtService: JwtService,
    private readonly reflector:  Reflector,
  ) {}

  canActivate(context: ExecutionContext): Promise<boolean> {
    // @Public() ile işaretlenmiş endpoint'leri atla
    const isPublic = this.reflector.getAllAndOverride<boolean>(IS_PUBLIC_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (isPublic) return Promise.resolve(true);

    const request = context.switchToHttp().getRequest<{
      headers: { authorization?: string };
      tenantId?: string;
      userId?:   string;
      userRole?: string;
    }>();

    const authHeader = request.headers.authorization;
    if (!authHeader?.startsWith('Bearer ')) {
      throw new UnauthorizedException('Authorization header eksik veya hatalı.');
    }

    const token = authHeader.slice(7);

    let payload: JwtPayload;
    try {
      payload = this.jwtService.verify<JwtPayload>(token);
    } catch {
      throw new UnauthorizedException('Token geçersiz veya süresi dolmuş.');
    }

    if (!payload.tenantId) {
      throw new ForbiddenException('Token içinde tenant bilgisi bulunamadı.');
    }
    if (!payload.sub) {
      throw new ForbiddenException('Token içinde kullanıcı bilgisi bulunamadı.');
    }

    // Request'e ekle (controller'lar @Req() ile erişebilir)
    request.tenantId = payload.tenantId;
    request.userId   = payload.sub;
    request.userRole = payload.role;

    // AsyncLocalStorage'a yaz — Prisma middleware buradan okuyacak
    return new Promise<boolean>((resolve) => {
      tenantContext.run(
        {
          tenantId: payload.tenantId,
          userId:   payload.sub,
          userRole: payload.role,
        },
        () => resolve(true),
      );
    });
  }
}
