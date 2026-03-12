/**
 * STUB EMAIL PROVIDER
 */

import { Injectable, Logger } from '@nestjs/common';
import { v4 as uuidv4 }        from 'uuid';
import {
  EmailProvider,
  EmailSendParams,
  EmailSendResult,
} from '../interfaces/email-provider.interface';

@Injectable()
export class StubEmailProvider extends EmailProvider {
  readonly providerId = 'stub';
  private readonly logger = new Logger(StubEmailProvider.name);

  async send(params: EmailSendParams): Promise<EmailSendResult> {
    this.logger.log(
      `[StubEmailProvider] Email gönderildi (stub): ` +
      `to=${params.to} subject="${params.subject}" key=${params.idempotencyKey}`,
    );

    return {
      providerMessageId: `stub_email_${uuidv4()}`,
      provider:          this.providerId,
      costEstimateMinor: 1, // 1 kuruş / email (stub)
    };
  }

  async isHealthy(): Promise<boolean> {
    return true;
  }
}
