import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsUUID,
  IsString,
  IsNumber,
  IsInt,
  IsOptional,
  MaxLength,
  Min,
  Max,
} from 'class-validator';

export class CreateServiceDto {
  @ApiProperty({ example: '550e8400-e29b-41d4-a716-446655440010' })
  @IsUUID('4')
  categoryId!: string;

  @ApiProperty({ example: 'Keratin Bakım' })
  @IsString()
  @MaxLength(200)
  name!: string;

  @ApiPropertyOptional({ example: 'Keratin proteinleriyle derin saç onarımı' })
  @IsString()
  @MaxLength(1000)
  @IsOptional()
  description?: string;

  /** Hizmet süresi (dakika cinsinden) */
  @ApiProperty({ example: 60 })
  @IsInt()
  @Min(1)
  durationMin!: number;

  @ApiProperty({ example: 500.00 })
  @IsNumber({ allowNaN: false, allowInfinity: false })
  @Min(0)
  price!: number;

  @ApiPropertyOptional({ example: 'TRY', default: 'TRY' })
  @IsString()
  @MaxLength(3)
  @IsOptional()
  currency?: string;

  /** Kaparo oranı: 0 (yok) – 1 (tam fiyat). Örnek: 0.2 = %20 kaparo */
  @ApiPropertyOptional({ example: 0.2, minimum: 0, maximum: 1 })
  @IsNumber({ allowNaN: false, allowInfinity: false })
  @Min(0)
  @Max(1)
  @IsOptional()
  depositRate?: number;
}
