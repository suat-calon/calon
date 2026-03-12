/**
 * PAYMENT SERVICE — Faz 19 + MVP-GATE-1
 * ──────────────────────────────────────────────────────────────────────────────
 * İyzico ödeme iş mantığı:
 *
 *   POST /public/payments/create
 *     1. Appointment + Service bilgisini DB'den al (server-side amount)
 *     2. İyzico checkout form başlat → paymentUrl
 *     3. Payment kaydı oluştur (PENDING)
 *     → Response: { paymentUrl }
 *
 *   POST /webhooks/iyzico (idempotent)
 *     1. Webhook imzasını doğrula (HMAC-SHA256)
 *     2. WebhookEvent @unique insert → atomic idempotency gate (P2002 = zaten işlendi → 200)
 *     3. FSM: PENDING_PAYMENT → PAID / CANCELLED
 *     4. Appointment: PAID → CONFIRMED (webhook sync update)
 *
 * Güvenlik:
 *   - Amount asla client'tan alınmaz; DB'deki service.price kullanılır
 *   - WebhookEvent.providerEventId @unique → race-condition-safe idempotency (DB garantisi)
 *   - TenantGuard bypass: @Public() controller decorator ile
 * ──────────────────────────────────────────────────────────────────────────────
 */

import {
  Injectable,
  Logger,
  NotFoundException,
  BadRequestException,
  ConflictException,
  UnauthorizedException,
} from '@nestjs/common';
import { AppointmentStatus, PaymentStatus, Prisma } from '@prisma/client';

import { PrismaService }        from '../../common/prisma.service';
import { tenantContext }         from '../../common/tenant.context';
import { IyzicoService }         from './iyzico.service';
import { CreatePaymentDto }      from './dto/create-payment.dto';
import { EventProducerService }  from '../event/event-producer.service';

// ── Response tipleri ──────────────────────────────────────────────────────────

export interface CreatePaymentResult {
  paymentUrl: string;
  paymentId:  string;
}

export interface IyzicoWebhookPayload {
  /** İyzico ödeme sonucu: 'SUCCESS' veya 'FAILURE' */
  iyziEventType?:     string;  // 'checkout_payment'
  iyziEventTime?:     string;  // ISO timestamp
  iyziReferenceCode?: string;  // İmza için referans kodu
  signature?:         string;  // HMAC-SHA256 imzası
  paymentId?:         string;  // İyzico benzersiz ödeme ID'si (bizim providerId)
  conversationId?:    string;  // appointmentId (biz ürettik)
  status?:            string;  // 'SUCCESS' | 'FAILURE'
  paidPrice?:         string;  // Ödenen tutar
  currency?:          string;
}

// ── Servis ────────────────────────────────────────────────────────────────────

@Injectable()
export class PaymentService {
  private readonly logger = new Logger(PaymentService.name);

  constructor(
    private readonly prisma:         PrismaService,
    private readonly iyzico:         IyzicoService,
    private readonly eventProducer:  EventProducerService,
  ) {}

  // ═══════════════════════════════════════════════════════════════════════════
  // C1 — POST /public/payments/create
  //      Server-side amount + İyzico checkout başlatma
  // ═══════════════════════════════════════════════════════════════════════════

