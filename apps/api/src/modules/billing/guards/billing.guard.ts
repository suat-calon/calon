/**
 * BILLING GUARD — Abonelik Durumu Kapı Bekçisi (Semantic Default-Deny)
 * ──────────────────────────────────────────────────────────────────────────────
 * Katman 1: Global guard (TenantGuard'dan sonra çalışır)
 *
 * Kurallar:
 *   SUSPENDED:
 *     - Sadece whitelist path prefix'leri VEYA @AllowPastDue() dekoratörüne izin ver
 *     - Diğerleri → 402 Payment Required + errorCode=SUSPENDED
 *
 *   PAST_DUE (Semantic Default-Deny):
 *     - @AllowPastDue() varsa → geçir
 *     - @WriteOperation() YOKSA → geçir  (okuma / semantik-salt operasyon)
 *     - @WriteOperation() VARSA → 402 Payment Required + errorCode=PAST_DUE
 *
 *   TRIAL / ACTIVE / CANCELED: herhangi bir kısıtlama yok.
 *
 * Neden HTTP metodu YERİNE @WriteOperation()?
 *   HTTP POST her zaman "veri değiştirme" anlamına gelmez (örn: arama, rapor).
 *   Semantik dekoratör, route'un gerçek niyetini açıkça ifade eder.
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
import { ALLOW_PAST_DUE_KEY }  from '../decorators/allow-past-due.decorator';
import { WRITE_OPERATION_KEY } from '../decorators/write-operation.decorator';
import { IS_PUBLIC_KEY }       from '../../iam/guards/tenant.guard';

// ── SUSPENDED whitelist path prefix'leri ─────────────────────────────────────
const SUSPENDED_WHITELIST = [
  '/api/v1/iam',        // /login, /refresh, /logout
  '/api/v1/auth',       // auth controller gerçek path'i
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

    // ── PAST_DUE — Semantic Default-Deny (@WriteOperation() olanlar bloklanır) ──
    if (ent.status === 'PAST_DUE') {
      const isWriteOperation = this.reflector.getAllAndOverride<boolean>(WRITE_OPERATION_KEY, [
        context.getHandler(),
        context.getClass(),
      ]);

      if (isWriteOperation) {
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
