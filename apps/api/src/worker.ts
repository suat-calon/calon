import 'tsconfig-paths/register';
import { NestFactory } from '@nestjs/core';
import { Logger }      from '@nestjs/common';
import { AppModule }   from './app.module';
import { registerQueueLogging } from './modules/queue/queue-logging.listener';

async function bootstrap(): Promise<void> {
  const app = await NestFactory.createApplicationContext(AppModule);

  const logger = new Logger('CalonWorker');
  logger.log('Worker context started');

  registerQueueLogging('default', {
    host: process.env.REDIS_HOST,
    port: Number(process.env.REDIS_PORT),
  });

  // Worker HTTP server çalıştırmaz — app.listen() yok
}

void bootstrap();
