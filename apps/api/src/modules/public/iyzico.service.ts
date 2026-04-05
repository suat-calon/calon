/**
 * IYZICO SERVICE — Faz 19
 * ──────────────────────────────────────────────────────────────────────────────
 * İyzico ödeme geçidi ile entegrasyon (iyzipay npm SDK).
 *
 * Akış:
 *   1. initializeCheckoutForm() → İyzico checkout URL'i (3DS destekli)
 *   2. verifyWebhookSignature() → Webhook imza doğrulama (HMAC-SHA256)
 *
 * Güvenlik:
 *   - Amount her zaman server-side DB'den alınır; client body'si kabul edilmez
 *   - providerId (iyzico paymentId) DB seviyesinde UNIQUE → çift işlem imkânsız
 *
 * Dokümantasyon: https://dev.iyzipay.com/
 * ──────────────────────────────────────────────────────────────────────────────
 */

import { Injectable, Logger, InternalServerErrorException } from '@nestjs/common';
import { ConfigService }                                     from '@nestjs/config';
import { createHmac }                                        from 'crypto';
// eslint-disable-next-line @typescript-eslint/no-require-imports
const Iyzipay = require('iyzipay');

// ── İyzico SDK tipleri ────────────────────────────────────────────────────────

export interface IyzicoCheckoutRequest {
  locale:           string;
  conversationId:   string;
  price:            string;
  paidPrice:        string;
  currency:         string;
  basketId:         string;
  paymentGroup:     string;
  callbackUrl:      string;
  buyer: {
    id:             string;
    name:           string;
    surname:        string;
    email:          string;
    gsmNumber?:     string;
    registrationAddress: string;
    city:           string;
    country:        string;
    ip:             string;
    identityNumber: string;
  };
  shippingAddress: {
    contactName:    string;
    city:           string;
    country:        string;
    address:        string;
  };
  billingAddress: {
    contactName:    string;
    city:           string;
    country:        string;
    address:        string;
  };
  basketItems: Array<{
    id:         string;
    name:       string;
    category1:  string;
    itemType:   string;
    price:      string;
  }>;
}

export interface IyzicoCheckoutResponse {
  status:              string;
  errorCode?:          string;
  errorMessage?:       string;
  conversationId:      string;
  token?:              string;
  checkoutFormContent?: string;
  paymentPageUrl?:     string;
}

export interface IyzicoRefundResponse {
  status:           string;      // 'success' | 'failure'
  errorCode?:       string;
  errorMessage?:    string;
  conversationId?:  string;
  paymentId?:       string;
  paymentTransactionId?: string;
  price?:           number;
  currency?:        string;
}

export interface IyzicoPaymentRetrieveResponse {
  status:           string;
  errorCode?:       string;
  errorMessage?:    string;
  paymentId?:       string;
  price?:           number;
  paidPrice?:       number;
  currency?:        string;
  itemTransactions?: Array<{
    paymentTransactionId: string;
    transactionStatus:    number;
    price:                number;
    paidPrice:            number;
  }>;
}

// ── Servis ────────────────────────────────────────────────────────────────────

@Injectable()
export class IyzicoService {
  private readonly logger = new Logger(IyzicoService.name);
  private readonly iyzipay: typeof Iyzipay;
  private readonly secretKey:   string;
  private readonly callbackUrl: string;

