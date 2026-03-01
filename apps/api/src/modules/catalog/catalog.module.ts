/**
 * CATALOG MODULE
 * ─────────────────────────────────────────────────────────────────────────────
 * Ürün ve hizmet kataloğu.
 *
 * Notlar:
 *   • DatabaseModule @Global() → PrismaService yeniden import GEREKMİYOR.
 * ─────────────────────────────────────────────────────────────────────────────
 */

import { Module } from '@nestjs/common';

import { ProductController } from './product.controller';
import { ServiceController } from './service.controller';

@Module({
  controllers: [ProductController, ServiceController],
})
export class CatalogModule {}