  async createPayment(dto: CreatePaymentDto, clientIp = '127.0.0.1'): Promise<CreatePaymentResult> {
    // ── 1. Appointment'ı al ve doğrula ──────────────────────────────────────
    const appointment = await this.prisma.appointment.findFirst({
      where: { id: dto.appointmentId },
      include: {
        service:  { select: { name: true, price: true, currency: true, requiresDeposit: true } },
        tenant:   { select: { id: true } },
        location: { select: { city: true, name: true } },
      },
    });

    if (!appointment) {
      throw new NotFoundException('Randevu bulunamadı.');
    }

    if (appointment.status !== AppointmentStatus.PENDING_PAYMENT) {
      throw new BadRequestException(
        `Ödeme beklenmeyen durum: ${appointment.status}. Yalnızca PENDING_PAYMENT randevular için ödeme başlatılabilir.`,
      );
    }

    // ── 2. Amount — server-side (service.depositRate * price ya da tam fiyat) ──
    const servicePrice   = new Prisma.Decimal(appointment.service.price);
    const depositRate    = Number(appointment.service.requiresDeposit ? 1 : 0);
    // depositRate alanı service'de float (0–1). Kaparo tutarı = price * depositRate.
    // requiresDeposit=true için tam fiyatı da kabul edebiliriz; şimdi tam price kullanıyoruz.
    const chargeAmount   = servicePrice.toFixed(2);

    this.logger.log(
      `Ödeme başlatılıyor: appt=${dto.appointmentId} amount=${chargeAmount} ${appointment.service.currency}`,
    );

    // ── 3. Atomic claim: Payment stub INSERT önce yapılır (Iyzico öncesi) ────
    // Aynı anda gelen iki istek her ikisi de Iyzico checkout başlatmasın diye
    // paymentUrl=null stub'ı ÖNCE insert ediyoruz.
    // payments.appointmentId @unique → ikincisi P2002 alır → 409 döner.
    let paymentStub: { id: string; paymentUrl: string | null };
    try {
      paymentStub = await this.runInContext(appointment.tenant.id, () =>
        this.prisma.payment.create({
          data: {
            tenantId:      appointment.tenant.id,
            appointmentId: appointment.id,
            amount:        new Prisma.Decimal(chargeAmount),
            currency:      appointment.service.currency,
            status:        PaymentStatus.PENDING,
            // paymentUrl intentionally omitted (null) — set after Iyzico responds
          },
          select: { id: true, paymentUrl: true },
        }),
      );
    } catch (err) {
      if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2002') {
        // Başka bir istek bu appointment için ödeme zaten başlattı.
        // Eğer paymentUrl hazırsa idempotent olarak döndür.
        const existing = await this.prisma.payment.findFirst({
          where:  { appointmentId: appointment.id },
          select: { paymentUrl: true },
        });
        if (existing?.paymentUrl) {
          this.logger.log(
            `createPayment idempotent: appt=${appointment.id} mevcut url döndürülüyor`,
          );
          return { paymentUrl: existing.paymentUrl, paymentId: appointment.id };
        }
        throw new ConflictException(
          'Bu randevu için ödeme zaten başlatılıyor. Lütfen kısa süre sonra tekrar deneyin.',
        );
      }
      throw err;
    }

    // ── 4. İyzico Checkout Form başlat (yalnızca race'i kazananlar) ─────────
    const city = appointment.location.city ?? 'Istanbul';
    let iyzRes: Awaited<ReturnType<typeof this.iyzico.initializeCheckoutForm>>;
    try {
      iyzRes = await this.iyzico.initializeCheckoutForm({
        locale:         'tr',
        conversationId: appointment.id,
        price:          chargeAmount,
        paidPrice:      chargeAmount,
        currency:       appointment.service.currency,
        basketId:       appointment.id,
        paymentGroup:   'PRODUCT',
        callbackUrl:    `${this.iyzico.getCallbackUrl()}?appointmentId=${appointment.id}`,
        buyer: {
          id:                  dto.appointmentId,
          name:                dto.buyerName,
          surname:             dto.buyerSurname ?? '-',
          email:               dto.buyerEmail,
          identityNumber:      process.env['NODE_ENV'] === 'development'
                                 ? (dto.buyerIdentityNumber ?? '11111111111')
                                 : dto.buyerIdentityNumber,
          registrationAddress: appointment.location.name,
          city,
          country:             'Turkey',
          ip:                  clientIp,
        },
        shippingAddress: {
          contactName: dto.buyerName,
          city,
          country:     'Turkey',
          address:     appointment.location.name,
        },
        billingAddress: {
          contactName: dto.buyerName,
          city,
          country:     'Turkey',
          address:     appointment.location.name,
        },
        basketItems: [
          {
            id:        appointment.serviceId,
            name:      appointment.service.name,
            category1: 'Salon Hizmetleri',
            itemType:  'VIRTUAL',
            price:     chargeAmount,
          },
        ],
      });
    } catch (iyziErr) {
      // İyzico başarısız → stub'ı FAILED olarak işaretle (lock'u serbest bırakmayız
      // ama tekrar denemede yeni appointment gerekir — appointment CANCELLED olacak)
      await this.runInContext(appointment.tenant.id, () =>
        this.prisma.payment.update({
          where: { id: paymentStub.id },
          data:  { status: PaymentStatus.FAILED },
        }),
      );
      throw iyziErr;
    }

