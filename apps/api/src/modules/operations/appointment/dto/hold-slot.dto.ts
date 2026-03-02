import { IsDateString, IsUUID } from 'class-validator';
import { ApiProperty }          from '@nestjs/swagger';

/**
 * POST /appointments/hold — Slot geçici kilit isteği
 *
 * Randevu sürecinin ilk adımında kullanıcı UI'da bir saat seçtiğinde,
 * ödeme/onay adımına geçmeden önce bu endpoint 5 dakikalık Redis kilidi oluşturur.
 */
export class HoldSlotDto {
  @ApiProperty({
    description: 'Randevuyu alacak personelin ID\'si',
    format:      'uuid',
  })
  @IsUUID()
  staffId!: string;

  @ApiProperty({
    description: 'Kilitlenecek saat diliminin başlangıç zamanı (ISO 8601)',
    example:     '2026-03-15T10:00:00.000Z',
  })
  @IsDateString()
  startTime!: string;
}
