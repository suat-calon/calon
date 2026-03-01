/**
 * IDEMPOTENCY INTERCEPTOR
 * ──────────────────────────────────────────────────────────────────────────────
 * X-Idempotency-Key header'ı ile gelen isteklerde:
 *   - Eğer bu key daha önce başarıyla işlenmişse → kaydedilen yanıtı döner
 *   - İlk kez işleniyorsa → normal akışa bırakır, sonucu kaydeder
 *
 * Kapsam: Ödeme ve randevu endpoint'lerine @UseInterceptors(IdempotencyInterceptor)
 * ile uygulanır. Yanlışlıkla çift tıklama veya ağ kopması sonrası retry'larda
 * aynı randevu/ödeme iki kez oluşmaz.
 * ──────────────────────────────────────────────────────────────────────────────
 */

import {
  Injectable,
  NestInterceptor,
  ExecutionContext,
  CallHandler,
  Logger,
} from '@nestjs/common';
import { Observable, of } from 'rxjs';
import { tap }            from 'rxjs/operators';
import { PrismaService }  from './prisma.service';
import { getCurrentTenantId } from './tenant.context';

const KEY_HEADER    = 'x-idempotency-key';
const TTL_MS        = 86_400_000; // 24 saat

@Injectable()
export class IdempotencyInterceptor implements NestInterceptor {
  private readonly logger = new Logger(IdempotencyInterceptor.name);

  constructor(private readonly prisma: PrismaService) {}

  async intercept(
    context: ExecutionContext,
    next: CallHandler,
  ): Promise<Observable<unknown>> {
    const request = context.switchToHttp().getRequest<{
      headers: Record<string, string>;
      method:  string;
    }>();

    // Sadece mutating istekler için uygula
    if (!['POST', 'PUT', 'PATCH'].includes(request.method)) {
      return next.handle();
    }

    const idempotencyKey = request.headers[KEY_HEADER];
    if (!idempotencyKey) {
      return next.handle(); // Key yoksa geç
    }

    let tenantId: string;
    try {
      tenantId = getCurrentTenantId();
    } catch {
      return next.handle(); // Public endpoint
    }

    const compositeKey = `${tenantId}:${idempotencyKey}`;

    // Daha önce işlendi mi?
    const cached = await this.prisma.idempotencyKey.findUnique({
      where: { key: compositeKey },
    });

    if (cached?.response) {
      this.logger.debug(`Idempotency hit: ${compositeKey}`);
      return of(cached.response);
    }

    // İlk kez — işle ve kaydet
    return next.handle().pipe(
      tap(async (response: unknown) => {
        try {
          await this.prisma.idempotencyKey.create({
            data: {
              key:       compositeKey,
              tenantId,
              response:  response as object,
              expiresAt: new Date(Date.now() + TTL_MS),
            },
          });
        } catch (err) {
          // Race condition: başka bir istek aynı key'i kaydetmiş olabilir → görmezden gel
          this.logger.warn(`Idempotency key kayıt hatası (muhtemelen race): ${compositeKey}`);
        }
      }),
    );
  }
}
