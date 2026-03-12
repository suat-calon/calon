/**
 * STUB SMS PROVIDER
 * ──────────────────────────────────────────────────────────────────────────────
 * Test / development ortamı için stub provider.
 * Production'da gerçek provider ile swap edilecek (domain logic kırılmaz).
 *
 * SMS Segment Hesabı:
 *   - 160 karakter altı: 1 segment
 *   - 160 karakter üstü: her 153 karakter = 1 segment
 *   - 1 segment = 5 kuruş (stub tahmini)
 * ──────────────────────────────────────────────────────────────────────────────
 */

import { Injectable, Logger } from '@nestjs/common';
import { v4 as uuidv4 }        from 'uuid';
import {
  SmsProvider,
  SmsSendParams,
  SmsSendResult,
} from '../interfaces/sms-provider.interface';

@Injectable()
export class StubSmsProvider extends SmsProvider {
  readonly providerId = 'stub';
  private readonly logger = new Logger(StubSmsProvider.name);

  /**
   * Test/dev ortamı: Bu numara için INVALID_PHONE simülasyonu.
   * Production ortamında (NODE_ENV=production) bu blok atlanır.
   */
  static readonly FAIL_PHONE = '+905559999999';

  async send(params: SmsSendParams): Promise<SmsSendResult> {
    if (
      process.env['NODE_ENV'] !== 'production' &&
      params.to === StubSmsProvider.FAIL_PHONE
    ) {
      throw { code: 'INVALID_PHONE', message: `[Stub] Geçersiz numara: ${params.to}` };
    }

    const segments = this.estimateSegments(params.body);
    const cost     = segments * 5; // 5 kuruş / segment

    this.logger.log(
      `[StubSmsProvider] SMS gönderildi (stub): ` +
      `to=${params.to} segments=${segments} key=${params.idempotencyKey}`,
    );

    return {
      providerMessageId: `stub_sms_${uuidv4()}`,
      provider:          this.providerId,
      estimatedSegments: segments,
      costEstimateMinor: cost,
    };
  }

  async isHealthy(): Promise<boolean> {
    return true;
  }

  private estimateSegments(body: string): number {
    if (body.length <= 160) return 1;
    return Math.ceil(body.length / 153);
  }
}
