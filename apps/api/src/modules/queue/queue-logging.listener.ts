import { QueueEvents } from 'bullmq';
import { Logger }      from '@nestjs/common';

export function registerQueueLogging(queueName: string, connection: any) {
  const logger = new Logger(`Queue:${queueName}`);

  const events = new QueueEvents(queueName, { connection });

  events.on('completed', ({ jobId }) => {
    logger.log(`job completed ${jobId}`);
  });

  events.on('failed', ({ jobId, failedReason }) => {
    logger.error(`job failed ${jobId} reason=${failedReason}`);
  });

  events.on('active', ({ jobId }) => {
    logger.log(`job started ${jobId}`);
  });
}