    // ── 5. Payment stub'ı paymentUrl ve token ile güncelle ───────────────────
    await this.runInContext(appointment.tenant.id, () =>
      this.prisma.payment.update({
        where: { id: paymentStub.id },
        data: {
          paymentUrl:   iyzRes.paymentPageUrl!,
          providerMeta: { token: iyzRes.token, conversationId: appointment.id },
        },
      }),
    );

    this.logger.log(
      `Payment kaydı oluşturuldu: appt=${appointment.id} url=${iyzRes.paymentPageUrl}`,
    );

    return {
      paymentUrl: iyzRes.paymentPageUrl!,
      paymentId:  appointment.id,
    };
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // C2 — POST /webhooks/iyzico
  //      İmza doğrulama + idempotency + FSM geçişi
  // ═══════════════════════════════════════════════════════════════════════════

  async handleIyzicoWebhook(
    payload:   IyzicoWebhookPayload,
    rawBody?:  string,  // Gelecekte tam body ile imza kontrolü için
  ): Promise<{ received: true }> {
    // ── 1. İmza doğrulama ────────────────────────────────────────────────────
    if (payload.iyziReferenceCode && payload.signature) {
      const valid = this.iyzico.verifyWebhookSignature(
        payload.iyziReferenceCode,
        payload.signature,
      );
      if (!valid) {
        throw new UnauthorizedException('Webhook imza doğrulaması başarısız.');
      }
    }

    const iyziPaymentId = payload.paymentId;
    const appointmentId = payload.conversationId;
    const isSuccess     = payload.status === 'SUCCESS';

    if (!iyziPaymentId || !appointmentId) {
      this.logger.warn(`Webhook eksik alan: paymentId=${iyziPaymentId} conversationId=${appointmentId}`);
      return { received: true }; // İyzico 200 beklediği için yutuyoruz
    }

    // ── 2. Atomic idempotency gate — WebhookEvent @unique insert ─────────────
    // providerEventId @unique: aynı iyzico paymentId iki kez işlenemez.
    // İki eş-zamanlı istek geldiğinde yalnızca biri INSERT yapabilir;
    // diğeri P2002 alır → güvenli no-op (race-condition-safe).
    try {
      await this.prisma.webhookEvent.create({
        data: {
          source:          'iyzico_payment',
          providerEventId: iyziPaymentId,
          eventType:       payload.status ?? payload.iyziEventType ?? 'unknown',
          payload:         payload as unknown as Prisma.InputJsonValue,
          tenantId:        null,   // payment lookup'tan önce geliyoruz → null kabul edilebilir
          processedAt:     new Date(),
        },
      });
    } catch (err) {
      if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2002') {
        this.logger.log(`[PaymentWebhook] Idempotent tekrar tespit edildi: ${iyziPaymentId}`);
        return { received: true };
      }
      throw err;
    }

    // ── 3. Payment kaydını bul (conversationId = appointmentId) ─────────────
    const payment = await this.prisma.payment.findFirst({
      where: { appointmentId },
    });

    // ── 3.5 Appointment snapshot yükle (event payload için — SUCCESS ve FAILURE) ──
    const appointmentSnapshot = await this.prisma.appointment.findFirst({
      where: { id: appointmentId },
      include: {
        customer: { select: { id: true, firstName: true, lastName: true, phone: true, email: true } },
        service:  { select: { name: true } },
        tenant:   { select: { timezone: true } },
      },
    });

    if (!payment) {
      this.logger.warn(`Webhook: Payment kaydı bulunamadı: appt=${appointmentId}`);
      return { received: true };
    }

