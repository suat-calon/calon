/**
 * ONBOARDING MODULE — Self-Onboarding Wizard
 * ──────────────────────────────────────────────────────────────────────────────
 * BillingService @Global() olduğundan ayrıca import gerekmez.
 * JwtModule @Global() olduğundan ayrıca import gerekmez.
 */

import { Module } from '@nestjs/common';
import { OnboardingService }    from './onboarding.service';
import { OnboardingController } from './onboarding.controller';

@Module({
  controllers: [OnboardingController],
  providers:   [OnboardingService],
})
export class OnboardingModule {}
