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
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  NotFoundException,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
} from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiCreatedResponse,
  ApiNoContentResponse,
  ApiNotFoundResponse,
  ApiOkResponse,
  ApiTags,
} from '@nestjs/swagger';
import { Service } from '@prisma/client';

import { PrismaService }    from '../../common/prisma.service';
import { CurrentTenant }    from '../../common/decorators/current-tenant.decorator';
import { WriteOperation }   from '../billing/decorators/write-operation.decorator';
import { CreateServiceDto } from './dto/create-service.dto';
import { UpdateServiceDto } from './dto/update-service.dto';

@ApiTags('Catalog / Services')
@ApiBearerAuth()
@Controller('services')
export class ServiceController {
  constructor(private readonly prisma: PrismaService) {}

  // ── POST /services ───────────────────────────────────────────────────────

  @Post()
  @WriteOperation()
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

  // ── PATCH /:id ────────────────────────────────────────────────────────────

  /**
   * Hizmeti güncelle (isim, fiyat, süre vb).
   *
   * 200: Hizmet güncellendi.
   * 404: Hizmet bulunamadı.
   */
  @Patch(':id')
  @WriteOperation()
  @HttpCode(HttpStatus.OK)
  @ApiOkResponse({ description: 'Hizmet güncellendi' })
  @ApiNotFoundResponse({ description: 'Hizmet bulunamadı' })
  async update(
    @CurrentTenant()            tenantId: string,
    @Param('id', ParseUUIDPipe) id:       string,
    @Body()                     dto:      UpdateServiceDto,
  ): Promise<Service> {
    const service = await this.prisma.service.findFirst({
      where: { id, tenantId, isDeleted: false },
    });
    if (!service) {
      throw new NotFoundException('Hizmet bulunamadı');
    }
    return this.prisma.service.update({
      where: { id },
      data: {
        name:        dto.name        ?? service.name,
        description: dto.description ?? service.description,
        durationMin: dto.durationMin ?? service.durationMin,
        price:       dto.price       ?? service.price,
        depositRate: dto.depositRate ?? service.depositRate,
        isActive:    dto.isActive    ?? service.isActive,
      },
    });
  }

  // ── DELETE /:id ───────────────────────────────────────────────────────────

  /**
   * Hizmeti soft delete (isDeleted: true).
   *
   * 204: Hizmet silindi.
   * 404: Hizmet bulunamadı.
   */
  @Delete(':id')
  @WriteOperation()
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiNoContentResponse({ description: 'Hizmet silindi' })
  @ApiNotFoundResponse({ description: 'Hizmet bulunamadı' })
  async remove(
    @CurrentTenant()            tenantId: string,
    @Param('id', ParseUUIDPipe) id:       string,
  ): Promise<void> {
    const service = await this.prisma.service.findFirst({
      where: { id, tenantId, isDeleted: false },
    });
    if (!service) {
      throw new NotFoundException('Hizmet bulunamadı');
    }
    await this.prisma.service.update({
      where: { id },
      data: { isDeleted: true },
    });
  }
}
