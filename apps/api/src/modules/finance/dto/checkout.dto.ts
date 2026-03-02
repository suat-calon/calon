import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { TransactionType }                  from '@prisma/client';
import {
  IsEnum,
  IsNumber,
  IsOptional,
  IsString,
  MaxLength,
  Min,
} from 'class-validator';

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

/**
 * HESAP KAPATMA DTO
 * ─────────────────────────────────────────────────────────────────────────────
 * Randevuyu tamamlar (IN_SERVICE → COMPLETED).
 * Ledger'a PAYMENT_CASH | PAYMENT_CARD | PAYMENT_ONLINE olarak kaydedilir.
 * Atomik işlem: ödeme kaydı + durum geçişi tek $transaction içinde.
 * ─────────────────────────────────────────────────────────────────────────────
 */
export class CheckoutDto {
  @ApiProperty({
    example:     500.00,
    minimum:     0,
    description: 'Tahsil edilen toplam tutar (TRY cinsinden)',
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
    description: 'Ödemeye dair ek not (opsiyonel)',
  })
  @IsString()
  @MaxLength(500)
  @IsOptional()
  notes?: string;
}
