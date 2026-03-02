import {
  IsBoolean,
  IsNotEmpty,
  IsNumber,
  IsOptional,
  IsString,
  IsUUID,
  IsUrl,
  Matches,
  Max,
  MaxLength,
  Min,
} from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class CreateStaffDto {
  @ApiProperty({ description: 'Personelin atandığı lokasyon ID', format: 'uuid' })
  @IsUUID()
  locationId!: string;

  @ApiPropertyOptional({ description: 'Sisteme kayıtlı kullanıcı ID (isteğe bağlı)', format: 'uuid' })
  @IsUUID()
  @IsOptional()
  userId?: string;

  @ApiProperty({ description: 'Ad', example: 'Ayşe' })
  @IsString()
  @IsNotEmpty()
  @MaxLength(100)
  firstName!: string;

  @ApiProperty({ description: 'Soyad', example: 'Demir' })
  @IsString()
  @IsNotEmpty()
  @MaxLength(100)
  lastName!: string;

  @ApiPropertyOptional({ description: 'Telefon numarası' })
  @IsString()
  @MaxLength(20)
  @IsOptional()
  phone?: string;

  @ApiPropertyOptional({ description: 'Profil fotoğrafı URL' })
  @IsUrl({ require_tld: false })
  @IsOptional()
  avatarUrl?: string;

  @ApiPropertyOptional({ description: 'Unvan (örn: Saç Uzmanı, Estetisyen)' })
  @IsString()
  @MaxLength(100)
  @IsOptional()
  title?: string;

  @ApiPropertyOptional({
    description: 'Takvimde görünen renk kodu (HEX)',
    example: '#6366f1',
    pattern: '^#([A-Fa-f0-9]{6})$',
  })
  @Matches(/^#([A-Fa-f0-9]{6})$/, { message: 'colorHex geçerli bir HEX renk kodu olmalıdır (#RRGGBB)' })
  @IsOptional()
  colorHex?: string;

  @ApiPropertyOptional({
    description: 'Prim oranı (% cinsinden, 0–100)',
    example: 15,
    minimum: 0,
    maximum: 100,
  })
  @IsNumber()
  @Min(0)
  @Max(100)
  @IsOptional()
  commissionRate?: number;

  @ApiPropertyOptional({ description: 'Aktif mi?', default: true })
  @IsBoolean()
  @IsOptional()
  isActive?: boolean;
}
