import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { AppointmentSource, AppointmentStatus } from '@calon/database';
import {
  IsUUID,
  IsISO8601,
  IsEnum,
  IsString,
  IsBoolean,
  IsNumber,
  IsOptional,
  Min,
  MaxLength,
} from 'class-validator';

export class CreateAppointmentDto {
  // ── Zorunlu ilişkiler ──────────────────────────────────────────────────

  @ApiProperty({ example: '550e8400-e29b-41d4-a716-446655440001' })
  @IsUUID('4')
  customerId!: string;

  @ApiProperty({ example: '550e8400-e29b-41d4-a716-446655440002' })
  @IsUUID('4')
  staffId!: string;

  @ApiProperty({ example: '550e8400-e29b-41d4-a716-446655440003' })
  @IsUUID('4')
  serviceId!: string;

  @ApiProperty({ example: '550e8400-e29b-41d4-a716-446655440004' })
  @IsUUID('4')
  locationId!: string;

  @ApiPropertyOptional({ example: '550e8400-e29b-41d4-a716-446655440005' })
  @IsUUID('4')
  @IsOptional()
  roomId?: string;

  // ── Zaman aralığı ──────────────────────────────────────────────────────

  @ApiProperty({ example: '2026-03-15T10:00:00.000Z' })
  @IsISO8601()
  startTime!: string;

  @ApiProperty({ example: '2026-03-15T11:00:00.000Z' })
  @IsISO8601()
  endTime!: string;

  // ── Kaynak ve notlar ───────────────────────────────────────────────────

  @ApiPropertyOptional({
    enum:    AppointmentSource,
    example: AppointmentSource.RECEPTIONIST,
  })
  @IsEnum(AppointmentSource)
  @IsOptional()
  source?: AppointmentSource;

  @ApiPropertyOptional({ example: 'Müşteri saç boyası istiyor', maxLength: 1000 })
  @IsString()
  @MaxLength(1000)
  @IsOptional()
  notes?: string;

  @ApiPropertyOptional({ example: 'Hassas saç derisi', maxLength: 1000 })
  @IsString()
  @MaxLength(1000)
  @IsOptional()
  internalNotes?: string;

  // ── Fiyat / ön ödeme ──────────────────────────────────────────────────

  @ApiPropertyOptional({ example: 250.00, minimum: 0 })
  @IsNumber({ allowNaN: false, allowInfinity: false })
  @Min(0)
  @IsOptional()
  totalPrice?: number;

  @ApiPropertyOptional({ example: 50.00, minimum: 0 })
  @IsNumber({ allowNaN: false, allowInfinity: false })
  @Min(0)
  @IsOptional()
  depositPaid?: number;

  // ── Faz 19: İlk durum (ödeme gerektiren randevular PENDING_PAYMENT ile başlar) ──

  @ApiPropertyOptional({ enum: AppointmentStatus, example: AppointmentStatus.PENDING })
  @IsEnum(AppointmentStatus)
  @IsOptional()
  status?: AppointmentStatus;

  // ── Faz 21.9: Test rezervasyonu işareti ────────────────────────────────
  // HTTP endpoint'lerinden KABUL EDİLMEZ — yalnızca sunucu içi servisten set edilir.
  // public.service.ts: TRIAL tenant + ilk randevu tespitinde true atar.
  // growths-metrics: isTestBooking=true randevular finansal sorgulardan dışlanır.
  @ApiPropertyOptional({ example: false, description: 'Sunucu tarafından atanır — HTTP body\'den reddedilir.' })
  @IsBoolean()
  @IsOptional()
  isTestBooking?: boolean;
}
