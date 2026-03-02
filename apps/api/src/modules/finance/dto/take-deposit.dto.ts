import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsNumber,
  IsOptional,
  IsString,
  MaxLength,
  Min,
} from 'class-validator';

/**
 * KAPARO ALMA DTO
 * ─────────────────────────────────────────────────────────────────────────────
 * Bir randevu için kaparo (ön ödeme) alırken kullanılır.
 * Ledger'a TransactionType.DEPOSIT olarak kaydedilir.
 * ─────────────────────────────────────────────────────────────────────────────
 */
export class TakeDepositDto {
  @ApiProperty({
    example:     150.00,
    minimum:     0.01,
    description: 'Kaparo tutarı (TRY cinsinden)',
  })
  @IsNumber({ allowNaN: false, allowInfinity: false })
  @Min(0.01)
  amount!: number;

  @ApiPropertyOptional({
    example:     'POS-TXN-20260302-001',
    maxLength:   255,
    description: 'Ödeme terminali referans no (opsiyonel)',
  })
  @IsString()
  @MaxLength(255)
  @IsOptional()
  reference?: string;
}
