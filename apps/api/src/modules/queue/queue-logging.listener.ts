import { QueueEvents } from 'bullmq';
import { Logger }      from '@nestjs/common';

const TAG = '[ConnTrace][QueueEvents]';

/**
 * BullMQ queue event logging.
 *
 * QueueEvents kendi ayrı Redis bağlantısını açar (blocking subscription).
 * Connection config eksik olursa (password, TLS yok) Upstash bağlantıyı
 * reddeder ve periyodik ECONNRESET üretir.
 *
 * NOT: Tüm Redis bağlantı parametreleri (password, TLS, keepAlive) sağlanmalı.
 */
export function registerQueueLogging(
  queueName: string,
  connection: {
    host?: string;
    port?: number;
    password?: string;
    tls?: Record<string, unknown>;
    keepAlive?: number;
    db?: number;
  },
): void {
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

  // ── Connection lifecycle tracing ──────────────────────────────────────
  events.on('error', (err: Error) => {
    const code = (err as NodeJS.ErrnoException).code ?? 'UNKNOWN';
    logger.warn(`${TAG}:${queueName} error: ${code} — ${err.message}`);
  });
}
