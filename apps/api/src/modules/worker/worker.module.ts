/**
 * WORKER MODULE
 * ──────────────────────────────────────────────────────────────────────────────
 * Tüm BullMQ processor'larını barındırır + Dispatcher/Recovery cron'larını
 * çalıştırır.
 *
 * Faz 24: Event & Notification Backbone worker'ları
 * Faz 24.5: Sweeper cron 1dk → 5dk, gerçek zamanlı dispatch pg_notify ile
 * ──────────────────────────────────────────────────────────────────────────────
 */

import { Module }         from '@nestjs/common';
import { ScheduleModule } from '@nestjs/schedule';
import { BullModule }     from '@nestjs/bull';

import { QUEUE_NAMES }            from '../../common/queue/queue-names';
import { DispatcherCronService }   from './dispatcher-cron.service';
import { OutboxListenerService }   from './outbox-listener.service';
import { DispatcherProcessor }    from './processors/dispatcher.processor';
import { SmsDeliveryProcessor }   from './processors/sms-delivery.processor';
import { EmailDeliveryProcessor } from './processors/email-delivery.processor';
import { PushDeliveryProcessor }  from './processors/push-delivery.processor';
import { RecoveryProcessor }      from './processors/recovery.processor';
import { ArchiveService }         from './archive.service';

@Module({
  imports: [
    ScheduleModule.forRoot(),
    BullModule.registerQueue(
      { name: QUEUE_NAMES.EVENT_DISPATCH        },
      { name: QUEUE_NAMES.NOTIFICATION_SMS      },
      { name: QUEUE_NAMES.NOTIFICATION_EMAIL    },
      { name: QUEUE_NAMES.NOTIFICATION_PUSH     },
      { name: QUEUE_NAMES.NOTIFICATION_DLQ      },
      { name: QUEUE_NAMES.NOTIFICATION_RECOVERY },
    ),
  ],
  providers: [
    DispatcherCronService,
    OutboxListenerService,
    DispatcherProcessor,
    SmsDeliveryProcessor,
    EmailDeliveryProcessor,
    PushDeliveryProcessor,
    RecoveryProcessor,
    ArchiveService,
  ],
})
export class WorkerModule {}
