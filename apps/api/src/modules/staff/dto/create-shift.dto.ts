import { IsDateString, IsOptional, IsString } from 'class-validator';
import { ApiProperty, ApiPropertyOptional }   from '@nestjs/swagger';

/**
 * Personel için özel vardiya / istisna program (izin, rapor, fazla mesai).
 * date    : Günün tarihi (YYYY-MM-DD)
 * startTime / endTime : Bu tarihteki gerçek başlama/bitiş (ISO 8601 datetime)
 */
export class CreateShiftDto {
  @ApiProperty({ description: 'Vardiya tarihi (YYYY-MM-DD)', example: '2026-03-20' })
  @IsDateString()
  date!: string;

  @ApiProperty({
    description: 'Vardiya başlangıç zamanı (ISO 8601)',
    example: '2026-03-20T08:00:00.000Z',
  })
  @IsDateString()
  startTime!: string;

  @ApiProperty({
    description: 'Vardiya bitiş zamanı (ISO 8601)',
    example: '2026-03-20T20:00:00.000Z',
  })
  @IsDateString()
  endTime!: string;

  @ApiPropertyOptional({ description: 'Vardiya notu (izin sebebi, fazla mesai açıklaması)' })
  @IsString()
  @IsOptional()
  notes?: string;
}

export class ListShiftsQueryDto {
  @ApiPropertyOptional({ description: 'Başlangıç tarihi filtresi (YYYY-MM-DD)' })
  @IsDateString()
  @IsOptional()
  from?: string;

  @ApiPropertyOptional({ description: 'Bitiş tarihi filtresi (YYYY-MM-DD)' })
  @IsDateString()
  @IsOptional()
  to?: string;
}
