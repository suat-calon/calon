import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { PhotoType }                         from '@prisma/client';
import {
  IsDateString,
  IsEnum,
  IsNotEmpty,
  IsOptional,
  IsString,
  IsUrl,
  IsUUID,
  MaxLength,
} from 'class-validator';

/**
 * Öncesi/sonrası fotoğraf ekleme DTO.
 * Fotoğraf URL'leri S3 / Object Storage'dan alınır — dosya yükleme bu endpoint'te yapılmaz.
 */
export class AddPhotoDto {
  @ApiProperty({ example: '550e8400-e29b-41d4-a716-446655440000', description: 'Müşteri UUID' })
  @IsUUID()
  customerId!: string;

  @ApiPropertyOptional({ example: '550e8400-e29b-41d4-a716-446655440001', description: 'İlişkili randevu UUID (opsiyonel)' })
  @IsUUID()
  @IsOptional()
  appointmentId?: string;

  @ApiProperty({
    enum:    PhotoType,
    example: PhotoType.BEFORE,
    description: 'Fotoğraf tipi: BEFORE (öncesi), AFTER (sonrası), PROGRESS (süreç)',
  })
  @IsEnum(PhotoType)
  photoType!: PhotoType;

  @ApiProperty({ example: 'https://s3.eu-central-1.amazonaws.com/calon/photos/abc.jpg', description: 'Tam boyut görsel URL' })
  @IsUrl({ require_tld: false })
  @IsNotEmpty()
  url!: string;

  @ApiPropertyOptional({ example: 'https://s3.eu-central-1.amazonaws.com/calon/photos/abc-thumb.jpg', description: 'Küçük boy önizleme URL' })
  @IsUrl({ require_tld: false })
  @IsOptional()
  thumbnailUrl?: string;

  @ApiPropertyOptional({ example: 'Yüz — Burun bölgesi', maxLength: 100, description: 'İşlem uygulanan vücut bölgesi' })
  @IsString()
  @MaxLength(100)
  @IsOptional()
  bodyArea?: string;

  @ApiPropertyOptional({ example: 'Kaş lifting sonrası 1. seans', maxLength: 500 })
  @IsString()
  @MaxLength(500)
  @IsOptional()
  notes?: string;

  @ApiPropertyOptional({ example: '2026-03-02T10:00:00.000Z', description: 'Fotoğrafın çekildiği an (ISO 8601)' })
  @IsDateString()
  @IsOptional()
  takenAt?: string;
}
