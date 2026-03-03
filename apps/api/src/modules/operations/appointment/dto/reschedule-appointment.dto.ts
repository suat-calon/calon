import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsISO8601, IsString, IsOptional, MaxLength } from 'class-validator';

/**
 * PATCH /appointments/:id/reschedule
 * Randevuyu yeni bir saat dilimine taşır.
 */
export class RescheduleAppointmentDto {
  @ApiProperty({
    description: 'Yeni başlangıç zamanı (ISO 8601)',
    example:     '2026-03-16T11:00:00.000Z',
  })
  @IsISO8601()
  newStartTime!: string;

  @ApiProperty({
    description: 'Yeni bitiş zamanı (ISO 8601)',
    example:     '2026-03-16T12:00:00.000Z',
  })
  @IsISO8601()
  newEndTime!: string;

  @ApiPropertyOptional({
    description: 'Taşıma nedeni (isteğe bağlı, log için)',
    maxLength:   500,
  })
  @IsString()
  @MaxLength(500)
  @IsOptional()
  reason?: string;
}
