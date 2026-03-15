/**
 * TENANT GUARD — İZOLASYON KÖPRÜSÜNÜN GİRİŞ KAPISI
 * ──────────────────────────────────────────────────────────────────────────────
 * Her korumalı HTTP isteğinde:
 *   1. JWT'yi önce Authorization header'dan, yoksa calon_access cookie'den alır
 *      (HttpOnly cookie: XSS'e karşı localStorage'dan daha güvenli)
 *   2. tenantId'yi SADECE doğrulanmış token'dan alır (body/query'den ASLA)
 *   3. AsyncLocalStorage'a (tenantContext) yazar
 *   4. Prisma $extends interceptor bu store'u okuyarak DB sorgularına enjekte eder
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
  /** Tenant plan — plan gating için (Pro+ özellikleri) */
  plan?:    string;
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
      cookies:     Record<string, string>;
      tenantId?:   string;
      userId?:     string;
      userRole?:   string;
      tenantPlan?: string;  // Plan gating (Pro+)
    }>();

    // JWT önce Authorization header'dan, yoksa HttpOnly cookie'den alınır
    const authHeader = request.headers.authorization;
    let token: string | undefined;

    if (authHeader?.startsWith('Bearer ')) {
      token = authHeader.slice(7);
    } else if (request.cookies?.['calon_access']) {
      token = request.cookies['calon_access'] as string;
    }

    if (!token) {
      throw new UnauthorizedException('Authorization header veya oturum cookie\'si eksik.');
    }

    let payload: JwtPayload;
    try {
      payload = this.jwtService.verify<JwtPayload>(token);
    } catch {
      throw new UnauthorizedException('Token geçersiz veya süresi dolmuş.');
    }

    if (!payload.sub) {
      throw new ForbiddenException('Token içinde kullanıcı bilgisi bulunamadı.');
    }

    // SUPER_ADMIN: tenantId zorunlu değil — platform-level erişim
    if (!payload.tenantId && payload.role !== 'SUPER_ADMIN') {
      throw new ForbiddenException('Token içinde tenant bilgisi bulunamadı.');
    }

    // Request'e ekle (controller'lar @Req() ile erişebilir)
    request.tenantId   = payload.tenantId;
    request.userId     = payload.sub;
    request.userRole   = payload.role;
    request.tenantPlan = payload.plan ?? 'SOLO'; // Plan gating için

    // AsyncLocalStorage'a yaz — Prisma interceptor buradan okuyacak
    // SUPER_ADMIN için tenantId olmayabilir; context yine de çalışır
    //
    // enterWith(): Mevcut async execution context'e store'u bağlar.
    // run() + callback pattern'ı NestJS guard pipeline'ında ÇALIŞMAZ:
    //   run(store, () => resolve(true)) → callback biter → context kaybolur →
    //   controller/service'te getStore() = undefined → RLS patlar.
    // enterWith() ise callback gerektirmez — store, request'in tüm async
    // zinciri boyunca (controller → service → Prisma) aktif kalır.
    const tenantId = payload.tenantId ?? 'super_admin';
    tenantContext.enterWith({
      tenantId,
      userId:   payload.sub,
      userRole: payload.role,
    });
    return Promise.resolve(true);
  }
}
