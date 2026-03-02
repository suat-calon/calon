import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsDateString,
  IsIn,
  IsNotEmpty,
  IsOptional,
  IsString,
  IsUUID,
} from 'class-validator';

/**
 * Onam formu oluşturma DTO.
 *
 * NOT: Bu DTO ile oluşturulan kayıtlar KESİNLİKLE güncellenmez.
 * ConsentForm modeli yasal kanıt niteliği taşır → immutable.
 */
export class CreateConsentFormDto {
  @ApiProperty({ example: '550e8400-e29b-41d4-a716-446655440000', description: 'Müşteri UUID' })
  @IsUUID()
  customerId!: string;

  @ApiPropertyOptional({ example: '550e8400-e29b-41d4-a716-446655440001', description: 'İlişkili randevu UUID (opsiyonel)' })
  @IsUUID()
  @IsOptional()
  appointmentId?: string;

  @ApiProperty({
    example: 'KVKK',
    enum: ['KVKK', 'GDPR', 'TREATMENT', 'MARKETING'],
    description: 'Form tipi',
  })
  @IsString()
  @IsIn(['KVKK', 'GDPR', 'TREATMENT', 'MARKETING'])
  @IsNotEmpty()
  formType!: string;

  @ApiProperty({
    example: 'Ben aşağıda belirtilen kişisel verilerimin işlenmesine onay veriyorum...',
    description: 'Form içeriğinin anlık snapshot\'ı — değiştirilemez',
  })
  @IsString()
  @IsNotEmpty()
  content!: string;

  @ApiProperty({ example: '2026-03-02T10:00:00.000Z', description: 'İmzalanma anı (ISO 8601)' })
  @IsDateString()
  signedAt!: string;
}
