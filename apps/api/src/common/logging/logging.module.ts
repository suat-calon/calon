/**
 * LOGGING MODULE
 * ──────────────────────────────────────────────────────────────────────────────
 * Pino logger (nestjs-pino) + CorrelationMiddleware + MetricsService +
 * PrometheusService + ThrottlerExceptionFilter + LoggingInterceptor'ı
 * bir araya getirir.
 *
 * @Global() — AppModule'e bir kez import edilir; tüm modüller PrometheusService
 * ve MetricsService'i inject edebilir.
 * ──────────────────────────────────────────────────────────────────────────────
 */

import { Global, Module } from '@nestjs/common';
import { LoggerModule }   from 'nestjs-pino';

import { CorrelationMiddleware }    from './correlation.middleware';
import { LoggingInterceptor }       from './logging.interceptor';
import { MetricsService }           from './metrics.service';
import { PrometheusService }        from './prometheus.service';
import { ThrottlerExceptionFilter } from './throttler-exception.filter';
import { getCorrelationId }         from './correlation.store';

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
                  colorize:      true,
                  singleLine:    true,
                  translateTime: 'SYS:HH:MM:ss.l',
                  ignore:        'pid,hostname',
                },
              },
            }
          : {}),

        // Her log satırına correlationId (= requestId) ekle
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
    PrometheusService,
    ThrottlerExceptionFilter,
  ],
  exports: [
    CorrelationMiddleware,
    LoggingInterceptor,
    MetricsService,
    PrometheusService,        // @Global() — tüm modüller inject edebilir
    ThrottlerExceptionFilter, // APP_FILTER olarak AppModule'e de kayıtlı
  ],
})
export class LoggingModule {}
