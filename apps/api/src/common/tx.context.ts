/**
 * TX CONTEXT — AsyncLocalStorage transaction propagation
 *
 * Stores the current Prisma transaction client so repository methods can
 * automatically participate in the active transaction without needing an
 * explicit `tx` parameter.
 *
 * Usage:
 *   - PrismaService.withTransaction() stores tx here before calling the callback
 *   - Repositories call getTxClient(prisma) to get tx (if active) or prisma (if not)
 *   - Services never interact with this module directly
 */

import { AsyncLocalStorage }  from 'node:async_hooks';
import { Prisma }             from '@prisma/client';

export interface TxStore {
  readonly tx: Prisma.TransactionClient;
}

/** Active transaction storage — auto-cleared when the $transaction callback returns. */
export const txContext = new AsyncLocalStorage<TxStore>();

/**
 * Returns the active transaction client if inside a withTransaction() scope,
 * otherwise returns the provided fallback (PrismaService instance).
 */
export function getActiveTxClient(
  fallback: Prisma.TransactionClient,
): Prisma.TransactionClient {
  return txContext.getStore()?.tx ?? fallback;
}
