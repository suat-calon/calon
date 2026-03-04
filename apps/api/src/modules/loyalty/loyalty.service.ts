/**
 * LOYALTY SERVICE — Append-only Ledger Tabanlı Sadakat Motoru
 * ──────────────────────────────────────────────────────────────────────────────
 * Mimari Kurallar:
 *   • LoyaltyTransaction tablosu APPEND-ONLY — Update/Delete yoktur.
 *   • Harcama (REDEEMED) = negatif puanlı yeni kayıt.
 *   • Customer.loyaltyPoints sadece önbellektir; gerçek kaynak ledger'dır.
 *   • Atomiklik: SELECT FOR UPDATE → INSERT → UPDATE (kilit sırası sabit).
 *   • İdempotency: idempotencyKey UNIQUE kısıtı — P2002 yakalanır, mevcut kayıt döner.
 *
 * MVP Kural: points = floor(totalPrice * 0.01)
 * ──────────────────────────────────────────────────────────────────────────────
 */

import {
  Injectable,
  Logger,
  BadRequestException,
  NotFoundException,
} from '@nestjs/common';
import { Prisma, LoyaltyTransaction } from '@prisma/client';

import { PrismaService }         from '../../common/prisma.service';
import { RedeemPointsDto }       from './dto/redeem-points.dto';
import { LoyaltyHistoryQueryDto } from './dto/loyalty-history-query.dto';

// ── Tipler ──────────────────────────────────────────────────────────────────

export interface EarnFromAppointmentPayload {
  tenantId:       string;
  customerId:     string;
  /** Gerçek randevu kaydı ID'si; test ortamında null geçilebilir. */
  appointmentId:  string | null;
  totalPrice:     string;
  idempotencyKey: string;
}

/** Faz 18: Referral puan kazanımı payload */
export interface EarnFromReferralPayload {
  tenantId:       string;
  customerId:     string;  // referrer (kodu paylaşan)
  referralId:     string;  // Referral kayıt ID'si
  points:         number;  // Sabit: 50
  idempotencyKey: string;  // "referral:{referralId}"
}

export interface LoyaltyHistoryResult {
  balance: number;
  total:   number;
  items:   LoyaltyTransaction[];
}

// ── Yardımcı ────────────────────────────────────────────────────────────────

function isUniqueViolation(err: unknown): boolean {
  return (
    err instanceof Prisma.PrismaClientKnownRequestError &&
    err.code === 'P2002'
  );
}

// ── Servis ──────────────────────────────────────────────────────────────────

@Injectable()
export class LoyaltyService {
  private readonly logger = new Logger(LoyaltyService.name);

  constructor(private readonly prisma: PrismaService) {}

