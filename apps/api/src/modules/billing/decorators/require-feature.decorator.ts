import { SetMetadata } from '@nestjs/common';
import { PlanFeatures } from '../plan.catalog';

export const REQUIRE_FEATURE_KEY = 'requiredFeature';

/**
 * @RequireFeature('loyalty') — endpoint, belirli bir plan özelliği gerektirir.
 * RequireFeatureGuard bu metadata'yı okuyarak EntitlementsService'i kontrol eder.
 *
 * @example
 * @RequireFeature('loyalty')
 * @Post('redeem')
 * redeem() { ... }
 */
export const RequireFeature = (feature: keyof PlanFeatures) =>
  SetMetadata(REQUIRE_FEATURE_KEY, feature);
