import { Global, Module }      from '@nestjs/common';
import { ScheduleModule }     from '@nestjs/schedule';

import { BillingService }        from './billing.service';
import { EntitlementsService }   from './entitlements.service';
import { BillingCron }           from './billing.cron';
import { BillingGuard }          from './guards/billing.guard';
import { RequireFeatureGuard }   from './guards/require-feature.guard';
import { LimitCheckService }     from './guards/limit-check.service';
import { BillingAdminController } from '../admin/billing.admin.controller';

/**
 * BillingModule — Global modül.
 * EntitlementsService ve guards tüm uygulama genelinde kullanıldığı için @Global().
 */
@Global()
@Module({
  imports: [
    ScheduleModule.forRoot(),
  ],
  providers: [
    BillingService,
    EntitlementsService,
    BillingCron,
    BillingGuard,
    RequireFeatureGuard,
    LimitCheckService,
  ],
  controllers: [
    BillingAdminController,
  ],
  exports: [
    BillingService,
    EntitlementsService,
    BillingCron,
    BillingGuard,
    RequireFeatureGuard,
    LimitCheckService,
  ],
})
export class BillingModule {}
