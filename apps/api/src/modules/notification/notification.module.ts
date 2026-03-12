/**
 * NOTIFICATION MODULE
 * ──────────────────────────────────────────────────────────────────────────────
 * Sorumluluklar:
 *   - PreferenceResolver: kanal enable/disable, reminder offset
 *   - TemplateResolver:   versioned template çözümleme + render
 *   - CostPolicyEngine:   kota, maliyet, fallback politikası
 * ──────────────────────────────────────────────────────────────────────────────
 */

import { Global, Module } from '@nestjs/common';
import { PreferenceResolver }  from './preference.resolver';
import { TemplateResolver }    from './template.resolver';
import { CostPolicyEngine }    from './cost-policy.engine';

@Global()
@Module({
  providers: [
    PreferenceResolver,
    TemplateResolver,
    CostPolicyEngine,
  ],
  exports: [
    PreferenceResolver,
    TemplateResolver,
    CostPolicyEngine,
  ],
})
export class NotificationModule {}
