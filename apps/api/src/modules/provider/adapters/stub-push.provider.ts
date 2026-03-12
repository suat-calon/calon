/**
 * STUB PUSH PROVIDER — Faz 24 iskelet
 */

import { Injectable, Logger } from '@nestjs/common';
import { v4 as uuidv4 }        from 'uuid';
import {
  PushProvider,
  PushSendParams,
  PushSendResult,
} from '../interfaces/push-provider.interface';

@Injectable()
export class StubPushProvider extends PushProvider {
  readonly providerId = 'stub';
  private readonly logger = new Logger(StubPushProvider.name);

  async send(params: PushSendParams): Promise<PushSendResult> {
    this.logger.log(
      `[StubPushProvider] Push gönderildi (stub): ` +
      `token=${params.token.substring(0, 8)}... key=${params.idempotencyKey}`,
    );

    return {
      providerMessageId: `stub_push_${uuidv4()}`,
      provider:          this.providerId,
      costEstimateMinor: 0,
    };
  }

  async isHealthy(): Promise<boolean> {
    return true;
  }
}
