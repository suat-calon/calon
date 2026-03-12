/**
 * PROVIDER REGISTRY SERVICE
 * ──────────────────────────────────────────────────────────────────────────────
 * SMS/Email/Push provider'larını kanal + tenant bazlı resolve eder.
 * Yeni provider eklemek domain katmanını KIRMAZ.
 * ──────────────────────────────────────────────────────────────────────────────
 */

import { Injectable } from '@nestjs/common';
import { SmsProvider }   from './interfaces/sms-provider.interface';
import { EmailProvider } from './interfaces/email-provider.interface';
import { PushProvider }  from './interfaces/push-provider.interface';

import { StubSmsProvider }   from './adapters/stub-sms.provider';
import { StubEmailProvider } from './adapters/stub-email.provider';
import { StubPushProvider }  from './adapters/stub-push.provider';

@Injectable()
export class ProviderRegistryService {
  constructor(
    private readonly smsProvider:   StubSmsProvider,
    private readonly emailProvider: StubEmailProvider,
    private readonly pushProvider:  StubPushProvider,
  ) {}

  /**
   * SMS provider resolve et.
   * providerHint verilmişse önceliklendirilir.
   * Gelecekte: tenant bazlı provider override buraya eklenecek.
   */
  getSmsProvider(_tenantId?: string, _hint?: string): SmsProvider {
    return this.smsProvider;
  }

  getEmailProvider(_tenantId?: string, _hint?: string): EmailProvider {
    return this.emailProvider;
  }

  getPushProvider(_tenantId?: string, _hint?: string): PushProvider {
    return this.pushProvider;
  }
}
