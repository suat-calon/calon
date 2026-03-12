import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsUUID, IsString, IsNotEmpty, IsOptional } from 'class-validator';

export class CreatePaymentDto {
  /** Ödeme başlatılacak randevu ID'si */
  @ApiProperty({ example: '550e8400-e29b-41d4-a716-446655440001' })
  @IsUUID('4')
  appointmentId!: string;

  /** Müşteri adı (İyzico buyer.name alanı) */
  @ApiProperty({ example: 'Ayşe' })
  @IsString()
  @IsNotEmpty()
  buyerName!: string;

  /** Müşteri soyadı (İyzico buyer.surname alanı) */
  @ApiPropertyOptional({ example: 'Yılmaz' })
  @IsString()
  @IsOptional()
  buyerSurname?: string;

  /** Müşteri e-posta (İyzico buyer.email alanı) */
  @ApiProperty({ example: 'ayse@example.com' })
  @IsString()
  @IsNotEmpty()
  buyerEmail!: string;

  /**
   * TC kimlik numarası (İyzico buyer.identityNumber).
   * Zorunlu alan — production'da gerçek TC kimlik no gereklidir.
   * development ortamında DTO sağlanmazsa servis katmanı '11111111111' test değerini kullanır.
   */
  @ApiProperty({ example: '12345678901' })
  @IsString()
  @IsNotEmpty()
  buyerIdentityNumber!: string;
}
