/**
 * REDIS KEY BUILDER — Namespace Standardizasyonu
 * ──────────────────────────────────────────────────────────────────────────────
 * Tüm Redis key'leri bu yardımcı üzerinden inşa edilir.
 *
 * Amaç:
 *   • Environment leakage riskini ortadan kaldırmak
 *   • Key çakışmasını önlemek (dev/staging/prod ayrımı)
 *   • Tüm key'leri tek bir noktadan izlenebilir kılmak
 *
 * Format: calon:{segment1}:{segment2}:...
 *
 * Kullanım:
 *   redisKey('tenant', 'entitlements', tenantId)
 *   // → 'calon:tenant:entitlements:<tenantId>'
 *
 *   redisKey('hold', tenantId, staffId, startTime)
 *   // → 'calon:hold:<tenantId>:<staffId>:<startTime>'
 * ──────────────────────────────────────────────────────────────────────────────
 */

export const REDIS_PREFIX = 'calon';

/**
 * Namespace'li Redis key oluşturur.
 * Tüm parçalar ':' ile birleştirilerek 'calon:' prefix'i eklenir.
 */
export const redisKey = (...parts: string[]): string =>
  [REDIS_PREFIX, ...parts].join(':');
