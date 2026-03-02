/**
 * LEDGER SERVICE — Değiştirilemez Finansal Defter (Immutable Ledger)
 * ─────────────────────────────────────────────────────────────────────────────
 * MİMARİ ANAYASA KURALI:
 *   Bu servis YALNIZCA kayıt ekleme (CREATE) yapar.
 *   Hiçbir metodun Update/Delete muadili kasıtlı olarak yoktur.
 *
 *   Bir işlemin iptali veya düzeltmesi → negatif tutarlı YENİ bir kayıt
 *   (reversal) eklenerek gerçekleştirilir. Hiçbir kayıt asla değiştirilmez.
 *
 * İki kullanım şekli:
 *   1. Bağımsız: ledgerService.record(input)
 *      → kendi içinde PrismaService kullanır
 *   2. $transaction içinde: ledgerService.record(input, tx)
 *      → caller'ın transaction istemcisi ile atomik çalışır
 *
 * KVKK notu: TransactionLedger kayıtları 10 yıl saklanır, fiziksel silinmez.
 * ─────────────────────────────────────────────────────────────────────────────
 */

import { Injectable } from '@nestjs/common';
import {
  Prisma,
  TransactionLedger,
  TransactionType,
} from '@prisma/client';

import { PrismaService } from '../../common/prisma.service';

// ── Giriş tipi ───────────────────────────────────────────────────────────────

export interface RecordLedgerInput {
  tenantId:       string;
  appointmentId?: string;
  type:           TransactionType;
  /** Sayı, string veya Prisma.Decimal — Decimal'e çevrilir */
  amount:         Prisma.Decimal | number | string;
  currency?:      string;                               // Varsayılan: TRY
  description?:   string;
  reference?:     string;
}

// ── Servis ───────────────────────────────────────────────────────────────────

@Injectable()
export class LedgerService {
  constructor(private readonly prisma: PrismaService) {}

  // ── record (Append-Only) ──────────────────────────────────────────────────

  /**
   * Deftere yeni bir satır ekler.
   *
   * @param input  Ledger kaydı verileri
   * @param tx     Opsiyonel Prisma transaction istemcisi.
   *               Verilirse mevcut transaction içinde çalışır (atomik).
   *               Verilmezse PrismaService üzerinden bağımsız işlem yapar.
   *
   * UYARI — Bu metodun Update veya Delete muadili kasıtlı olarak YOKTUR.
   * İptal/iade için negatif tutarlı yeni kayıt ekleyin:
   *   ledgerService.record({ ...input, amount: -amount, type: REFUND })
   */
  record(
    input: RecordLedgerInput,
    tx?:   Prisma.TransactionClient,
  ): Promise<TransactionLedger> {
    // PrismaService extends PrismaClient → aynı model arayüzleri mevcuttur.
    const db: Prisma.TransactionClient =
      tx ?? (this.prisma as unknown as Prisma.TransactionClient);

    return db.transactionLedger.create({
      data: {
        tenantId:      input.tenantId,
        appointmentId: input.appointmentId ?? null,
        type:          input.type,
        amount:        new Prisma.Decimal(String(input.amount)),
        currency:      input.currency  ?? 'TRY',
        description:   input.description ?? null,
        reference:     input.reference   ?? null,
      },
    });
  }

  // ── read (salt okunur) ────────────────────────────────────────────────────

  /**
   * Bir randevuya ait tüm ledger satırlarını kronolojik sırayla döner.
   * Ledger okuma işlemleri her zaman güvenlidir — değişiklik içermez.
   */
  findByAppointment(
    tenantId:      string,
    appointmentId: string,
  ): Promise<TransactionLedger[]> {
    return this.prisma.transactionLedger.findMany({
      where:   { tenantId, appointmentId },
      orderBy: { processedAt: 'asc' },
    });
  }

  /**
   * Tenant'a ait tüm finansal hareketler — tarih sırasıyla, sayfalı.
   */
  findByTenant(
    tenantId: string,
    take = 100,
    skip = 0,
  ): Promise<TransactionLedger[]> {
    return this.prisma.transactionLedger.findMany({
      where:   { tenantId },
      orderBy: { processedAt: 'desc' },
      take,
      skip,
    });
  }
}
