/**
 * EMAIL PROVIDER INTERFACE
 * ──────────────────────────────────────────────────────────────────────────────
 */

import { ProviderError } from '../../../modules/delivery/retry-policy';

export interface EmailSendParams {
  to:             string;
  subject:        string;
  html:           string;
  text?:          string;
  idempotencyKey: string;
  tenantId:       string;
  fromName?:      string;
  fromEmail?:     string;
}

export interface EmailSendResult {
  providerMessageId: string;
  provider:          string;
  costEstimateMinor: number;
  rawResponse?:      unknown;
}

export interface EmailProviderError extends ProviderError {
  rawResponse?: unknown;
}

export abstract class EmailProvider {
  abstract readonly providerId: string;
  abstract send(params: EmailSendParams): Promise<EmailSendResult>;
  abstract isHealthy(): Promise<boolean>;
}
