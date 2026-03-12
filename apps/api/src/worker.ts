import 'tsconfig-paths/register';
import { NestFactory }    from '@nestjs/core';
import { Logger }         from '@nestjs/common';
import { WorkerModule }   from './modules/worker/worker.module';

async function bootstrap(): Promise<void> {
  const app = await NestFactory.createApplicationContext(WorkerModule);

  const logger = new Logger('CalonWorker');
  logger.log('Worker started successfully');

  // Worker HTTP server çalıştırmaz
}

void bootstrap();
