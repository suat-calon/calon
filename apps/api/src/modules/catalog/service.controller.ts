/**
 * SERVICE CONTROLLER
 * ─────────────────────────────────────────────────────────────────────────────
 * Hizmet kataloğu temel CRUD endpoint'leri.
 *
 * Güvenlik:
 *   • tenantId ASLA body'den alınmaz — TenantGuard → req.tenantId üzerinden gelir.
 *   • findMany'de Prisma middleware: tenantId + isDeleted:false otomatik eklenir.
 * ─────────────────────────────────────────────────────────────────────────────
 */

import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Post,
} from '@nestjs/common';
import { ApiBearerAuth, ApiCreatedResponse, ApiOkResponse, ApiTags } from '@nestjs/swagger';
import { Service } from '@prisma/client';

import { PrismaService }    from '../../common/prisma.service';
import { CurrentTenant }    from '../../common/decorators/current-tenant.decorator';
import { CreateServiceDto } from './dto/create-service.dto';

@ApiTags('Catalog / Services')
@ApiBearerAuth()
@Controller('services')
export class ServiceController {
  constructor(private readonly prisma: PrismaService) {}

  // ── POST /services ───────────────────────────────────────────────────────

  @Post()
  @HttpCode(HttpStatus.CREATED)
  @ApiCreatedResponse({ description: 'Hizmet oluşturuldu' })
  async create(
    @CurrentTenant() tenantId: string,
    @Body()          dto:      CreateServiceDto,
  ): Promise<Service> {
    return this.prisma.service.create({
      data: {
        tenantId,
        categoryId:  dto.categoryId,
        name:        dto.name,
        description: dto.description,
        durationMin: dto.durationMin,
        price:       dto.price,
        currency:    dto.currency    ?? 'TRY',
        depositRate: dto.depositRate ?? 0,
      },
    });
  }

  // ── GET /services ────────────────────────────────────────────────────────

  @Get()
  @ApiOkResponse({ description: 'Aktif hizmet listesi' })
  async findAll(@CurrentTenant() tenantId: string): Promise<Service[]> {
    // Prisma middleware: tenantId + isDeleted:false otomatik eklenir.
    return this.prisma.service.findMany({
      where:   { tenantId, isActive: true },
      orderBy: { name: 'asc' },
    });
  }
}
