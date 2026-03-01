import { Global, Module }         from '@nestjs/common';
import { BullModule }             from '@nestjs/bull';
import { ConfigModule, ConfigService } from '@nestjs/config';

export const QUEUE_NAMES = {
  NOTIFICATIONS:  'notifications',
  STOCK_DEDUCT:   'stock-deduct',
  HUMAN_HANDOFF:  'human-handoff',  // v2 AI devir
  CAMPAIGN:       'campaign',       // v2 Kampanya
} as const;

@Global()
@Module({
  imports: [
    BullModule.forRootAsync({
      imports: [ConfigModule],
      useFactory: (config: ConfigService) => ({
        redis: {
          host:     config.get<string>('REDIS_HOST', 'localhost'),
          port:     config.get<number>('REDIS_PORT', 6379),
          password: config.get<string>('REDIS_PASSWORD'),
        },
        defaultJobOptions: {
          removeOnComplete: 100,  // Son 100 başarılı job'ı sakla
          removeOnFail:     50,   // Son 50 başarısız job'ı sakla
          attempts:         3,
          backoff: { type: 'exponential', delay: 1000 },
        },
      }),
      inject: [ConfigService],
    }),
    BullModule.registerQueue(
      { name: QUEUE_NAMES.NOTIFICATIONS },
      { name: QUEUE_NAMES.STOCK_DEDUCT  },
      { name: QUEUE_NAMES.HUMAN_HANDOFF },
      { name: QUEUE_NAMES.CAMPAIGN      },
    ),
  ],
  exports: [BullModule],
})
export class RedisModule {}
