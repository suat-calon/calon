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
import { Product } from '@prisma/client';

import { PrismaService }     from '../../common/prisma.service';
import { CurrentTenant }     from '../../common/decorators/current-tenant.decorator';
import { WriteOperation }    from '../billing/decorators/write-operation.decorator';
import { CreateProductDto }  from './dto/create-product.dto';
import { UpdateProductDto }  from './dto/update-product.dto';

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

  // ── PATCH /:id ────────────────────────────────────────────────────────────

  /**
   * Ürünü güncelle (isim, fiyat, stok vb).
   *
   * 200: Ürün güncellendi.
   * 404: Ürün bulunamadı.
   */
  @Patch(':id')
  @WriteOperation()
  @HttpCode(HttpStatus.OK)
  @ApiOkResponse({ description: 'Ürün güncellendi' })
  @ApiNotFoundResponse({ description: 'Ürün bulunamadı' })
  async update(
    @CurrentTenant()            tenantId: string,
    @Param('id', ParseUUIDPipe) id:       string,
    @Body()                     dto:      UpdateProductDto,
  ): Promise<Product> {
    const product = await this.prisma.product.findFirst({
      where: { id, tenantId, isDeleted: false },
    });
    if (!product) {
      throw new NotFoundException('Ürün bulunamadı');
    }
    return this.prisma.product.update({
      where: { id },
      data: {
        name:        dto.name        ?? product.name,
        sku:         dto.sku         ?? product.sku,
        unit:        dto.unit        ?? product.unit,
        stockAmount: dto.stockAmount ?? product.stockAmount,
        minStock:    dto.minStock    ?? product.minStock,
        costPrice:   dto.costPrice   ?? product.costPrice,
        isActive:    dto.isActive    ?? product.isActive,
      },
    });
  }

  // ── DELETE /:id ───────────────────────────────────────────────────────────

  /**
   * Ürünü soft delete (isDeleted: true).
   *
   * 204: Ürün silindi.
   * 404: Ürün bulunamadı.
   */
  @Delete(':id')
  @WriteOperation()
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiNoContentResponse({ description: 'Ürün silindi' })
  @ApiNotFoundResponse({ description: 'Ürün bulunamadı' })
  async remove(
    @CurrentTenant()            tenantId: string,
    @Param('id', ParseUUIDPipe) id:       string,
  ): Promise<void> {
    const product = await this.prisma.product.findFirst({
      where: { id, tenantId, isDeleted: false },
    });
    if (!product) {
      throw new NotFoundException('Ürün bulunamadı');
    }
    await this.prisma.product.update({
      where: { id },
      data: { isDeleted: true },
    });
  }
}
