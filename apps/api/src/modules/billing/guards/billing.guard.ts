/**
 * BILLING GUARD — Abonelik Durumu Kapı Bekçisi (Default-Deny)
 * ──────────────────────────────────────────────────────────────────────────────
 * Katman 1: Global guard (TenantGuard'dan sonra çalışır)
 *
 * Kurallar:
 *   SUSPENDED:
 *     - Sadece whitelist path prefix'leri VEYA @AllowPastDue() dekoratörüne izin ver
 *     - Diğerleri → 402 Payment Required + errorCode=SUSPENDED
 *
 *   PAST_DUE (Default-Deny):
 *     - @AllowPastDue() varsa → geçir
 *     - GET/HEAD (okuma) → geçir
 *     - POST/PUT/PATCH/DELETE (yazma) → 402 Payment Required + errorCode=PAST_DUE
 *
 *   TRIAL / ACTIVE / CANCELED: herhangi bir kısıtlama yok.
 * ──────────────────────────────────────────────────────────────────────────────
 */

import {
  Injectable,
  CanActivate,
  ExecutionContext,
  HttpException,
  HttpStatus,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';

import { EntitlementsService } from '../entitlements.service';
import { ALLOW_PAST_DUE_KEY } from '../decorators/allow-past-due.decorator';
import { IS_PUBLIC_KEY }      from '../../iam/guards/tenant.guard';

// ── SUSPENDED whitelist path prefix'leri ─────────────────────────────────────
const SUSPENDED_WHITELIST = [
  '/api/v1/iam',        // /login, /refresh, /logout
  '/api/v1/auth',       // auth controller gerçek path'i
  '/api/v1/billing',    // ödeme ekranı
  '/health',            // uptime check
];

// ── Yazma metodları ───────────────────────────────────────────────────────────
const WRITE_METHODS = new Set(['POST', 'PUT', 'PATCH', 'DELETE']);

// ── Guard ─────────────────────────────────────────────────────────────────────

@Injectable()
export class BillingGuard implements CanActivate {
  constructor(
    private readonly entitlements: EntitlementsService,
    private readonly reflector:    Reflector,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    // @Public() endpoint'leri atla
    const isPublic = this.reflector.getAllAndOverride<boolean>(IS_PUBLIC_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (isPublic) return true;

    const request = context.switchToHttp().getRequest<{
      tenantId?:   string;
      tenantPlan?: string;
      userRole?:   string;
      url?:        string;
      method?:     string;
    }>();

    const tenantId = request.tenantId;
    if (!tenantId) return true; // TenantGuard zaten reddetti, burada geçir

    // SUPER_ADMIN her zaman geçer — platform operasyonları kısıtlanamaz
    if (request.userRole === 'SUPER_ADMIN') return true;

    // ── @AllowPastDue() whitelist kontrolü ──────────────────────────────────
    const isAllowed = this.reflector.getAllAndOverride<boolean>(ALLOW_PAST_DUE_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (isAllowed) return true;

    // ── EntitlementsService'den durum al ────────────────────────────────────
    const ent = await this.entitlements.getEntitlements(
      tenantId,
      request.tenantPlan ?? 'SOLO',
    );

    // ── SUSPENDED kontrolü ──────────────────────────────────────────────────
    if (ent.status === 'SUSPENDED') {
      const path = (request.url ?? '').split('?')[0] ?? '';
      const pathAllowed = SUSPENDED_WHITELIST.some(prefix => path.startsWith(prefix));

      if (!pathAllowed) {
        throw new HttpException(
          { message: 'Hesabınız askıya alındı. Lütfen ödeme yapın.', errorCode: 'SUSPENDED' },
          HttpStatus.PAYMENT_REQUIRED,
        );
      }
      return true;
    }

    // ── PAST_DUE — Default-Deny (write metodları) ────────────────────────────
    if (ent.status === 'PAST_DUE') {
      const method = (request.method ?? 'GET').toUpperCase();
      if (WRITE_METHODS.has(method)) {
        throw new HttpException(
          {
            message:   'Ödeme gecikti. Bu işlemi gerçekleştirmek için ödemenizi tamamlayın.',
            errorCode: 'PAST_DUE',
          },
          HttpStatus.PAYMENT_REQUIRED,
        );
      }
    }

    return true;
  }
}
