import { Global, Module }              from '@nestjs/common';
import { BullModule }                  from '@nestjs/bull';
import { ConfigModule, ConfigService } from '@nestjs/config';
import Redis                           from 'ioredis';
import { FailedJobService }            from './queue/failed-job.service';
import { BackpressureService }         from './queue/backpressure.service';

// ── Queue adları (döngüsel bağımlılığı kırmak için ayrı dosyada) ─────────────
// import: modül gövdesinde (BullModule.registerQueue) kullanılır
// re-export: diğer modüller hâlâ 'redis.module' üzerinden alabilir
import { QUEUE_NAMES } from './queue/queue-names';
export { QUEUE_NAMES } from './queue/queue-names';

// ── Injection token: Ham Redis istemcisi (SETNX hold kilidi için) ─────────────
export const REDIS_CLIENT = Symbol('REDIS_CLIENT');

/**
 * Ham Redis istemci sağlayıcısı.
 * Bull'un kuyruğu için açtığı bağlantıdan AYRI, deterministik bir istemci.
 * Kullanım alanı: AppointmentLockService (SETNX tabanlı Soft-Lock)
 */
const redisClientProvider = {
  provide:    REDIS_CLIENT,
  inject:     [ConfigService],
  useFactory: (config: ConfigService): Redis => {
    return new Redis({
      host:                config.get<string>('REDIS_HOST', 'localhost'),
      port:                config.get<number>('REDIS_PORT', 6379),
      password:            config.get<string>('REDIS_PASSWORD'),
      lazyConnect:         true,  // İlk komutta bağlan
      maxRetriesPerRequest: 3,
      enableReadyCheck:    true,
      // Hold kilidi için ayrı DB index (Bull: db=0, Lock: db=1)
      db:                  1,
    });
  },
};

@Global()
@Module({
  imports: [
    // ── Bull / BullMQ kuyruk altyapısı ───────────────────────────────────────
    BullModule.forRootAsync({
      imports: [ConfigModule],
      useFactory: (config: ConfigService) => ({
        redis: {
          host:     config.get<string>('REDIS_HOST', 'localhost'),
          port:     config.get<number>('REDIS_PORT', 6379),
          password: config.get<string>('REDIS_PASSWORD'),
          // Bull varsayılan db=0
        },
        defaultJobOptions: {
          removeOnComplete: 100,
          removeOnFail:     50,       // Son 50 başarısız job Bull'da saklanır (debug için)
          attempts:         3,
          backoff: { type: 'exponential', delay: 1000 },
        },
      }),
      inject: [ConfigService],
    }),
    BullModule.registerQueue(
      { name: QUEUE_NAMES.NOTIFICATIONS },
      { name: QUEUE_NAMES.STOCK_DEDUCT  },
      { name: QUEUE_NAMES.LOYALTY_EARN  },
      { name: QUEUE_NAMES.HUMAN_HANDOFF },
      { name: QUEUE_NAMES.CAMPAIGN      },
    ),
  ],
  providers: [
    redisClientProvider,
    // ── Faz 13: Resilience ────────────────────────────────────────────────────
    FailedJobService,     // DLQ → kalıcı hata → PostgreSQL'e yaz
    BackpressureService,  // Kuyruk yoğunluğu denetimi → 429 önlemi
  ],
  exports: [
    BullModule,
    REDIS_CLIENT,
    FailedJobService,
    BackpressureService,
  ],
})
export class RedisModule {}
