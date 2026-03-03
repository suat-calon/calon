/**
 * PRODUCT CONTROLLER
 * ─────────────────────────────────────────────────────────────────────────────
 * Ürün kataloğu temel CRUD endpoint'leri.
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
import { Product } from '@prisma/client';

import { PrismaService }    from '../../common/prisma.service';
import { CurrentTenant }    from '../../common/decorators/current-tenant.decorator';
import { WriteOperation }   from '../billing/decorators/write-operation.decorator';
import { CreateProductDto } from './dto/create-product.dto';

@ApiTags('Catalog / Products')
@ApiBearerAuth()
@Controller('products')
export class ProductController {
  constructor(private readonly prisma: PrismaService) {}

  // ── POST /products ───────────────────────────────────────────────────────

  @Post()
  @WriteOperation()
  @HttpCode(HttpStatus.CREATED)
  @ApiCreatedResponse({ description: 'Ürün oluşturuldu' })
  async create(
    @CurrentTenant() tenantId: string,
    @Body()          dto:      CreateProductDto,
  ): Promise<Product> {
    return this.prisma.product.create({
      data: {
        tenantId,
        name:        dto.name,
        sku:         dto.sku,
        unit:        dto.unit        ?? 'ml',
        stockAmount: dto.stockAmount ?? 0,
        minStock:    dto.minStock    ?? 0,
        costPrice:   dto.costPrice   ?? 0,
      },
    });
  }

  // ── GET /products ────────────────────────────────────────────────────────

  @Get()
  @ApiOkResponse({ description: 'Aktif ürün listesi' })
  async findAll(@CurrentTenant() tenantId: string): Promise<Product[]> {
    // Prisma middleware: tenantId + isDeleted:false otomatik eklenir.
    // Explicit tenantId ekstra güvenlik katmanı sağlar.
    return this.prisma.product.findMany({
      where:   { tenantId, isActive: true },
      orderBy: { name: 'asc' },
    });
  }
}
