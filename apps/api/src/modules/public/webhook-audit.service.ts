import { Injectable, Logger } from '@nestjs/common';
import * as crypto             from 'crypto';

@Injectable()
export class WebhookAuditService {
  private readonly logger = new Logger('WebhookAudit');

  log(eventType: string, payload: any) {
    const payloadString = JSON.stringify(payload);

    const hash = crypto
      .createHash('sha256')
      .update(payloadString)
      .digest('hex');

    this.logger.log(
      JSON.stringify({
        eventType,
        payloadHash: hash,
        timestamp:   new Date().toISOString(),
      }),
    );
  }
}
