/**
 * PAYMENT CONTROLLER
 * ─────────────────────────────────────────────────────────────────────────────
 * Güvenlik:
 *   • Tüm endpoint'ler TenantGuard ile korunur — @Public() YOK
 *   • tenantId SADECE @CurrentTenant()'dan (doğrulanmış JWT), body'den ASLA
 *   • POST endpoint'leri @UseInterceptors(IdempotencyInterceptor) ile
 *     X-Idempotency-Key header'ı kontrol eder → çift çekim riski sıfır
 *
 * Rotalar:
 *   POST /payments/:appointmentId/deposit   — Kaparo al
 *   POST /payments/:appointmentId/checkout  — Hesap kapat (→ COMPLETED)
 *   GET  /payments/ledger                   — Tenant ledger hareketleri
 *   GET  /payments/ledger/:appointmentId    — Randevu ledger detayı
 * ─────────────────────────────────────────────────────────────────────────────
 */

import {
  Controller,
  Post,
  Get,
  Param,
  Body,
  Query,
  HttpCode,
  HttpStatus,
  ParseUUIDPipe,
  ParseIntPipe,
  DefaultValuePipe,
  UseInterceptors,
} from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import {
  ApiTags,
  ApiBearerAuth,
  ApiOperation,
  ApiCreatedResponse,
  ApiOkResponse,
  ApiBadRequestResponse,
  ApiNotFoundResponse,
  ApiHeader,
} from '@nestjs/swagger';

import { PaymentService }          from './payment.service';
import { LedgerService }           from './ledger.service';
import { ReconciliationService }   from './reconciliation.service';
import { TakeDepositDto }          from './dto/take-deposit.dto';
import { CheckoutDto }             from './dto/checkout.dto';
import { IdempotencyInterceptor }  from '../../common/idempotency.interceptor';
import { CurrentTenant }           from '../../common/decorators/current-tenant.decorator';
import { CurrentUser, CurrentUserPayload } from '../../common/decorators/current-user.decorator';
import { WriteOperation }          from '../billing/decorators/write-operation.decorator';

@ApiTags('Finance — Payments & Ledger')
@ApiBearerAuth()
@Controller('payments')
export class PaymentController {
  constructor(
    private readonly paymentService:       PaymentService,
    private readonly ledgerService:        LedgerService,
    private readonly reconciliationService: ReconciliationService,
  ) {}

  // ── POST /payments/:appointmentId/deposit ──────────────────────────────────

  @Post(':appointmentId/deposit')
  @WriteOperation()
  @HttpCode(HttpStatus.CREATED)
  @UseInterceptors(IdempotencyInterceptor)
  @Throttle({ default: { limit: 20, ttl: 60_000 } })
  @ApiOperation({ summary: 'Randevu için kaparo al' })
  @ApiHeader({
    name:        'X-Idempotency-Key',
    description: 'Çift çekim koruması için benzersiz işlem anahtarı (UUID önerilir)',
    required:    false,
  })
  @ApiCreatedResponse({ description: 'Kaparo Ledger\'e işlendi, appointment.depositPaid güncellendi' })
  @ApiBadRequestResponse({ description: 'Kapalı randevuya (COMPLETED/CANCELLED/NO_SHOW) kaparo eklenemez' })
  @ApiNotFoundResponse({ description: 'Randevu bulunamadı veya bu tenant\'a ait değil' })
  takeDeposit(
    @CurrentTenant()                               tenantId: string,
    @CurrentUser()                                 user:     CurrentUserPayload,
    @Param('appointmentId', ParseUUIDPipe)          apptId:   string,
    @Body()                                        dto:      TakeDepositDto,
  ) {
    return this.paymentService.takeDeposit(tenantId, apptId, dto, user.id);
  }

  // ── POST /payments/:appointmentId/checkout ────────────────────────────────

