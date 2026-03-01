/**
 * STOCK SERVICE — İDEMPOTENT STOK DÜŞÜM MOTORU
 * ─────────────────────────────────────────────────────────────────────────────
 * Bir randevunun tamamlanmasıyla tetiklenen stok düşümünü güvenli ve
 * tekrarsız biçimde gerçekleştirir.
 *
 * İdempotency stratejisi:
 *   AuditLog'da `action = 'INVENTORY_DEDUCTED'` + `entityId = appointmentId`
 *   kaydı zaten varsa → sessizce return (çift düşümü engelle).
 *
 * Worker context'inde (BullMQ arka plan):
 *   - HTTP request yok → tenantContext.getStore() boş → middleware tenant
 *     izolasyonu ÇALIŞMAZ. Bu nedenle tüm sorgularda tenantId AÇIKÇA verilir.
 * ─────────────────────────────────────────────────────────────────────────────
 */

import { Injectable, Logger } from '@nestjs/common';
import { Prisma }             from '@prisma/client';

import { PrismaService } from '../../common/prisma.service';

@Injectable()
export class StockService {
  private readonly logger = new Logger(StockService.name);

  constructor(private readonly prisma: PrismaService) {}

  /**
   * Verilen randevu için hizmet reçetesindeki ürün stoklarını düşer.
   *
   * @param appointmentId  Tamamlanan randevunun UUID'si
   * @param tenantId       İşletme tenant UUID'si (TenantGuard'dan / job payload'ından)
   * @param serviceId      Yapılan hizmetin UUID'si
   */
  async deductForAppointment(
    appointmentId: string,
    tenantId:      string,
    serviceId:     string,
  ): Promise<void> {
    // ── 1. İdempotency kontrolü ──────────────────────────────────────────────
    // Worker context'inde middleware devrede değil → explicit tenantId zorunlu.
    const alreadyProcessed = await this.prisma.auditLog.findFirst({
      where: {
        tenantId,
        entityType: 'Appointment',
        entityId:   appointmentId,
        action:     'INVENTORY_DEDUCTED',
      },
    });

    if (alreadyProcessed) {
      this.logger.log(
        `[İdempotency] Randevu=${appointmentId} stok düşümü daha önce yapılmış — atlanıyor.`,
      );
      return;
    }

    // ── 2. Hizmet reçetesini bul ─────────────────────────────────────────────
    // ServiceProduct junction — doğrudan tenantId yok; serviceId zaten
    // randevudan geldiği için tenant uyumu sonraki adımda product üzerinden doğrulanır.
    const usages = await this.prisma.serviceProduct.findMany({
      where: { serviceId },
    });

    if (usages.length === 0) {
      this.logger.log(
        `[Stok] Hizmet=${serviceId} için reçete (ServiceProduct) bulunamadı — atlanıyor.`,
      );
      return;
    }

    // ── 3. Atomik işlem: stok düş + StockLog + AuditLog ─────────────────────
    await this.prisma.$transaction(async (tx: Prisma.TransactionClient) => {
      for (const usage of usages) {
        // Ürünün bu tenant'a ait olduğunu doğrula (çapraz-tenant güvenlik kalkanı)
        const product = await tx.product.findFirst({
          where: { id: usage.productId, tenantId, isDeleted: false },
        });

        if (!product) {
          this.logger.warn(
            `[Stok] Ürün bulunamadı veya tenant uyuşmuyor: productId=${usage.productId} ` +
            `— atlanıyor.`,
          );
          continue;
        }

        // Stok miktarını atomik olarak azalt (negatif miktar izin verilir — uyarı mekanizması)
        await tx.product.update({
          where: { id: product.id },
          data:  { stockAmount: { decrement: usage.usageAmount } },
        });

        // StockLog: delta negatif → malzeme çıkışı
        await tx.stockLog.create({
          data: {
            productId: product.id,
            tenantId,
            delta:  usage.usageAmount.neg(),          // decimal.js .neg() → negatif Decimal
            reason: `appointment:${appointmentId}`,
          },
        });
      }

      // AuditLog: idempotency damgası — sonraki retry'larda çift düşümü önler
      await tx.auditLog.create({
        data: {
          tenantId,
          entityType: 'Appointment',
          entityId:   appointmentId,
          action:     'INVENTORY_DEDUCTED',
          after: {
            serviceId,
            processedProducts: usages.length,
          },
        },
      });
    });

    this.logger.log(
      `[Stok] Tamamlandı: randevu=${appointmentId} | ${usages.length} reçete ürünü işlendi.`,
    );
  }
}
