/**
 * CORRELATION STORE — AsyncLocalStorage wrapper
 * ──────────────────────────────────────────────────────────────────────────────
 * Singleton store; correlationId'yi request bazlı saklar.
 * Tüm servisler ve interceptor'lar `CorrelationStore.getStore()` ile okuyabilir.
 * ──────────────────────────────────────────────────────────────────────────────
 */

import { AsyncLocalStorage } from 'async_hooks';

export interface CorrelationContext {
  correlationId: string;
}

export const CorrelationStore = new AsyncLocalStorage<CorrelationContext>();

/**
 * Geçerli request'in correlationId'sini döner.
 * Request context dışında (cron, worker) undefined gelir.
 */
export function getCorrelationId(): string | undefined {
  return CorrelationStore.getStore()?.correlationId;
}
