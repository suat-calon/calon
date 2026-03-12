/**
 * RETRY POLICY
 * ──────────────────────────────────────────────────────────────────────────────
 * Tüm kanallar için birleşik deterministic retry politikası.
 *
 * Faz 24 Hardening:
 *   - Kanal bağımsız: SMS / EMAIL / PUSH aynı zamanlamayı kullanır.
 *   - Deterministik: jitter yok; bekleme süreleri kesin ve test edilebilir.
 *   - Max 5 deneme: 5. denemeden sonra PERMANENT_FAILURE.
 *
 * Gecikme takvimi (deneme sırası, 1-indexed):
 *   1.  1 dakika   (geçici hata — hızlı yeniden dene)
 *   2.  5 dakika
 *   3. 15 dakika
 *   4.  1 saat
 *   5.  6 saat     (son deneme)
 *
 * Failure class ayrımı:
 *   - TRANSIENT: timeout, connection reset, 429, 5xx → retry
 *   - PERMANENT: invalid phone/email, opt-out, fatal config → no retry
 *
 * API Uyumluluğu:
 *   `nextRetryAt` ve `isMaxAttemptsReached` fonksiyonları `channel` parametresini
 *   hâlâ kabul eder (caller değişikliği gerektirmez), ancak artık kullanılmaz.
 * ──────────────────────────────────────────────────────────────────────────────
 */

import { NotificationChannel } from '@prisma/client';

/** Error sınıfı */
export type FailureClass = 'TRANSIENT' | 'PERMANENT';

/** Bir hata kodunu sınıflandır */
export interface ProviderError {
  code:    string;  // "TIMEOUT" | "INVALID_PHONE" | "OPT_OUT" | "PROVIDER_5XX" | ...
  message: string;
  httpStatus?: number;
}

// ── Birleşik deterministik gecikme takvimi ──────────────────────────────────

/** Tüm kanallar için maksimum delivery denemesi. */
export const MAX_DELIVERY_ATTEMPTS = 5;

/**
 * Deneme sonrası beklenecek süreler (ms).
 * Index 0 → 1. deneme başarısız oldu; index 4 → 5. deneme başarısız oldu.
 */
const UNIFIED_DELAYS_MS: readonly number[] = [
  1  * 60_000,        //  1 dakika
  5  * 60_000,        //  5 dakika
  15 * 60_000,        // 15 dakika
  60 * 60_000,        //  1 saat
  6  * 60 * 60_000,   //  6 saat
];

// ── Permanent failure sınıflandırması ───────────────────────────────────────

/** Permanent failure error kodları */
const PERMANENT_ERROR_CODES = new Set([
  'INVALID_PHONE',
  'INVALID_EMAIL',
  'OPT_OUT',
  'UNSUBSCRIBED',
  'BLACKLISTED',
  'TEMPLATE_RENDER_ERROR',
  'BAD_TENANT_CONFIG',
  'UNSUPPORTED_CHANNEL',
  'INVALID_RECIPIENT',
  'ACCOUNT_NOT_FOUND',
]);

/** Permanent HTTP status kodları */
const PERMANENT_HTTP_STATUSES = new Set([400, 401, 403, 404, 410, 422]);

/**
 * Hata sınıfını belirle.
 * TRANSIENT → retry denenecek.
 * PERMANENT → retry yok, PERMANENT_FAILURE durumuna geç.
 */
export function classifyFailure(error: ProviderError): FailureClass {
  if (PERMANENT_ERROR_CODES.has(error.code)) return 'PERMANENT';
  if (error.httpStatus && PERMANENT_HTTP_STATUSES.has(error.httpStatus)) {
    return 'PERMANENT';
  }
  return 'TRANSIENT';
}

/**
 * Sonraki retry zamanını hesapla.
 * @param _channel     Geriye dönük uyumluluk için korunur (kullanılmaz).
 * @param attemptsDone Şimdiye kadar yapılan başarısız deneme sayısı.
 * @returns Sonraki retry tarihi; MAX_DELIVERY_ATTEMPTS aşıldıysa null.
 */
export function nextRetryAt(
  _channel:     NotificationChannel,
  attemptsDone: number,
): Date | null {
  if (attemptsDone >= MAX_DELIVERY_ATTEMPTS) return null;

  // Takvimde tanımlı gecikmeyi al; aşıldıysa son değeri kullan
  const delayMs =
    UNIFIED_DELAYS_MS[attemptsDone - 1] ??
    UNIFIED_DELAYS_MS[UNIFIED_DELAYS_MS.length - 1];

  return new Date(Date.now() + delayMs);
}

/**
 * Max attempts'e ulaşıldı mı?
 * @param _channel  Geriye dönük uyumluluk için korunur (kullanılmaz).
 */
export function isMaxAttemptsReached(
  _channel: NotificationChannel,
  attempts: number,
): boolean {
  return attempts >= MAX_DELIVERY_ATTEMPTS;
}
