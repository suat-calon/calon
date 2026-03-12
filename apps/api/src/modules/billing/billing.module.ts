import { Global, Module }      from '@nestjs/common';
import { ScheduleModule }     from '@nestjs/schedule';

import { BillingService }        from './billing.service';
import { EntitlementsService }   from './entitlements.service';
import { BillingCron }           from './billing.cron';
import { BillingGuard }          from './guards/billing.guard';
import { RequireFeatureGuard }   from './guards/require-feature.guard';
import { LimitCheckService }     from './guards/limit-check.service';
import { IyzicoService }         from '../public/iyzico.service';
import { BillingController }         from './billing.controller';
import { BillingWebhookController }  from './billing-webhook.controller';
import { BillingAdminController }       from '../admin/billing.admin.controller';
import { GrowthMetricsAdminController } from '../admin/growth-metrics.admin.controller';
import { PrometheusController }         from '../admin/prometheus.controller';

/**
 * BillingModule — Global modül.
 * EntitlementsService ve guards tüm uygulama genelinde kullanıldığı için @Global().
 * IyzicoService buraya taşındı (Faz 22) — PublicModule artık kendi başına kayıt etmiyor.
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
    IyzicoService,
  ],
  controllers: [
    BillingController,
    BillingWebhookController,
    BillingAdminController,
    GrowthMetricsAdminController,
    PrometheusController,         // GET /metrics — Prometheus scrape
  ],
  exports: [
    BillingService,
    EntitlementsService,
    BillingCron,
    BillingGuard,
    RequireFeatureGuard,
    LimitCheckService,
    IyzicoService,
  ],
})
export class BillingModule {}
