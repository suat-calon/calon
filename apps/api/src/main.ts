/**
 * AURALIS API — BOOTSTRAP
 */
import { NestFactory }            from '@nestjs/core';
import { ValidationPipe }         from '@nestjs/common';
import { SwaggerModule, DocumentBuilder } from '@nestjs/swagger';
import { ConfigService }          from '@nestjs/config';
import { AppModule }              from './app.module';

async function bootstrap(): Promise<void> {
  const app = await NestFactory.create(AppModule, {
    logger: ['error', 'warn', 'log', 'debug'],
  });

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

  const port = config.get<number>('PORT', 4000);
  await app.listen(port);

  console.log(`\n🚀 Auralis API: http://localhost:${port}/api/v1`);
  console.log(`📖 Swagger:      http://localhost:${port}/api/docs\n`);
}

void bootstrap();