  constructor(private readonly config: ConfigService) {
    const apiKey      = config.get<string>('IYZICO_API_KEY', '');
    this.secretKey    = config.get<string>('IYZICO_SECRET_KEY', '');
    const baseUrl     = config.get<string>('IYZICO_BASE_URL', 'https://sandbox-api.iyzipay.com');
    this.callbackUrl  = config.get<string>('IYZICO_CALLBACK_URL', '');

    this.iyzipay = new Iyzipay({
      apiKey,
      secretKey: this.secretKey,
      uri: baseUrl,
    });
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // CHECKOUT FORM BAŞLATMA (Hosted Payment Page)
  // ═══════════════════════════════════════════════════════════════════════════

  initializeCheckoutForm(req: IyzicoCheckoutRequest): Promise<IyzicoCheckoutResponse> {
    this.logger.debug(
      `İyzico checkout başlatılıyor: conversationId=${req.conversationId} amount=${req.price}`,
    );

    return new Promise<IyzicoCheckoutResponse>((resolve, reject) => {
      this.iyzipay.checkoutFormInitialize.create(req, (err: Error | null, result: IyzicoCheckoutResponse) => {
        if (err) {
          this.logger.error(`İyzico SDK hatası: ${String(err)}`);
          return reject(new InternalServerErrorException('Ödeme geçidi ile bağlantı kurulamadı.'));
        }

        this.logger.debug(`İyzico yanıtı: ${JSON.stringify(result)}`);

        if (result.status !== 'success' || !result.paymentPageUrl) {
          this.logger.warn(
            `İyzico checkout başarısız: ${result.errorCode} — ${result.errorMessage}`,
          );
          return reject(new InternalServerErrorException(
            result.errorMessage ?? 'Ödeme başlatılamadı.',
          ));
        }

        this.logger.log(
          `İyzico checkout başarılı: token=${result.token} conversationId=${req.conversationId}`,
        );

        resolve(result);
      });
    });
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // WEBHOOK İMZA DOĞRULAMA (Faz 19 — C2)
  // İyzico webhook: HMAC-SHA256(iyziReferenceCode + secretKey)
  // ═══════════════════════════════════════════════════════════════════════════

  verifyWebhookSignature(
    iyziReferenceCode: string,
    receivedSignature: string,
  ): boolean {
    const computed = createHmac('sha256', this.secretKey)
      .update(iyziReferenceCode)
      .digest('base64');

    const valid = computed === receivedSignature;

    if (!valid) {
      this.logger.warn(
        `Webhook imza doğrulama BAŞARISIZ: referenceCode=${iyziReferenceCode}`,
      );
    }

    return valid;
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // REFUND (CHECKOUT-LEDGER-02.1)
  // ══════════���════════════════════════════════════════════════════════════════

  /**
   * Creates a refund via Iyzico refund API.
   *
   * Iyzico refund.create() requires paymentTransactionId (NOT paymentId).
   * For checkout form payments, paymentTransactionId is available in the
   * webhook response stored in Payment.providerMeta.
   *
   * @param paymentTransactionId — The Iyzico paymentTransactionId (from provider meta)
   * @param price — Refund amount as string (e.g., "150.00")
   * @param ip — Requester IP for Iyzico audit
   * @param conversationId — Our internal reference (e.g., appointmentId)
   */
  createRefund(request: {
    paymentTransactionId: string;
    price: string;
    ip: string;
    conversationId: string;
  }): Promise<IyzicoRefundResponse> {
    this.logger.log(
      `[Refund] İyzico refund başlatılıyor: txId=${request.paymentTransactionId} amount=${request.price}`,
    );

    return new Promise<IyzicoRefundResponse>((resolve, reject) => {
      this.iyzipay.refund.create(
        {
          locale: 'tr',
          conversationId: request.conversationId,
          paymentTransactionId: request.paymentTransactionId,
          price: request.price,
          ip: request.ip,
        },
        (err: Error | null, result: IyzicoRefundResponse) => {
          if (err) {
            this.logger.error(`[Refund] İyzico SDK hatası: ${String(err)}`);
            return reject(new InternalServerErrorException('Ödeme geçidi ile iade bağlantısı kurulamadı.'));
          }

          this.logger.log(`[Refund] İyzico yanıtı: status=${result.status} paymentId=${result.paymentId ?? 'n/a'}`);

          resolve(result);
        },
      );
    });
  }

  /**
   * Retrieves payment details from Iyzico.
   * Useful for getting paymentTransactionId from a paymentId.
   */
  retrievePayment(request: {
    paymentId: string;
    conversationId: string;
  }): Promise<IyzicoPaymentRetrieveResponse> {
    return new Promise<IyzicoPaymentRetrieveResponse>((resolve, reject) => {
      this.iyzipay.payment.retrieve(
        {
          locale: 'tr',
          conversationId: request.conversationId,
          paymentId: request.paymentId,
        },
        (err: Error | null, result: IyzicoPaymentRetrieveResponse) => {
          if (err) {
            this.logger.error(`[Retrieve] İyzico SDK hatası: ${String(err)}`);
            return reject(new InternalServerErrorException('Ödeme geçidi ile bağlantı kurulamadı.'));
          }
          resolve(result);
        },
      );
    });
  }

  /** CallbackUrl accessor (PaymentService'den erişim için) */
  getCallbackUrl(): string {
    return this.callbackUrl;
  }

  /**
   * Raw body HMAC-SHA256 doğrulama (x-iyz-signature header ile karşılaştırma).
   * İyzico'nun yeni webhook imzalama yöntemi; eski referenceCode HMAC yerine tercih edilmeli.
   */
  verifyBodySignature(rawBody: Buffer | string, receivedSignature: string): boolean {
    const computed = createHmac('sha256', this.secretKey)
      .update(rawBody)
      .digest('base64');
    const valid = computed === receivedSignature;
    if (!valid) {
      this.logger.warn('Raw body imza doğrulama BAŞARISIZ');
    }
    return valid;
  }
}
