import { Type }                      from 'class-transformer';
import { IsInt, IsOptional, IsString, IsUUID, Max, Min } from 'class-validator';
import { ApiPropertyOptional }        from '@nestjs/swagger';

export class ListStaffQueryDto {
  @ApiPropertyOptional({ description: 'Ad, soyad veya unvan ile arama' })
  @IsString()
  @IsOptional()
  search?: string;

  @ApiPropertyOptional({ description: 'Lokasyona göre filtrele', format: 'uuid' })
  @IsUUID()
  @IsOptional()
  locationId?: string;

  @ApiPropertyOptional({ description: 'Sayfa başı kayıt sayısı (1–100)', default: 20 })
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  @IsOptional()
  take?: number;

  @ApiPropertyOptional({ description: 'Atlama sayısı (pagination)', default: 0 })
  @Type(() => Number)
  @IsInt()
  @Min(0)
  @IsOptional()
  skip?: number;
}
