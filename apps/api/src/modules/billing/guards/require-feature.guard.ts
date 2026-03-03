/**
 * REQUIRE FEATURE GUARD — Plan Özelliği Kapı Bekçisi
 * ──────────────────────────────────────────────────────────────────────────────
 * Katman 2: Controller veya handler bazlı guard.
 * @RequireFeature('loyalty') dekoratörü ile birlikte kullanılır.
 *
 * EntitlementsService.features[featureKey] === false → 403 Forbidden
 * ──────────────────────────────────────────────────────────────────────────────
 */

import {
  Injectable,
  CanActivate,
  ExecutionContext,
  ForbiddenException,
} from '@nestjs/common';
import { Reflector }           from '@nestjs/core';
import { EntitlementsService } from '../entitlements.service';
import { REQUIRE_FEATURE_KEY } from '../decorators/require-feature.decorator';
import { PlanFeatures }        from '../plan.catalog';

@Injectable()
export class RequireFeatureGuard implements CanActivate {
  constructor(
    private readonly entitlements: EntitlementsService,
    private readonly reflector:    Reflector,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const feature = this.reflector.getAllAndOverride<keyof PlanFeatures | undefined>(
      REQUIRE_FEATURE_KEY,
      [context.getHandler(), context.getClass()],
    );

    if (!feature) return true; // Dekoratör yok, engel yok

    const request = context.switchToHttp().getRequest<{
      tenantId?:   string;
      tenantPlan?: string;
    }>();

    const tenantId = request.tenantId;
    if (!tenantId) return true; // TenantGuard halledecek

    const ent = await this.entitlements.getEntitlements(
      tenantId,
      request.tenantPlan ?? 'SOLO',
    );

    const hasFeature = ent.features[feature];

    if (!hasFeature) {
      throw new ForbiddenException({
        message:   `Bu özellik planınızda mevcut değil: ${feature}`,
        errorCode: 'FEATURE_NOT_INCLUDED',
        feature,
      });
    }

    return true;
  }
}
