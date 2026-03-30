/**
 * TENANT CONTROLLER
 * ─────────────────────────────────────────────────────────────────────────────
 * Mevcut tenant bilgilerini döndürür ve günceller.
 *
 * Güvenlik:
 *   • tenantId SADECE @CurrentTenant()'dan (JWT), body/query'den ASLA.
 * ─────────────────────────────────────────────────────────────────────────────
 */

import {
  Controller, Get, Patch, Body, HttpCode, HttpStatus,
} from '@nestjs/common';
import {
  ApiBearerAuth, ApiOkResponse, ApiOperation, ApiTags,
} from '@nestjs/swagger';
import {
  IsString, IsOptional, MinLength, MaxLength,
} from 'class-validator';

import { PrismaService }  from '../../common/prisma.service';
import { CurrentTenant }   from '../../common/decorators/current-tenant.decorator';

// ── DTO ────────────────────────────────────────────────────────────────────────

class UpdateTenantProfileDto {
  @IsOptional()
  @IsString()
  @MinLength(2)
  @MaxLength(100)
  name?: string;

  @IsOptional()
  @IsString()
  @MaxLength(20)
  brandColor?: string;

  @IsOptional()
  @IsString()
  @MaxLength(200)
  phone?: string;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  address?: string;

  @IsOptional()
  @IsString()
  @MaxLength(100)
  city?: string;
}

// ── Controller ─────────────────────────────────────────────────────────────────

@ApiTags('Tenant')
@ApiBearerAuth()
@Controller('tenants')
export class TenantController {
  constructor(private readonly prisma: PrismaService) {}

  @Get('me')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Mevcut tenant bilgisi (white-label için)' })
  @ApiOkResponse({ description: 'Tenant bilgisi döndü' })
  async getMe(@CurrentTenant() tenantId: string) {
    const tenant = await this.prisma.tenant.findUnique({
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
        locations:  {
          where:   { isDeleted: false },
          take:    1,
          orderBy: { createdAt: 'asc' },
          select:  { id: true, name: true, address: true, city: true, phone: true },
        },
      },
    });

    if (!tenant) return null;

    const loc = tenant.locations[0] ?? null;
    return {
      ...tenant,
      locations: undefined,
      location: loc,
    };
  }

  @Patch('me')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Tenant profil bilgilerini güncelle' })
  @ApiOkResponse({ description: 'Güncellenen tenant bilgisi' })
  async updateMe(
    @CurrentTenant() tenantId: string,
    @Body()          dto: UpdateTenantProfileDto,
  ) {
    const { name, brandColor, phone, address, city } = dto;

    // Update tenant fields
    if (name || brandColor !== undefined) {
      await this.prisma.tenant.update({
        where: { id: tenantId },
        data: {
          ...(name       ? { name }       : {}),
          ...(brandColor !== undefined ? { brandColor } : {}),
        },
      });
    }

    // Update primary location
    if (phone !== undefined || address !== undefined || city !== undefined) {
      const primaryLocation = await this.prisma.location.findFirst({
        where: { tenantId, isDeleted: false },
        orderBy: { createdAt: 'asc' },
      });

      if (primaryLocation) {
        await this.prisma.location.update({
          where: { id: primaryLocation.id },
          data: {
            ...(phone   !== undefined ? { phone }   : {}),
            ...(address !== undefined ? { address } : {}),
            ...(city    !== undefined ? { city }    : {}),
          },
        });
      }
    }

    // Return updated state
    return this.getMe(tenantId);
  }
}
