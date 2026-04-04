/**
 * PAYMENT SERVICE — Atomik Ödeme İşlemleri
 * ─────────────────────────────────────────────────────────────────────────────
 * takeDeposit() — Kaparo alma:
 *   $transaction { DEPOSIT ledger kaydı → appointment.depositPaid güncellemesi → AuditLog }
 *
 * checkout() — Hesap kapatma (tam ödeme + XState COMPLETED geçişi):
 *   $transaction { PAYMENT ledger kaydı → appointment.status=COMPLETED → AuditLog }
 *   + stok düşme kuyruğu ($transaction sonrası)
 *
 * Çift çekim koruması: PaymentController üzerindeki IdempotencyInterceptor
 * ile 24 saat süreyle donanımsal olarak engellenir.
 *
 * XState entegrasyonu (Faz 6 - Adım 3):
 *   isValidTransition() fonksiyonu checkout() içinde XState makinesiyle senkron
 *   geçiş doğrulaması yapar. IN_SERVICE → COMPLETED dışındaki tüm geçişler reddedilir.
 * ─────────────────────────────────────────────────────────────────────────────
 */

import {
  Injectable,
  BadRequestException,
  NotFoundException,
  Inject,
} from '@nestjs/common';
import { InjectQueue }        from '@nestjs/bull';
import { Queue }              from 'bull';
import {
  Appointment,
  AppointmentStatus,
  TransactionLedger,
  TransactionType,
  Money,
} from '@calon/database';

import { PrismaService }     from '../../common/prisma.service';
import { getActiveTxClient } from '../../common/tx.context';
import { Prisma }             from '@prisma/client';
import { QUEUE_NAMES }       from '../../common/redis.module';
import { LedgerService }     from './ledger.service';
import { isValidTransition } from '../operations/appointment/appointment.machine';
import { TakeDepositDto }    from './dto/take-deposit.dto';
import { CheckoutDto }       from './dto/checkout.dto';
import { buildAndValidateBreakdown } from './checkout-breakdown';
import { PAYMENT_REPO, IPaymentRepository } from './payment.repository.interface';

// ── Çıkış tipi ───────────────────────────────────────────────────────────────

export interface PaymentResult {
  appointment: Appointment;
  ledgerEntry: TransactionLedger;
}

// ── Servis ───────────────────────────────────────────────────────────────────

@Injectable()
export class PaymentService {
  constructor(
    private readonly prisma:  PrismaService,
    private readonly ledger:  LedgerService,
    @InjectQueue(QUEUE_NAMES.STOCK_DEDUCT)
    private readonly inventoryQueue: Queue,
    @Inject(PAYMENT_REPO) private readonly paymentRepo: IPaymentRepository,
  ) {}

  // ── takeDeposit ────────────────────────────────────────────────────────────

  /**
   * Randevu için kaparo alır.
   *
   * Tek $transaction içinde:
   *   1. Randevuyu doğrula (tenantId + isDeleted + açık durum kontrolü)
   *   2. Ledger'a DEPOSIT kaydı — Append-Only
   *   3. appointment.depositPaid kümülatif güncelleme
   *   4. AuditLog
   *
   * Kapalı randevulara (COMPLETED, CANCELLED, NO_SHOW) kaparo eklenemez.
   */
  async takeDeposit(
    tenantId:      string,
    appointmentId: string,
    dto:           TakeDepositDto,
    actorId?:      string,
  ): Promise<PaymentResult> {
    return this.prisma.$tenantTransaction(async () => {

      // ── 1. Randevuyu bul — findFirst + tenantId filtresi enjekte edilir ────
      const appt = await this.paymentRepo.findAppointmentById(appointmentId, tenantId);

      if (!appt || appt.isDeleted) {
        throw new NotFoundException('Randevu bulunamadı');
      }

      // ── 2. Kapalı randevuya kaparo eklenemez ──────────────────────────────
      const closedStatuses = new Set<AppointmentStatus>([
        AppointmentStatus.COMPLETED,
        AppointmentStatus.CANCELLED,
        AppointmentStatus.NO_SHOW,
      ]);
      if (closedStatuses.has(appt.status)) {
        throw new BadRequestException(
          `Kapalı randevuya kaparo eklenemez (durum: ${appt.status})`,
        );
      }

      // ── 3. Ledger'a DEPOSIT kaydı — Append-Only ──────────────────────────
      const ledgerEntry = await this.ledger.record(
        {
          tenantId,
          appointmentId,
          type:        TransactionType.DEPOSIT,
          amount:      dto.amount,
          description: `Kaparo alındı — Randevu: ${appointmentId}`,
          reference:   dto.reference,
        },
      );

      // ── 4. depositPaid kümülatif güncelleme ──────────────────────────────
      const prev     = appt.depositPaid ? Number(appt.depositPaid) : 0;
      const newTotal = new Money(prev + dto.amount);

      const updated = await this.paymentRepo.updateAppointmentDeposit(appointmentId, { depositPaid: newTotal });

      // ── 5. AuditLog ───────────────────────────────────────────────────────
      const _db = getActiveTxClient(this.prisma as unknown as Prisma.TransactionClient);
      await _db.auditLog.create({
        data: {
          tenantId,
          entityType: 'Appointment',
          entityId:   appointmentId,
          action:     'DEPOSIT_TAKEN',
          actorId:    actorId ?? null,
          before:     { depositPaid: appt.depositPaid?.toString() ?? '0' },
          after:      { depositPaid: newTotal.toString() },
        },
      });

      return { appointment: updated, ledgerEntry };
    });
  }

  // ── checkout ───────────────────────────────────────────────────────────────

