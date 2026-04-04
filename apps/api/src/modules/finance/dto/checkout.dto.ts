import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { TransactionType }                  from '@prisma/client';
import {
  IsArray,
  IsEnum,
  IsIn,
  IsNotEmpty,
  IsNumber,
  IsOptional,
  IsString,
  MaxLength,
  Min,
  ValidateNested,
} from 'class-validator';
import { Type } from 'class-transformer';

/**
 * Hesap kapama işleminde kabul edilen ödeme yöntemleri.
 * DEPOSIT, REFUND, COMMISSION_PAYOUT, ADJUSTMENT bu endpoint için geçersizdir.
 */
const CHECKOUT_PAYMENT_TYPES = [
  TransactionType.PAYMENT_CASH,
  TransactionType.PAYMENT_CARD,
  TransactionType.PAYMENT_ONLINE,
] as const;

export type CheckoutPaymentType = typeof CHECKOUT_PAYMENT_TYPES[number];

/** Checkout kalem türleri — serbest string YASAK */
const LINE_ITEM_TYPES = ['service', 'extra'] as const;
export type CheckoutLineItemType = typeof LINE_ITEM_TYPES[number];

/**
 * HESAP KAPATMA DTO
 * ─────────────────────────────────────────────────────────────────────────────
 * Randevuyu tamamlar (IN_SERVICE → COMPLETED).
 * Ledger'a PAYMENT_CASH | PAYMENT_CARD | PAYMENT_ONLINE olarak kaydedilir.
 * Atomik işlem: ödeme kaydı + durum geçişi tek $transaction içinde.
 *
 * lineItems opsiyonel: varsa ledger.details JSONB olarak structured breakdown
 * saklanır. Yoksa yalnız flat amount saklanır (geriye uyumlu).
 *
 * Authoritative truth: amount (flat tahsilat tutarı).
 * details.collectedNow = amount ile eşleşmeli; eşleşmezse BadRequest.
 * ─────────────────────────────────────────────────────────────────────────────
 */
export class CheckoutDto {
  @ApiProperty({
    example:     500.00,
    minimum:     0,
    description: 'Tahsil edilen toplam tutar (TRY cinsinden) — authoritative financial truth',
  })
  @IsNumber({ allowNaN: false, allowInfinity: false })
  @Min(0)
  amount!: number;

  @ApiProperty({
    enum:        CHECKOUT_PAYMENT_TYPES,
    example:     TransactionType.PAYMENT_CARD,
    description: 'Ödeme yöntemi',
  })
  @IsEnum(CHECKOUT_PAYMENT_TYPES)
  paymentMethod!: CheckoutPaymentType;

  @ApiPropertyOptional({
    example:     'POS-TXN-20260302-002',
    maxLength:   255,
    description: 'Ödeme terminali referans no (opsiyonel)',
  })
  @IsString()
  @MaxLength(255)
  @IsOptional()
  reference?: string;

  @ApiPropertyOptional({
    example:     'Paket hizmet indirimi uygulandı',
    maxLength:   500,
    description: 'Ödemeye dair ek not — human-readable secondary trace',
  })
  @IsString()
  @MaxLength(500)
  @IsOptional()
  notes?: string;

  /**
   * Structured checkout breakdown — hizmet + ek kalem detayları.
   * Ledger'a details JSONB olarak kaydedilir.
   * Opsiyonel: yoksa yalnız flat amount saklanır (geriye uyumlu).
   *
   * Backend semantic validation:
   *   sum(items.amount) = grossTotal
   *   grossTotal - depositPaid ≈ collectedNow = dto.amount
   */
  @ApiPropertyOptional({
    description: 'Ödeme kalemleri (hizmet + extras)',
    type: 'array',
  })
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => CheckoutLineItemDto)
  @IsOptional()
  lineItems?: CheckoutLineItemDto[];
}

/** Tek checkout kalemi — type: 'service' | 'extra' (serbest string YASAK) */
export class CheckoutLineItemDto {
  @ApiProperty({ enum: LINE_ITEM_TYPES, example: 'service' })
  @IsIn(LINE_ITEM_TYPES, { message: 'type must be one of: service, extra' })
  type!: CheckoutLineItemType;

  @ApiProperty({ example: 'Saç Kesimi', description: 'Kalem adı' })
  @IsString()
  @IsNotEmpty({ message: 'label must not be empty' })
  @MaxLength(200)
  label!: string;

  @ApiProperty({ example: 200.00, minimum: 0 })
  @IsNumber({ allowNaN: false, allowInfinity: false })
  @Min(0, { message: 'amount must be >= 0' })
  amount!: number;
}
