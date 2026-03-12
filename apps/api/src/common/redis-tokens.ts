/**
 * REDIS_CLIENT injection token.
 *
 * Ayrı dosyada tanımlanma nedeni: redis.module.ts, redis-lock.service.ts'yi
 * import eder; redis-lock.service.ts de redis.module.ts'yi import eder.
 * Bu döngüsel bağımlılık Node.js CJS'de incomplete exports'a yol açar →
 * NestJS'in injector'ı REDIS_CLIENT'ı undefined olarak görür → (?) hatası.
 *
 * Çözüm: QUEUE_NAMES ile aynı desen — token'ı ayrı, bağımlılık-serbest dosyaya taşı.
 * redis.module.ts bu dosyayı import eder ve re-export eder (geriye dönük uyumluluk).
 */

// String token: NestJS Symbol token'larını tsconfig-paths + watch modunda çözemeyebilir.
export const REDIS_CLIENT = 'REDIS_CLIENT';
