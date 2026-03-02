import { ApiPropertyOptional } from '@nestjs/swagger';
import { Type }              from 'class-transformer';
import { IsInt, IsOptional, IsString, Max, Min } from 'class-validator';

export class ListCustomersQueryDto {
  @ApiPropertyOptional({ description: 'Ad, soyad, e-posta veya telefona göre arama' })
  @IsString()
  @IsOptional()
  search?: string;

  @ApiPropertyOptional({ example: 20, minimum: 1, maximum: 100, default: 20 })
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  @IsOptional()
  take?: number;

  @ApiPropertyOptional({ example: 0, minimum: 0, default: 0 })
  @Type(() => Number)
  @IsInt()
  @Min(0)
  @IsOptional()
  skip?: number;
}
