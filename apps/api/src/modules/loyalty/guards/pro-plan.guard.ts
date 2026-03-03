/**
 * PRO PLAN GUARD — Sadakat özelliklerini Boutique/Enterprise planlarıyla sınırla
 * ──────────────────────────────────────────────────────────────────────────────
 * TenantGuard'ın JWT'den okuduğu request.tenantPlan değerini kullanır.
 * DB sorgusu YAPILMAZ — her login/refresh'te JWT claim güncellenir.
 *
 * Kural: BOUTIQUE ve ENTERPRISE → izin ver | SOLO → 403 Forbidden
 * ──────────────────────────────────────────────────────────────────────────────
 */

import {
  Injectable,
  CanActivate,
  ExecutionContext,
  ForbiddenException,
} from '@nestjs/common';

const PRO_PLANS = new Set(['BOUTIQUE', 'ENTERPRISE']);

@Injectable()
export class ProPlanGuard implements CanActivate {
  canActivate(context: ExecutionContext): boolean {
    const request = context.switchToHttp().getRequest<{ tenantPlan?: string }>();
    const plan    = request.tenantPlan ?? 'SOLO';

    if (PRO_PLANS.has(plan)) return true;

    throw new ForbiddenException(
      'Bu özellik sadece Boutique ve Enterprise planlarında geçerlidir.',
    );
  }
}
