/**
 * AURALIS API — BOOTSTRAP
 */
// tsconfig-paths/register MUST be first: redirects @prisma/client → packages/database/generated/client at runtime
import 'tsconfig-paths/register';
import { NestFactory }            from '@nestjs/core';
import { ValidationPipe, Logger } from '@nestjs/common';
import { SwaggerModule, DocumentBuilder } from '@nestjs/swagger';
import { ConfigService }          from '@nestjs/config';
import { Logger as PinoLogger }   from 'nestjs-pino';
import { AppModule }              from './app.module';
import { MetricsService }         from './common/logging/metrics.service';

async function bootstrap(): Promise<void> {
  const app = await NestFactory.create(AppModule, {
    // Pino devralana kadar NestJS built-in logger kapalı
    bufferLogs: true,
  });

  // Pino structured logger'ı NestJS'in varsayılan logger'ı olarak ayarla
  app.useLogger(app.get(PinoLogger));

  const config = app.get(ConfigService);

  // Global prefix
  app.setGlobalPrefix('api/v1');

  // Validation pipe — DTO doğrulama
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist:            true,   // Tanımsız alanları at
      forbidNonWhitelisted: true,   // Tanımsız alan gelirse hata fırlat
      transform:            true,   // Tip dönüşümü (string → number vb.)
      transformOptions: {
        enableImplicitConversion: true,
      },
    }),
  );

  // CORS
  app.enableCors({
    origin:      config.get<string>('CORS_ORIGIN', 'http://localhost:3000'),
    credentials: true,
  });

  // Swagger (sadece development)
  if (config.get<string>('NODE_ENV') !== 'production') {
    const swaggerConfig = new DocumentBuilder()
      .setTitle('Auralis Business OS API')
      .setDescription('Güzellik ve wellness sektörü için Business OS')
      .setVersion('1.0')
      .addBearerAuth()
      .build();

    const document = SwaggerModule.createDocument(app, swaggerConfig);
    SwaggerModule.setup('api/docs', app, document);
  }

  // SIGTERM — graceful shutdown + metrics özeti
  const metrics = app.get(MetricsService);
  const logger  = new Logger('Bootstrap');

  process.on('SIGTERM', () => {
    logger.log(metrics.summaryLine());
    void app.close();
  });

  const port = config.get<number>('PORT', 4000);
  await app.listen(port);

  logger.log(`🚀 Auralis API: http://localhost:${port}/api/v1`);
  logger.log(`📖 Swagger:      http://localhost:${port}/api/docs`);
}

void bootstrap();