  // ── MVP Kural: %1 puan ────────────────────────────────────────────────────
  static calculatePoints(totalPrice: number | string): number {
    return Math.floor(Number(totalPrice) * 0.01);
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // EARN — Randevu tamamlandığında BullMQ processor tarafından çağrılır
  // ═══════════════════════════════════════════════════════════════════════════
  async earnFromAppointment(payload: EarnFromAppointmentPayload): Promise<void> {
    const { tenantId, customerId, appointmentId, totalPrice, idempotencyKey } = payload;

    // ── 1. İdempotency kontrolü (findUnique: middleware bypass) ─────────────
    const existing = await this.prisma.loyaltyTransaction.findUnique({
      where: { idempotencyKey },
    });
    if (existing) {
      this.logger.debug(`[Loyalty] Earn zaten işlendi: ${idempotencyKey}`);
      return;
    }

    // ── 2. Puan hesapla ─────────────────────────────────────────────────────
    const points = LoyaltyService.calculatePoints(totalPrice);
    if (points <= 0) {
      this.logger.debug(`[Loyalty] Puan = 0, atlanıyor (totalPrice=${totalPrice})`);
      return;
    }

    // ── 3. Atomik: SELECT FOR UPDATE → LoyaltyTransaction INSERT → Customer UPDATE ──
    await this.prisma.$transaction(async (tx: Prisma.TransactionClient) => {
      // Satır kilidi — eş zamanlı işlemlerde bakiye tutarlılığı
      const rows = await tx.$queryRawUnsafe<Array<{ loyaltyPoints: number }>>(
        `SELECT "loyaltyPoints"
           FROM customers
          WHERE id = $1::uuid
            AND "tenantId" = $2::uuid
            AND "isDeleted" = FALSE
          FOR UPDATE`,
        customerId,
        tenantId,
      );

      if (!rows[0]) {
        this.logger.warn(`[Loyalty] Müşteri bulunamadı: ${customerId}`);
        return;
      }

      const newBalance = rows[0].loyaltyPoints + points;

      // Append-only insert
      await tx.loyaltyTransaction.create({
        data: {
          tenantId,
          customerId,
          appointmentId,
          action:         'EARNED_APPOINTMENT',
          points,
          balanceAfter:   newBalance,
          description:    'Randevu tamamlandı — puan kazanımı',
          idempotencyKey,
        },
      });

      // Önbellek güncelleme (gerçek kaynak ledger'dır)
      await tx.customer.update({
        where: { id: customerId },
        data:  { loyaltyPoints: newBalance },
      });
    });

    this.logger.log(
      `[Loyalty] +${points} puan | customerId=${customerId} | key=${idempotencyKey}`,
    );
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // EARN FROM REFERRAL — Faz 18: BullMQ ReferralProcessor tarafından çağrılır
  // ═══════════════════════════════════════════════════════════════════════════
  async earnFromReferral(payload: EarnFromReferralPayload): Promise<void> {
    const { tenantId, customerId, referralId, points, idempotencyKey } = payload;

    // ── 1. İdempotency: zaten işlendiyse sessizce geç ───────────────────────
    const existing = await this.prisma.loyaltyTransaction.findUnique({
      where: { idempotencyKey },
    });
    if (existing) {
      this.logger.debug(`[Loyalty] Referral earn zaten işlendi: ${idempotencyKey}`);
      return;
    }

    // ── 2. Atomik: SELECT FOR UPDATE → INSERT → UPDATE ───────────────────────
    await this.prisma.$transaction(async (tx: Prisma.TransactionClient) => {
      const rows = await tx.$queryRawUnsafe<Array<{ loyaltyPoints: number }>>(
        `SELECT "loyaltyPoints"
           FROM customers
          WHERE id = $1::uuid
            AND "tenantId" = $2::uuid
            AND "isDeleted" = FALSE
          FOR UPDATE`,
        customerId,
        tenantId,
      );

      if (!rows[0]) {
        this.logger.warn(`[Loyalty] Referrer bulunamadı: ${customerId}`);
        return;
      }

      const newBalance = rows[0].loyaltyPoints + points;

      await tx.loyaltyTransaction.create({
        data: {
          tenantId,
          customerId,
          action:        'EARNED_REFERRAL',
          points,
          balanceAfter:  newBalance,
          description:   `Referral ödülü — referralId:${referralId}`,
          idempotencyKey,
        },
      });

      await tx.customer.update({
        where: { id: customerId },
        data:  { loyaltyPoints: newBalance },
      });
    });

    this.logger.log(
      `[Loyalty] +${points} referral puanı | customerId=${customerId} | key=${idempotencyKey}`,
    );
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // REDEEM — POST /loyalty/redeem — negatif ledger kaydı + önbellek düşümü
  // ═══════════════════════════════════════════════════════════════════════════
  async redeem(
    tenantId:       string,
    dto:            RedeemPointsDto,
    idempotencyKey: string,
  ): Promise<LoyaltyTransaction> {
    // ── 1. Pre-check: ardışık çift tıklama / retry'ı burada yakala ──────────
    // Not: Bu check, $transaction dışında yapılır. PostgreSQL'de P2002 (UNIQUE ihlali)
    // sonrası aynı transaction'da sorgu yapılamaz (25P02: aborted transaction).
    // Pre-check bu senaryoyu önler; concurrent case aşağıdaki outer catch ile ele alınır.
    const existingRecord = await this.prisma.loyaltyTransaction.findUnique({
      where: { idempotencyKey },
    });
    if (existingRecord) {
      this.logger.debug(`[Loyalty] Redeem pre-check: zaten işlendi: ${idempotencyKey}`);
      return existingRecord;
    }

    // ── 2. Atomik işlem ──────────────────────────────────────────────────────
    try {
      const result = await this.prisma.$transaction(async (tx: Prisma.TransactionClient) => {
        // ── SELECT FOR UPDATE: negatif bakiye engellensin ───────────────────
        const rows = await tx.$queryRawUnsafe<Array<{ loyaltyPoints: number }>>(
          `SELECT "loyaltyPoints"
             FROM customers
            WHERE id = $1::uuid
              AND "tenantId" = $2::uuid
              AND "isDeleted" = FALSE
            FOR UPDATE`,
          dto.customerId,
          tenantId,
        );

        if (!rows[0]) {
          throw new NotFoundException('Müşteri bulunamadı');
        }

        const currentBalance = rows[0].loyaltyPoints;
        if (currentBalance < dto.points) {
          throw new BadRequestException(
            `Yetersiz puan. Mevcut: ${currentBalance}, Talep: ${dto.points}`,
          );
        }

        const newBalance = currentBalance - dto.points;

        // Append-only: negatif puan = REDEEMED kaydı
        const txRecord = await tx.loyaltyTransaction.create({
          data: {
            tenantId,
            customerId:     dto.customerId,
            action:         'REDEEMED',
            points:         -dto.points,  // Daima negatif
            balanceAfter:   newBalance,
            description:    dto.description ?? 'Puan kullanımı',
            idempotencyKey,
          },
        });

        // Önbellek güncelleme
        await tx.customer.update({
          where: { id: dto.customerId },
          data:  { loyaltyPoints: newBalance },
        });

        return txRecord;
      });

      this.logger.log(
        `[Loyalty] -${dto.points} puan | customerId=${dto.customerId} | key=${idempotencyKey}`,
      );

      return result;
    } catch (err: unknown) {
      // ── Concurrent race: iki istek pre-check'i aynı anda geçti ─────────────
      // İlki commit etti → ikincisi P2002 aldı → transaction dışında mevcut kaydı bul.
      // Not: P2002 sonrası transaction aborted (25P02); burada YENI bir sorgu açılır.
      if (isUniqueViolation(err)) {
        const raceWinner = await this.prisma.loyaltyTransaction.findUnique({
          where: { idempotencyKey },
        });
        if (raceWinner) {
          this.logger.debug(`[Loyalty] Redeem concurrent race: zaten işlendi: ${idempotencyKey}`);
          return raceWinner;
        }
      }
      throw err;
    }
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // HISTORY — GET /loyalty/customers/:customerId/history
  // ═══════════════════════════════════════════════════════════════════════════
  async getHistory(
    tenantId:   string,
    customerId: string,
    query:      LoyaltyHistoryQueryDto,
  ): Promise<LoyaltyHistoryResult> {
    // findUnique: Prisma middleware bypass → manuel tenantId kontrolü zorunlu
    const customer = await this.prisma.customer.findUnique({
      where: { id: customerId },
    });

    if (!customer || customer.tenantId !== tenantId || customer.isDeleted) {
      throw new NotFoundException('Müşteri bulunamadı');
    }

    const page     = query.page     ?? 1;
    const pageSize = query.pageSize ?? 20;
    const skip     = (page - 1) * pageSize;

    const [items, total] = await this.prisma.$transaction([
      this.prisma.loyaltyTransaction.findMany({
        where:   { tenantId, customerId },
        orderBy: { createdAt: 'desc' },
        skip,
        take:    pageSize,
      }),
      this.prisma.loyaltyTransaction.count({
        where: { tenantId, customerId },
      }),
    ]);

    return {
      balance: customer.loyaltyPoints,  // Önbellek — ledger ile tutarlı
      total,
      items,
    };
  }
}
