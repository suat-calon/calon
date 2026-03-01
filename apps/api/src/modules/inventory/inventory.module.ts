/**
 * INVENTORY MODULE
 * ─────────────────────────────────────────────────────────────────────────────
 * Arka plan stok motoru.
 *
 * Notlar:
 *   • BullModule'ü yeniden import ETME — RedisModule @Global() ile tüm
 *     kuyrukları (stock-deduct dahil) zaten kayıt etti ve export etti.
 *   • PrismaService'i yeniden provide ETME — DatabaseModule @Global().
 * ─────────────────────────────────────────────────────────────────────────────
 */

import { Module } from '@nestjs/common';

import { StockProcessor } from './stock.processor';
import { StockService }   from './stock.service';

@Module({
  providers: [StockService, StockProcessor],
})
export class InventoryModule {}