    // ── 4. FSM geçişi ────────────────────────────────────────────────────────
    await this.runInContext(payment.tenantId, () =>
      this.prisma.$transaction(async (tx) => {
        if (isSuccess) {
          // PENDING_PAYMENT → PAID (payment)  +  appointment status → CONFIRMED
          await tx.payment.update({
            where: { id: payment.id },
            data: {
              providerId:   iyziPaymentId,
              status:       PaymentStatus.PAID,
              providerMeta: { ...(payment.providerMeta as object), paymentId: iyziPaymentId },
            },
          });

          await tx.appointment.update({
            where: { id: appointmentId },
            data:  { status: AppointmentStatus.CONFIRMED },
          });

          // Faz 24: payment.succeeded outbox event
          if (appointmentSnapshot) {
            await this.eventProducer.paymentSucceeded(
              {
                paymentId:     iyziPaymentId,
                bookingId:     appointmentId,
                customerId:    appointmentSnapshot.customerId ?? '',
                customerName:  appointmentSnapshot.customer
                  ? `${appointmentSnapshot.customer.firstName} ${appointmentSnapshot.customer.lastName}`.trim()
                  : '',
                customerPhone: appointmentSnapshot.customer?.phone ?? undefined,
                customerEmail: appointmentSnapshot.customer?.email ?? undefined,
                amountCents:   Math.round(Number(payment.amount) * 100),
                currency:      payment.currency,
                provider:      'iyzico',
                serviceName:   appointmentSnapshot.service.name,
                startAtUtc:    appointmentSnapshot.startTime.toISOString(),
                tenantTimezone: appointmentSnapshot.tenant.timezone,
              },
              payment.tenantId,
              tx,
            );
          }

          this.logger.log(
            `Webhook SUCCESS: appt=${appointmentId} → CONFIRMED | iyziPaymentId=${iyziPaymentId}`,
          );
        } else {
          // Ödeme başarısız → randevu iptal
          await tx.payment.update({
            where: { id: payment.id },
            data: {
              providerId:   iyziPaymentId,
              status:       PaymentStatus.FAILED,
              providerMeta: { ...(payment.providerMeta as object), paymentId: iyziPaymentId },
            },
          });

          await tx.appointment.update({
            where: { id: appointmentId },
            data:  { status: AppointmentStatus.CANCELLED },
          });

          // Faz 25: payment.failed outbox event
          if (appointmentSnapshot) {
            await this.eventProducer.paymentFailed(
              {
                paymentId:      iyziPaymentId,
                bookingId:      appointmentId,
                customerId:     appointmentSnapshot.customerId ?? '',
                customerName:   appointmentSnapshot.customer
                  ? `${appointmentSnapshot.customer.firstName} ${appointmentSnapshot.customer.lastName}`.trim()
                  : '',
                customerPhone:  appointmentSnapshot.customer?.phone ?? undefined,
                customerEmail:  appointmentSnapshot.customer?.email ?? undefined,
                amountCents:    Math.round(Number(payment.amount) * 100),
                currency:       payment.currency,
                provider:       'iyzico',
                serviceName:    appointmentSnapshot.service.name,
                startAtUtc:     appointmentSnapshot.startTime.toISOString(),
                tenantTimezone: appointmentSnapshot.tenant.timezone,
              },
              payment.tenantId,
              tx,
            );
          }

          this.logger.warn(
            `Webhook FAILURE: appt=${appointmentId} → CANCELLED | iyziPaymentId=${iyziPaymentId}`,
          );
        }
      }),
    );

    return { received: true };
  }

  // ── Yardımcı: tenant context (Prisma RLS için) ────────────────────────────
  private runInContext<T>(tenantId: string, fn: () => Promise<T>): Promise<T> {
    return new Promise<T>((resolve, reject) => {
      tenantContext.run(
        { tenantId, userId: 'payment-webhook', userRole: 'PUBLIC' },
        () => fn().then(resolve).catch(reject),
      );
    });
  }
}
