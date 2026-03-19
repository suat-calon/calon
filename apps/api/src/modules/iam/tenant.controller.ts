/**
 * TENANT CONTROLLER
 * ─────────────────────────────────────────────────────────────────────────────
 * Mevcut tenant bilgilerini döndürür (white-label için gerekli).
 *
 * Güvenlik:
 *   • tenantId SADECE @CurrentTenant()'dan (JWT), body/query'den ASLA.
 * ─────────────────────────────────────────────────────────────────────────────
 */

import { Controller, Get, HttpCode, HttpStatus } from '@nestjs/common';
import { ApiBearerAuth, ApiOkResponse, ApiOperation, ApiTags } from '@nestjs/swagger';

import { PrismaService } from '../../common/prisma.service';
import { CurrentTenant } from '../../common/decorators/current-tenant.decorator';

@ApiTags('Tenant')
@ApiBearerAuth()
@Controller('tenants')
export class TenantController {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * Mevcut tenant bilgisi (brand, logo, timezone, locale).
   *
   * 200: Tenant bilgisi döner.
   */
  @Get('me')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Mevcut tenant bilgisi (white-label için)' })
  @ApiOkResponse({ description: 'Tenant bilgisi döndü' })
  async getMe(@CurrentTenant() tenantId: string) {
    return this.prisma.tenant.findUnique({
      where: { id: tenantId },
      select: {
        id:         true,
        name:       true,
        slug:       true,
        plan:       true,
        brandColor: true,
        logoUrl:    true,
        timezone:   true,
        locale:     true,
        currency:   true,
        createdAt:  true,
      },
    });
  }
}
