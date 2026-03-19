/**
 * ITransactionManager — ORM-agnostic transaction boundary.
 *
 * Domain services inject this interface instead of PrismaService.
 * Implementations (PrismaTransactionManager) handle the ORM-specific
 * transaction mechanics. Repositories inside the callback automatically
 * participate in the transaction via txContext.
 */

export const TRANSACTION_MANAGER = Symbol('ITransactionManager');

export interface ITransactionManager {
  /**
   * Runs `fn` inside a database transaction.
   * If `fn` throws, the transaction is rolled back.
   */
  withTransaction<T>(fn: () => Promise<T>): Promise<T>;

  /**
   * Runs `fn` inside a database transaction with tenant RLS set_config.
   * Required for all tenant-scoped write operations.
   */
  withTenantTransaction<T>(fn: () => Promise<T>): Promise<T>;
}
