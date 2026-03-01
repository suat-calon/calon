import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { AppointmentStatus }               from '@prisma/client';
import { IsEnum, IsString, IsOptional, MaxLength } from 'class-validator';

export class UpdateAppointmentStatusDto {
  @ApiProperty({
    enum:        AppointmentStatus,
    example:     AppointmentStatus.CONFIRMED,
    description: 'Geçilmek istenen yeni durum. XState makinesinde tanımlı geçişler geçerlidir.',
  })
  @IsEnum(AppointmentStatus)
  status!: AppointmentStatus;

  @ApiPropertyOptional({
    example:     'Müşteri iptal etti',
    description: 'İptal gerekçesi — yalnızca CANCELLED geçişinde kullanılır',
    maxLength:   500,
  })
  @IsString()
  @MaxLength(500)
  @IsOptional()
  cancellationReason?: string;
}
