import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsBoolean, IsNumber, IsOptional, IsString, Min } from 'class-validator';

export class UpdateProductDto {
  @ApiPropertyOptional({ example: 'Keratin Şampuan' })
  @IsString()
  @IsOptional()
  name?: string;

  @ApiPropertyOptional({ example: 'SKU-001' })
  @IsString()
  @IsOptional()
  sku?: string;

  @ApiPropertyOptional({ example: 'ml', enum: ['ml', 'gr', 'adet'] })
  @IsString()
  @IsOptional()
  unit?: string;

  @ApiPropertyOptional({ example: 500, description: 'Stok miktarı' })
  @IsNumber()
  @IsOptional()
  @Min(0)
  stockAmount?: number;

  @ApiPropertyOptional({ example: 50, description: 'Minimum stok seviyesi' })
  @IsNumber()
  @IsOptional()
  @Min(0)
  minStock?: number;

  @ApiPropertyOptional({ example: 150, description: 'Alış fiyatı (₺, tam birim)' })
  @IsNumber()
  @IsOptional()
  @Min(0)
  costPrice?: number;

  @ApiPropertyOptional({ example: true })
  @IsBoolean()
  @IsOptional()
  isActive?: boolean;
}
