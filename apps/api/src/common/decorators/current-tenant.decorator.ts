import { createParamDecorator, ExecutionContext } from '@nestjs/common';

/**
 * @CurrentTenant() — TenantGuard tarafından doğrulanmış tenantId'yi enjekte eder.
 *
 * Kullanım: controller parametre dekoratörü olarak
 *   create(@CurrentTenant() tenantId: string) { ... }
 *
 * Güvenlik: tenantId SADECE doğrulanmış JWT'den gelir; kullanıcı girdisinden ASLA.
 */
export const CurrentTenant = createParamDecorator(
  (_data: unknown, ctx: ExecutionContext): string => {
    const req = ctx.switchToHttp().getRequest<{ tenantId: string }>();
    return req.tenantId;
  },
);