  /**
   * Hesap kapatır: ödeme alır ve randevuyu COMPLETED'a geçirir.
   *
   * Tek $transaction içinde:
   *   1. Randevuyu doğrula
   *   2. XState: isValidTransition(currentStatus, COMPLETED)
   *   3. Ledger'a PAYMENT kaydı — Append-Only
   *   4. appointment.status = COMPLETED, totalPrice ayarlanır
   *   5. AuditLog
   *
   * $transaction sonrası (başarı garantisinde):
   *   6. Stok düşme kuyruğuna iş eklenir
   *
   * Idempotency: Controller katmanındaki @UseInterceptors(IdempotencyInterceptor)
   * ile X-Idempotency-Key header'ı kontrol edilir. Çift gönderi caché'den döner.
   */
  async checkout(
    tenantId:      string,
    appointmentId: string,
    dto:           CheckoutDto,
    actorId?:      string,
    actorRole?:    string,
  ): Promise<PaymentResult> {

    const result = await this.prisma.$tenantTransaction(async () => {

      // ── 1. Randevuyu bul — findFirst + tenantId filtresi enjekte edilir ────
      const appt = await this.paymentRepo.findAppointmentById(appointmentId, tenantId);

      if (!appt || appt.isDeleted) {
        throw new NotFoundException('Randevu bulunamadı');
      }

      // ── 2. XState geçiş doğrulaması: yalnızca IN_SERVICE → COMPLETED ────
      if (!isValidTransition(appt.status, AppointmentStatus.COMPLETED)) {
        throw new BadRequestException(
          `Hesap kapatma için randevu IN_SERVICE durumunda olmalı (mevcut: ${appt.status})`,
        );
      }

      // ── 3. Ledger'a ödeme kaydı — Append-Only, geri alınamaz ────────────
      //
      // Domain enforcement:
      //   Service line ALWAYS comes from backend (appointment → service relation).
      //   Frontend service items in lineItems are IGNORED — prevents price manipulation.
      //   Frontend extra items (type='extra') are accepted as-is (validated).
      //
      const depositPaidNum = appt.depositPaid ? Number(appt.depositPaid) : 0;

      let details: ReturnType<typeof buildAndValidateBreakdown> | undefined;
      if (dto.lineItems?.length) {
        // Filter: keep only extras from frontend, rebuild service from backend
        const extraItems = dto.lineItems.filter((li) => li.type === 'extra');

        // Backend-authoritative service line
        const servicePrice = appt.service
          ? Number(appt.service.price)
          : (appt.totalPrice ? Number(appt.totalPrice) : 0);
        const serviceName = appt.service?.name ?? 'Hizmet';

        const authorizedItems = [
          { type: 'service' as const, label: serviceName, amount: servicePrice },
          ...extraItems,
        ];

        details = buildAndValidateBreakdown(authorizedItems, dto.amount, depositPaidNum);
      }

      const ledgerEntry = await this.ledger.record(
        {
          tenantId,
          appointmentId,
          type:        dto.paymentMethod,
          amount:      dto.amount,
          description: dto.notes ?? `Hesap kapatma — Randevu: ${appointmentId}`,
          reference:   dto.reference,
          details:     details as Record<string, unknown> | undefined,
        },
      );

      // ── 4. Durum geçişi ──────────────────────────────────────────────────
      //
      // totalPrice semantiği:
      //   totalPrice = toplam hizmet tutarı (service.price, create sırasında set edilir).
      //   dto.amount = şu an tahsil edilen tutar (remaining = totalPrice - depositPaid).
      //   Checkout'ta totalPrice overwrite EDİLMEZ — mevcut hizmet tutarını korur.
      //
      //   Eğer totalPrice henüz set edilmemişse (null/0):
      //   → Geriye uyumluluk: dto.amount toplam tutar olarak yazılır.
      //   → Bu senaryo depozitosuz randevularda oluşabilir.
      //
      //   Ledger authoritative trace:
      //   DEPOSIT entries + PAYMENT entry = toplam hizmet değeri
      //   totalPrice ayrıca toplam hizmet tutarını tutar.
      //
      const existingTotal = appt.totalPrice ? Number(appt.totalPrice) : 0;
      const finalTotalPrice = existingTotal > 0
        ? new Money(existingTotal)          // totalPrice zaten set → koru
        : new Money(dto.amount);            // totalPrice null/0 → dto.amount ile doldur

      const updated = await this.paymentRepo.checkoutAppointment(appointmentId, {
        status:     AppointmentStatus.COMPLETED,
        totalPrice: finalTotalPrice,
      });

      // ── 5. AuditLog ───────────────────────────────────────────────────────
      const _db = getActiveTxClient(this.prisma as unknown as Prisma.TransactionClient);
      await _db.auditLog.create({
        data: {
          tenantId,
          entityType: 'Appointment',
          entityId:   appointmentId,
          action:     AppointmentStatus.COMPLETED,
          actorId:    actorId  ?? null,
          actorRole:  actorRole ?? null,
          before:     { status: appt.status, totalPrice: appt.totalPrice?.toString() },
          after:      { status: AppointmentStatus.COMPLETED, totalPrice: finalTotalPrice.toString(), collectedNow: dto.amount },
        },
      });

      return { appointment: updated, ledgerEntry };
    });

    // ── 6. $transaction dışı: stok düşme kuyruğu ─────────────────────────────
    // Transaction başarıyla tamamlandıktan sonra kuyruğa eklenir.
    await this.inventoryQueue.add('deduct-stock', {
      appointmentId,
      tenantId,
      serviceId: result.appointment.serviceId,
    });

    return result;
  }
}
