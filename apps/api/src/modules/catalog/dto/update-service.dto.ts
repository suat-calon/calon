import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsBoolean, IsNumber, IsOptional, IsString, Max, Min } from 'class-validator';

export class UpdateServiceDto {
  @ApiPropertyOptional({ example: 'Saç Kesimi' })
  @IsString()
  @IsOptional()
  name?: string;

  @ApiPropertyOptional({ example: 'Profesyonel saç kesimi ve şekillendirme' })
  @IsString()
  @IsOptional()
  description?: string;

  @ApiPropertyOptional({ example: 30, description: 'Hizmet süresi (dakika)' })
  @IsNumber()
  @IsOptional()
  @Min(5)
  durationMin?: number;

  @ApiPropertyOptional({ example: 250, description: 'Fiyat (₺, tam birim)' })
  @IsNumber()
  @IsOptional()
  @Min(0)
  price?: number;

  @ApiPropertyOptional({ example: 20, description: 'Kapora oranı (%)' })
  @IsNumber()
  @IsOptional()
  @Min(0)
  @Max(100)
  depositRate?: number;

  @ApiPropertyOptional({ example: true })
  @IsBoolean()
  @IsOptional()
  isActive?: boolean;
}
