import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsString,
  IsNumber,
  IsOptional,
  MaxLength,
  Min,
} from 'class-validator';

export class CreateProductDto {
  @ApiProperty({ example: 'Keratin Bakım Kremi' })
  @IsString()
  @MaxLength(200)
  name!: string;

  @ApiPropertyOptional({ example: 'KER-001' })
  @IsString()
  @MaxLength(50)
  @IsOptional()
  sku?: string;

  /** Birim: ml, gr, adet vb. */
  @ApiPropertyOptional({ example: 'ml', default: 'ml' })
  @IsString()
  @MaxLength(20)
  @IsOptional()
  unit?: string;

  @ApiPropertyOptional({ example: 1000, minimum: 0 })
  @IsNumber({ allowNaN: false, allowInfinity: false })
  @Min(0)
  @IsOptional()
  stockAmount?: number;

  @ApiPropertyOptional({ example: 100, minimum: 0 })
  @IsNumber({ allowNaN: false, allowInfinity: false })
  @Min(0)
  @IsOptional()
  minStock?: number;

  @ApiPropertyOptional({ example: 150.00, minimum: 0 })
  @IsNumber({ allowNaN: false, allowInfinity: false })
  @Min(0)
  @IsOptional()
  costPrice?: number;
}
