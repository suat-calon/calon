import { createParamDecorator, ExecutionContext } from '@nestjs/common';

export interface CurrentUserPayload {
  id:   string;  // JWT sub → userId
  role: string;  // JWT role
}

/**
 * @CurrentUser() — TenantGuard tarafından doğrulanmış kullanıcı bilgisini enjekte eder.
 *
 * Kullanım: controller parametre dekoratörü olarak
 *   update(@CurrentUser() user: CurrentUserPayload) { ... }
 */
export const CurrentUser = createParamDecorator(
  (_data: unknown, ctx: ExecutionContext): CurrentUserPayload => {
    const req = ctx.switchToHttp().getRequest<{ userId: string; userRole: string }>();
    return { id: req.userId, role: req.userRole };
  },
);
