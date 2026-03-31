/**
 * CALON API — BOOTSTRAP
 */
// tsconfig-paths/register MUST be first: redirects @prisma/client → packages/database/generated/client at runtime
import 'tsconfig-paths/register';
import { NestFactory }            from '@nestjs/core';
import { NestExpressApplication } from '@nestjs/platform-express';
import { ValidationPipe, Logger } from '@nestjs/common';
import cookieParser                from 'cookie-parser';
import { SwaggerModule, DocumentBuilder } from '@nestjs/swagger';
import { ConfigService }          from '@nestjs/config';
import { Logger as PinoLogger }   from 'nestjs-pino';
import { AppModule }              from './app.module';
import { MetricsService }         from './common/logging/metrics.service';
import { DevExceptionFilter }     from './common/filters/dev-exception.filter';
import { GlobalErrorFilter }      from './common/filters/global-error.filter';

async function bootstrap(): Promise<void> {
  const app = await NestFactory.create<NestExpressApplication>(AppModule, {
    // Pino devralana kadar NestJS built-in logger kapalı
    bufferLogs: true,
    // rawBody: BillingWebhookController'da x-iyz-signature doğrulaması için gerekli
    rawBody: true,
  });

  // Pino structured logger'ı NestJS'in varsayılan logger'ı olarak ayarla
  app.useLogger(app.get(PinoLogger));

  const config = app.get(ConfigService);

  // ── Trust proxy: Cloudflare / nginx arkasında gerçek istemci IP'si ───────────
  // req.ip = X-Forwarded-For ilk hop (tek trusted proxy varsayılır)
  // ThrottlerGuard bu değeri kullanır → rate limiting doğru IP'ye uygulanır
  app.set('trust proxy', 1);

  // Global prefix — /metrics hariç (Prometheus scrape standart path: /metrics)
  app.setGlobalPrefix('api/v1', { exclude: ['metrics'] });

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

  // Global error filter — catch-all fallback: logs + returns { statusCode, message }
  app.useGlobalFilters(new GlobalErrorFilter());

  // Dev exception filter — overrides GlobalErrorFilter for HttpException (preserves
  // original response shape) and adds _dev_error stack in non-production
  app.useGlobalFilters(new DevExceptionFilter());

  // Cookie parser — HttpOnly cookie auth için
  app.use(cookieParser());

  // CORS — env-driven allowlist (CORS_ORIGIN comma-separated) + localhost dev fallback
  const corsRaw = config.get<string>('CORS_ORIGIN', '');
  const envOrigins = corsRaw
    .split(',')
    .map((o) => o.trim())
    .filter(Boolean);
  // Always include production defaults so they survive even if env is minimal
  const allowedOrigins = new Set([
    'https://calon.com.tr',
    'https://www.calon.com.tr',
    'https://book.calon.com.tr',
    ...envOrigins,
  ]);

  app.enableCors({
    origin: (origin, callback) => {
      // No origin (server-to-server, curl, healthcheck) → allow
      // Localhost → allow (development)
      // allowedOrigins set → allow
      if (!origin || origin.includes('localhost') || allowedOrigins.has(origin)) {
        callback(null, true);
      } else {
        callback(new Error(`CORS: origin ${origin} not allowed`));
      }
    },
    credentials: true,
  });

  // Swagger (sadece development)
  if (config.get<string>('NODE_ENV') !== 'production') {
    const swaggerConfig = new DocumentBuilder()
      .setTitle('Calon Business OS API')
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

  logger.log(`🚀 Calon API: http://localhost:${port}/api/v1`);
  logger.log(`📖 Swagger:      http://localhost:${port}/api/docs`);
}

void bootstrap();
