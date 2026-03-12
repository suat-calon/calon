/**
 * PROVIDER MODULE
 * ──────────────────────────────────────────────────────────────────────────────
 * SMS, Email, Push provider adapter'larını ve registry'yi barındırır.
 * ──────────────────────────────────────────────────────────────────────────────
 */

import { Global, Module } from '@nestjs/common';
import { StubSmsProvider }          from './adapters/stub-sms.provider';
import { StubEmailProvider }        from './adapters/stub-email.provider';
import { StubPushProvider }         from './adapters/stub-push.provider';
import { ProviderRegistryService }  from './provider-registry.service';

@Global()
@Module({
  providers: [
    StubSmsProvider,
    StubEmailProvider,
    StubPushProvider,
    ProviderRegistryService,
  ],
  exports: [
    ProviderRegistryService,
  ],
})
export class ProviderModule {}
