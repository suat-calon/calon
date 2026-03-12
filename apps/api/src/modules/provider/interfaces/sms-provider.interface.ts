/**
 * SMS PROVIDER INTERFACE
 * ──────────────────────────────────────────────────────────────────────────────
 * Adapter pattern: provider SDK'ları business logic'e DAĞILMAYACAK.
 * Yeni provider eklemek veya provider değiştirmek domain katmanını KIRMAYACAK.
 * ──────────────────────────────────────────────────────────────────────────────
 */

import { ProviderError } from '../../../modules/delivery/retry-policy';

export interface SmsSendParams {
  to:             string;  // +90XXXXXXXXXX
  body:           string;
  idempotencyKey: string;  // Provider-level dedupe token
  tenantId:       string;
}

export interface SmsSendResult {
  providerMessageId: string;
  provider:          string;
  estimatedSegments: number;   // SMS segment sayısı
  costEstimateMinor: number;   // Kuruş cinsinden tahmini maliyet
  rawResponse?:      unknown;
}

export interface SmsProviderError extends ProviderError {
  rawResponse?: unknown;
}

/** SMS provider adapter arayüzü */
export abstract class SmsProvider {
  /** Provider kimliği — "netgsm" | "twilio" | "iletimerkezi" | "stub" */
  abstract readonly providerId: string;

  /**
   * SMS gönder.
   * @throws SmsProviderError — her zaman structured error fırlatır
   */
  abstract send(params: SmsSendParams): Promise<SmsSendResult>;

  /** Provider sağlıklı mı? (health check) */
  abstract isHealthy(): Promise<boolean>;
}
