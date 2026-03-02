import { Type }          from 'class-transformer';
import {
  IsArray,
  IsBoolean,
  IsEnum,
  IsOptional,
  Matches,
  ValidateNested,
} from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { DayOfWeek } from '@prisma/client';

/** HH:MM formatını doğrulayan regex */
const TIME_REGEX = /^([01][0-9]|2[0-3]):[0-5][0-9]$/;

export class WorkingHourEntryDto {
  @ApiProperty({ enum: DayOfWeek, description: 'Haftanın günü' })
  @IsEnum(DayOfWeek)
  dayOfWeek!: DayOfWeek;

  @ApiProperty({ description: 'Çalışma günü mü?', example: true })
  @IsBoolean()
  isWorkingDay!: boolean;

  @ApiProperty({ description: 'Mesai başlangıcı (HH:MM)', example: '09:00' })
  @Matches(TIME_REGEX, { message: 'startTime HH:MM formatında olmalıdır' })
  startTime!: string;

  @ApiProperty({ description: 'Mesai bitişi (HH:MM)', example: '18:00' })
  @Matches(TIME_REGEX, { message: 'endTime HH:MM formatında olmalıdır' })
  endTime!: string;

  @ApiPropertyOptional({ description: 'Mola başlangıcı (HH:MM)', example: '12:00' })
  @Matches(TIME_REGEX, { message: 'breakStart HH:MM formatında olmalıdır' })
  @IsOptional()
  breakStart?: string;

  @ApiPropertyOptional({ description: 'Mola bitişi (HH:MM)', example: '13:00' })
  @Matches(TIME_REGEX, { message: 'breakEnd HH:MM formatında olmalıdır' })
  @IsOptional()
  breakEnd?: string;
}

export class SetWorkingHoursDto {
  @ApiProperty({
    type:        [WorkingHourEntryDto],
    description: 'Haftalık çalışma saatleri (eksik günler güncellenmez)',
  })
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => WorkingHourEntryDto)
  hours!: WorkingHourEntryDto[];
}