  @Post(':appointmentId/checkout')
  @WriteOperation()
  @HttpCode(HttpStatus.CREATED)
  @UseInterceptors(IdempotencyInterceptor)
  @Throttle({ default: { limit: 20, ttl: 60_000 } })
  @ApiOperation({ summary: 'Hesap kapat: ödeme al + randevuyu COMPLETED\'a geçir' })
  @ApiHeader({
    name:        'X-Idempotency-Key',
    description: 'Çift çekim koruması için benzersiz işlem anahtarı (UUID önerilir)',
    required:    false,
  })
  @ApiCreatedResponse({ description: 'Ödeme Ledger\'e işlendi, randevu COMPLETED\'a geçti' })
  @ApiBadRequestResponse({ description: 'Randevu IN_SERVICE durumunda değil (XState ihlali)' })
  @ApiNotFoundResponse({ description: 'Randevu bulunamadı veya bu tenant\'a ait değil' })
  checkout(
    @CurrentTenant()                               tenantId: string,
    @CurrentUser()                                 user:     CurrentUserPayload,
    @Param('appointmentId', ParseUUIDPipe)          apptId:   string,
    @Body()                                        dto:      CheckoutDto,
  ) {
    return this.paymentService.checkout(tenantId, apptId, dto, user.id, user.role);
  }

  // ── GET /payments/ledger ───────────────────────────────────────────────────

  @Get('ledger')
  @ApiOperation({ summary: 'Tenant tüm ledger hareketlerini getir (sayfalı)' })
  @ApiOkResponse({ description: 'TransactionLedger kayıtları, işlem tarihine göre azalan sıra' })
  getLedger(
    @CurrentTenant()                                      tenantId: string,
    @Query('take', new DefaultValuePipe(100), ParseIntPipe) take:   number,
    @Query('skip', new DefaultValuePipe(0),   ParseIntPipe) skip:   number,
  ) {
    return this.ledgerService.findByTenant(tenantId, take, skip);
  }

  // ── GET /payments/ledger/:appointmentId ───────────────────────────────────

  @Get('ledger/:appointmentId')
  @ApiOperation({ summary: 'Randevuya ait tüm ledger hareketlerini getir' })
  @ApiOkResponse({ description: 'TransactionLedger kayıtları, kronolojik sıra' })
  @ApiNotFoundResponse({ description: 'Bu randevuya ait ledger kaydı yok' })
  getAppointmentLedger(
    @CurrentTenant()                               tenantId:      string,
    @Param('appointmentId', ParseUUIDPipe)          appointmentId: string,
  ) {
    return this.ledgerService.findByAppointment(tenantId, appointmentId);
  }

  // ── GET /payments/reconciliation ───────────────────────────────────────
  // CHECKOUT-LEDGER-03: Finance truth read model.

  @Get('reconciliation')
  @ApiOperation({ summary: 'Finance reconciliation — mismatch detection (read-only, no auto-repair)' })
  @ApiOkResponse({ description: 'Reconciliation summary with mismatch list, priority, and suggested actions' })
  getReconciliation(
    @CurrentTenant() tenantId: string,
  ) {
    return this.reconciliationService.reconcile(tenantId);
  }

  // ── POST /payments/:appointmentId/refund ─────────────────────────────────
  // CHECKOUT-LEDGER-02: Refund workflow endpoint.

  @Post(':appointmentId/refund')
  @WriteOperation()
  @HttpCode(HttpStatus.CREATED)
  @UseInterceptors(IdempotencyInterceptor)
  @Throttle({ default: { limit: 10, ttl: 60_000 } })
  @ApiOperation({ summary: 'Randevu için iade yap (REFUND ledger entry)' })
  @ApiHeader({
    name:        'X-Idempotency-Key',
    description: 'Çift iade koruması için benzersiz işlem anahtarı (UUID önerilir)',
    required:    false,
  })
  @ApiCreatedResponse({ description: 'İade Ledger\'e işlendi (negatif tutar, append-only)' })
  @ApiBadRequestResponse({ description: 'Randevu COMPLETED değil veya iade tutarı geçersiz' })
  @ApiNotFoundResponse({ description: 'Randevu bulunamadı' })
  refund(
    @CurrentTenant()                               tenantId: string,
    @CurrentUser()                                 user:     CurrentUserPayload,
    @Param('appointmentId', ParseUUIDPipe)          apptId:   string,
    @Body()                                        dto:      { amount: number; reason: string },
  ) {
    return this.paymentService.refund(tenantId, apptId, dto, user.id);
  }
}
