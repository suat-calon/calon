/**
 * BILLING GUARD — Abonelik Durumu Kapı Bekçisi
 * ──────────────────────────────────────────────────────────────────────────────
 * Katman 1: Global guard (TenantGuard'dan sonra çalışır)
 *
 * Kurallar:
 *   SUSPENDED:
 *     - Sadece whitelist endpoint'lere izin ver (billing, auth, health)
 *     - Diğerleri → 402 Payment Required + errorCode=SUSPENDED
 *
 *   PAST_DUE:
 *     - @BlockWhenPastDue() metadata'sı olan endpoint'ler → 402
 *     - Diğerleri → geçir (login, okuma işlemleri vs.)
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
import { BLOCK_WHEN_PAST_DUE_KEY } from '../decorators/block-when-past-due.decorator';
import { IS_PUBLIC_KEY }            from '../../iam/guards/tenant.guard';

// ── SUSPENDED whitelist path prefix'leri ─────────────────────────────────────
const SUSPENDED_WHITELIST = [
  '/api/v1/iam',        // /login, /refresh, /logout
  '/api/v1/billing',    // ödeme ekranı
  '/health',            // uptime check
];

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
    }>();

    const tenantId = request.tenantId;
    if (!tenantId) return true; // TenantGuard zaten reddetti, burada geçir

    // SUPER_ADMIN her zaman geçer — platform operasyonları kısıtlanamaz
    if (request.userRole === 'SUPER_ADMIN') return true;

    // ── EntitlementsService'den durum al ────────────────────────────────────
    const ent = await this.entitlements.getEntitlements(
      tenantId,
      request.tenantPlan ?? 'SOLO',
    );

    // ── SUSPENDED kontrolü ──────────────────────────────────────────────────
    if (ent.status === 'SUSPENDED') {
      const path = (request.url ?? '').split('?')[0] ?? '';
      const allowed = SUSPENDED_WHITELIST.some(prefix => path.startsWith(prefix));

      if (!allowed) {
        throw new HttpException(
          { message: 'Hesabınız askıya alındı. Lütfen ödeme yapın.', errorCode: 'SUSPENDED' },
          HttpStatus.PAYMENT_REQUIRED,
        );
      }
      return true;
    }

    // ── PAST_DUE + kritik write kontrolü ────────────────────────────────────
    if (ent.status === 'PAST_DUE') {
      const isBlocked = this.reflector.getAllAndOverride<boolean>(BLOCK_WHEN_PAST_DUE_KEY, [
        context.getHandler(),
        context.getClass(),
      ]);

      if (isBlocked) {
        throw new HttpException(
          {
            message: 'Ödeme gecikti. Bu işlemi gerçekleştirmek için ödemenizi tamamlayın.',
            errorCode: 'PAST_DUE',
          },
          HttpStatus.PAYMENT_REQUIRED,
        );
      }
    }

    return true;
  }
}
