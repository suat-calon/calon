/**
 * PUSH PROVIDER INTERFACE
 * ──────────────────────────────────────────────────────────────────────────────
 * Mimari slot hazır — Faz 24'te minimum iskelet implementasyon.
 * ──────────────────────────────────────────────────────────────────────────────
 */

import { ProviderError } from '../../../modules/delivery/retry-policy';

export interface PushSendParams {
  token:          string;
  title:          string;
  body:           string;
  data?:          Record<string, string>;
  idempotencyKey: string;
  tenantId:       string;
}

export interface PushSendResult {
  providerMessageId: string;
  provider:          string;
  costEstimateMinor: number;
}

export abstract class PushProvider {
  abstract readonly providerId: string;
  abstract send(params: PushSendParams): Promise<PushSendResult>;
  abstract isHealthy(): Promise<boolean>;
}
