/**
 * COMMISSION SERVICE — Hakediş Hesaplama ve Loglama
 * ─────────────────────────────────────────────────────────────────────────────
 * Temel iş kuralları:
 *   • calculateAndLogCommission() MUTLAKA $transaction içinde çağrılmalıdır.
 *   • commissionRate === 0 ise CommissionLog oluşturulmaz (null döner).
 *   • Hata durumunda exception fırlatılır → çağıranın $transaction'ı ROLLBACK yapar.
 *   • periodStart / periodEnd: İçinde bulunulan ayın 1'i ve son günü.
 *
 * Hesaplama formülü:
 *   amount = serviceAmount × (commissionRate / 100)
 *   Örn: 500 TRY hizmet, %15 prim → 75.00 TRY hakediş
 *
 * Güvenlik:
 *   • tx.staffProfile.findUnique → middleware hariç → manual tenantId kontrolü zorunlu
 *   • tx.commissionLog.create → middleware 'create' WRITE_OPS içinde → tenantId otomatik
 *     enjekte edilir; yine de açıkça geçilir (savunmacı kodlama)
 * ─────────────────────────────────────────────────────────────────────────────
 */

import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { CommissionLog, Prisma }                 from '@prisma/client';

import { PrismaService } from '../../common/prisma.service';

// ── Giriş tipi ───────────────────────────────────────────────────────────────

export interface CalculateCommissionInput {
  tenantId:      string;
  staffId:       string;
  appointmentId: string;
  /** Brüt hizmet tutarı (Prisma.Decimal veya dönüştürülebilir değer) */
  serviceAmount: Prisma.Decimal | number | string;
}

// ── Servis ───────────────────────────────────────────────────────────────────

@Injectable()
export class CommissionService {
  private readonly logger = new Logger(CommissionService.name);

  constructor(private readonly prisma: PrismaService) {}

  // ── calculateAndLogCommission ────────────────────────────────────────────

  /**
   * Personelin hakedişini hesaplar ve CommissionLog'a yazar.
   *
   * @param input  Hesaplama girdileri (tenantId, staffId, appointmentId, serviceAmount)
   * @param tx     Çağıranın $transaction istemcisi — bu method kendi transaction açmaz.
   *               Hata durumunda caller'ın $transaction'ı otomatik ROLLBACK yapar.
   * @returns CommissionLog kaydı; prim oranı 0 ise null.
   */
  async calculateAndLogCommission(
    input: CalculateCommissionInput,
    tx:    Prisma.TransactionClient,
  ): Promise<CommissionLog | null> {
    const { tenantId, staffId, appointmentId, serviceAmount } = input;

    // ── 1. Personel profilini al (commissionRate için) ──────────────────────
    // findUnique: middleware'den hariç → tenantId + isDeleted manuel kontrol
    const staff = await tx.staffProfile.findUnique({ where: { id: staffId } });

    if (!staff || staff.tenantId !== tenantId || staff.isDeleted) {
      throw new NotFoundException(`Personel bulunamadı (staffId: ${staffId})`);
    }

    // ── 2. Prim oranı 0 → kayıt oluşturma, erken çık ──────────────────────
    if (staff.commissionRate === 0) {
      this.logger.debug(
        `Prim oranı 0 — CommissionLog oluşturulmadı (staffId: ${staffId}, appt: ${appointmentId})`,
      );
      return null;
    }

    // ── 3. Hakediş tutarını hesapla ──────────────────────────────────────
    const gross = new Prisma.Decimal(String(serviceAmount));
    const rate  = staff.commissionRate;                          // % (örn. 15.0 → %15)
    const amount = gross
      .mul(new Prisma.Decimal(rate))
      .div(new Prisma.Decimal(100))
      .toDecimalPlaces(2, Prisma.Decimal.ROUND_HALF_UP);

    this.logger.debug(
      `Hakediş: ${gross} × %${rate} = ${amount} TRY (staffId: ${staffId})`,
    );

    // ── 4. Bu ayın periyot sınırlarını hesapla ───────────────────────────
    const now         = new Date();
    const periodStart = new Date(now.getFullYear(), now.getMonth(), 1);
    const periodEnd   = new Date(now.getFullYear(), now.getMonth() + 1, 0); // Ayın son günü

    // ── 5. CommissionLog oluştur ─────────────────────────────────────────
    const log = await tx.commissionLog.create({
      data: {
        tenantId,
        staffId,
        appointmentId,
        amount,
        rate,
        periodStart,
        periodEnd,
        isPaid: false,
      },
    });

    this.logger.log(
      `CommissionLog oluşturuldu (id: ${log.id}, amount: ${amount}, staffId: ${staffId})`,
    );

    return log;
  }

  // ── findByStaff ──────────────────────────────────────────────────────────

  /**
   * Bir personelin tüm hakediş kayıtlarını döndürür.
   * İsteğe bağlı isPaid filtresi ile ödenmemiş hakedişler listelenebilir.
   */
  findByStaff(
    tenantId:  string,
    staffId:   string,
    isPaid?:   boolean,
  ): Promise<CommissionLog[]> {
    return this.prisma.commissionLog.findMany({
      where: {
        tenantId,
        staffId,
        ...(isPaid !== undefined ? { isPaid } : {}),
      },
      orderBy: { periodStart: 'desc' },
    });
  }
}
