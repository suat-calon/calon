import {
  ExceptionFilter,
  Catch,
  ArgumentsHost,
  HttpException,
  HttpStatus,
  Logger,
} from '@nestjs/common';
import { Response } from 'express';

/**
 * DEV-ONLY: Exposes the real error message/stack in non-production environments.
 * REMOVE or gate before deploying to production.
 */
@Catch()
export class DevExceptionFilter implements ExceptionFilter {
  private readonly logger = new Logger('DevExceptionFilter');

  catch(exception: unknown, host: ArgumentsHost) {
    const ctx    = host.switchToHttp();
    const res    = ctx.getResponse<Response>();
    const isDev  = process.env['NODE_ENV'] !== 'production';

    this.logger.error('DEV_EXCEPTION_FILTER caught:', exception);

    if (exception instanceof HttpException) {
      // HttpException: orijinal NestJS formatını AYNEN koru
      // (sadece dev modunda _dev_error ekle — mevcut shape bozulmaz)
      const status   = exception.getStatus();
      const original = exception.getResponse(); // string | object
      const body     = typeof original === 'string' ? { message: original } : (original as object);

      res.status(status).json({
        ...body,
        ...(isDev && {
          _dev_error: {
            type: exception.constructor.name,
            msg:  exception.message,
          },
        }),
      });
      return;
    }

    // Non-HttpException (Prisma, runtime errors vb.)
    const stack = exception instanceof Error ? exception.stack : undefined;

    res.status(HttpStatus.INTERNAL_SERVER_ERROR).json({
      statusCode: HttpStatus.INTERNAL_SERVER_ERROR,
      message:    'Internal server error',
      ...(isDev && {
        _dev_error: {
          type:  exception instanceof Error ? exception.constructor.name : typeof exception,
          msg:   exception instanceof Error ? exception.message : String(exception),
          stack: stack?.split('\n').slice(0, 12),
          cause: (exception instanceof Error && (exception as any).cause)
            ? String((exception as any).cause)
            : undefined,
          meta: (exception as any)?.meta ?? undefined,
          code: (exception as any)?.code ?? undefined,
        },
      }),
    });
  }
}
