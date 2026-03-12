import 'tsconfig-paths/register';
import { NestFactory } from '@nestjs/core';
import { Logger }      from '@nestjs/common';
import { AppModule }   from './app.module';

async function bootstrap(): Promise<void> {
  const app = await NestFactory.createApplicationContext(AppModule);

  const logger = new Logger('CalonWorker');
  logger.log('Worker context started');

  // Worker HTTP server çalıştırmaz — app.listen() yok
}

void bootstrap();
