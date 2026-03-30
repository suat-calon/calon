import { Global, Module }              from '@nestjs/common';
import { BullModule }                  from '@nestjs/bull';
import { ConfigModule, ConfigService } from '@nestjs/config';
import Redis                           from 'ioredis';
import { FailedJobService }            from './queue/failed-job.service';
import { BackpressureService }         from './queue/backpressure.service';
import { QueueMetricsService }         from './queue/queue-metrics.service';
import { RedisLockService }            from './redis-lock.service';

// ── Queue adları (döngüsel bağımlılığı kırmak için ayrı dosyada) ─────────────
// import: modül gövdesinde (BullModule.registerQueue) kullanılır
// re-export: diğer modüller hâlâ 'redis.module' üzerinden alabilir
import { QUEUE_NAMES } from './queue/queue-names';
export { QUEUE_NAMES } from './queue/queue-names';

// ── Injection token: Ham Redis istemcisi (SETNX hold kilidi için) ─────────────
// Döngüsel import (redis.module ↔ redis-lock.service) kırmak için ayrı dosyada.
// re-export: diğer modüller hâlâ 'redis.module' üzerinden alabilir.
import { REDIS_CLIENT } from './redis-tokens';
export { REDIS_CLIENT } from './redis-tokens';

/**
 * Ham Redis istemci sağlayıcısı.
 * Bull'un kuyruğu için açtığı bağlantıdan AYRI, deterministik bir istemci.
 * Kullanım alanı: AppointmentLockService (SETNX tabanlı Soft-Lock)
 */
const redisClientProvider = {
  provide:    REDIS_CLIENT,
  inject:     [ConfigService],
  useFactory: (config: ConfigService): Redis => {
    const port = config.get<number>('REDIS_PORT', 6379);
    return new Redis({
      host:                config.get<string>('REDIS_HOST', 'localhost'),
      port,
      password:            config.get<string>('REDIS_PASSWORD'),
      lazyConnect:         true,  // İlk komutta bağlan
      maxRetriesPerRequest: 3,
      enableReadyCheck:    true,
      // Upstash sadece DB 0 destekler. Namespace prefixleri ile çakışma önlenmiştir.
      db:                  0,
      keepAlive:           10000, // ECONNRESET kopmalarını önlemek için TCP keep-alive
      ...(config.get('REDIS_TLS') === 'true' ? { tls: {} } : {}),
    });
  },
};

@Global()
@Module({
  imports: [
    // ── Bull / BullMQ kuyruk altyapısı ───────────────────────────────────────
    BullModule.forRootAsync({
      imports: [ConfigModule],
      useFactory: (config: ConfigService) => {
        const port = config.get<number>('REDIS_PORT', 6379);
        return {
        redis: {
          host:     config.get<string>('REDIS_HOST', 'localhost'),
          port,
          password: config.get<string>('REDIS_PASSWORD'),
          db:       0, // Upstash DB:0 zorunluluğu
          keepAlive: 10000, // Worker ECONNRESET kopmalarını önler
          ...(config.get('REDIS_TLS') === 'true' ? { tls: {} } : {}),
        },
        defaultJobOptions: {
          removeOnComplete: 100,
          removeOnFail:     50,       // Son 50 başarısız job Bull'da saklanır (debug için)
          attempts:         3,
          backoff: { type: 'exponential', delay: 1000 },
        },
        };
      },
      inject: [ConfigService],
    }),
    BullModule.registerQueue(
      { name: QUEUE_NAMES.NOTIFICATIONS    },
      { name: QUEUE_NAMES.STOCK_DEDUCT     },
      { name: QUEUE_NAMES.LOYALTY_EARN     },
      { name: QUEUE_NAMES.HUMAN_HANDOFF    },
      { name: QUEUE_NAMES.CAMPAIGN         },
      { name: QUEUE_NAMES.REFERRAL_PROCESS }, // Faz 18
      // ── Faz 24: Event & Notification Backbone ────────────────────────────
      { name: QUEUE_NAMES.EVENT_DISPATCH        },
      { name: QUEUE_NAMES.NOTIFICATION_SMS      },
      { name: QUEUE_NAMES.NOTIFICATION_EMAIL    },
      { name: QUEUE_NAMES.NOTIFICATION_PUSH     },
      { name: QUEUE_NAMES.NOTIFICATION_DLQ      },
      { name: QUEUE_NAMES.NOTIFICATION_RECOVERY },
    ),
  ],
  providers: [
    redisClientProvider,
    // ── Faz 13: Resilience ────────────────────────────────────────────────────
    FailedJobService,     // DLQ → kalıcı hata → PostgreSQL'e yaz
    BackpressureService,  // Kuyruk yoğunluğu denetimi → 429 önlemi
    QueueMetricsService,  // Tüm queue'ların anlık sayaçları (Prometheus scrape)
    // ── MVP-EXIT-FINAL: Güvenli Redis unlock ─────────────────────────────────
    RedisLockService,     // Lua CAS — tüm distributed lock işlemleri için
  ],
  exports: [
    BullModule,
    REDIS_CLIENT,
    FailedJobService,
    BackpressureService,
    QueueMetricsService,  // @Global() — PrometheusController inject eder
    RedisLockService,     // @Global() — OperationsModule, PublicModule vb. inject eder
  ],
})
export class RedisModule {}
