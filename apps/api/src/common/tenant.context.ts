/**
 * AURALIS TENANT CONTEXT
 * ──────────────────────────────────────────────────────────────────────────────
 * AsyncLocalStorage tabanlı tenant context.
 * Node.js'in native "thread-local" alternatifi: Her HTTP isteği kendi
 * tenant bağlamını taşır, başka isteklerle karışmaz.
 *
 * Kullanım akışı:
 *   1. TenantGuard → JWT'den tenantId okur → tenantContext.run() başlatır
 *   2. PrismaService.$use() → her sorguda tenantId'yi okur → DB'ye enjekte eder
 *   3. PostgreSQL RLS → set_config() ile tenant_id'yi alır → satır filtreler
 * ──────────────────────────────────────────────────────────────────────────────
 */

import { AsyncLocalStorage } from 'async_hooks';

export interface TenantStore {
  tenantId: string;
  userId:   string;
  userRole: string;
}

/** Singleton — tüm uygulama bu instance'ı paylaşır */
export const tenantContext = new AsyncLocalStorage<TenantStore>();

/** Mevcut request'in tenant store'unu döner */
export function getTenantStore(): TenantStore {
  const store = tenantContext.getStore();
  if (!store) {
    throw new Error(
      '[Auralis] TenantStore bulunamadı. ' +
      'Bu servis TenantGuard korumasız bir endpoint\'ten mi çağrıldı?',
    );
  }
  return store;
}

/** Mevcut tenant ID'yi döner */
export function getCurrentTenantId(): string {
  return getTenantStore().tenantId;
}
