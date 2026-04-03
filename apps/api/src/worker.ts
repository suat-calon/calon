import 'tsconfig-paths/register';
import { NestFactory } from '@nestjs/core';
import { Logger }      from '@nestjs/common';
import { AppModule }   from './app.module';
import { registerQueueLogging } from './modules/queue/queue-logging.listener';

const TAG = '[ConnTrace][Process]';

async function bootstrap(): Promise<void> {
  const logger = new Logger('CalonWorker');

  // ── Process-level error tracing ─────────────────────────────────────────
  // Node.js'te bir TCP socket'e error listener eklenmemişse, hata stderr'e
  // raw stack trace olarak yazılır. Bu handler tüm uncaught hataları yakalar
  // ve kaynak tespiti için loglar. Worker'ı crash ettirmez.
  process.on('uncaughtException', (err: Error) => {
    const code = (err as NodeJS.ErrnoException).code ?? 'UNKNOWN';
    if (code === 'ECONNRESET' || code === 'ETIMEDOUT' || code === 'EPIPE') {
      logger.warn(`${TAG} uncaughtException: ${code} — ${err.message} (non-fatal, suppressed)`);
    } else {
      logger.error(`${TAG} uncaughtException: ${err.message}`, err.stack);
    }
  });

  const app = await NestFactory.createApplicationContext(AppModule);

  logger.log('Worker context started');

  // ── Queue event monitoring ──────────────────────────────────────────────
  // QueueEvents kendi ayrı Redis bağlantısını açar.
  // Password, TLS, keepAlive olmadan Upstash bağlantıyı reddeder.
  const redisTls = process.env.REDIS_TLS === 'true';
  registerQueueLogging('default', {
    host:      process.env.REDIS_HOST,
    port:      Number(process.env.REDIS_PORT || 6379),
    password:  process.env.REDIS_PASSWORD,
    db:        0,
    keepAlive: 10_000,
    ...(redisTls ? { tls: {} } : {}),
  });

  // Worker HTTP server çalıştırmaz — app.listen() yok
}

void bootstrap();
