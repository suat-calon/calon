/**
 * LOGGING MODULE
 * ──────────────────────────────────────────────────────────────────────────────
 * Pino logger (nestjs-pino) + CorrelationMiddleware + MetricsService +
 * LoggingInterceptor'ı bir araya getirir.
 *
 * Global olarak AppModule'e import edilir.
 * CorrelationMiddleware, AppModule.configure() içinde tüm route'lara uygulanır.
 * LoggingInterceptor, AppModule'de APP_INTERCEPTOR olarak kaydedilir.
 * ──────────────────────────────────────────────────────────────────────────────
 */

import { Global, Module } from '@nestjs/common';
import { LoggerModule } from 'nestjs-pino';

import { CorrelationMiddleware } from './correlation.middleware';
import { LoggingInterceptor }   from './logging.interceptor';
import { MetricsService }       from './metrics.service';
import { getCorrelationId }     from './correlation.store';

const isDev = process.env['NODE_ENV'] !== 'production';

@Global()
@Module({
  imports: [
    LoggerModule.forRoot({
      pinoHttp: {
        // Geliştirmede renkli, production'da düz JSON
        ...(isDev
          ? {
              transport: {
                target:  'pino-pretty',
                options: {
                  colorize:        true,
                  singleLine:      true,
                  translateTime:   'SYS:HH:MM:ss.l',
                  ignore:          'pid,hostname',
                },
              },
            }
          : {}),

        // Her log satırına correlationId ekle
        mixin: () => ({
          correlationId: getCorrelationId(),
        }),

        // HTTP log seviyesi: success=info, error=error
        customLogLevel: (_req, res, err) => {
          if (err || res.statusCode >= 500) return 'error';
          if (res.statusCode >= 400)        return 'warn';
          return 'info';
        },

        // pino-http'nin kendi istek log'larını kapat
        // (LoggingInterceptor kendi log'unu atar — daha zengin context)
        autoLogging: false,
      },
    }),
  ],
  providers: [
    CorrelationMiddleware,
    LoggingInterceptor,
    MetricsService,
  ],
  exports: [
    CorrelationMiddleware,
    LoggingInterceptor,
    MetricsService,
  ],
})
export class LoggingModule {}
