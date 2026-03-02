import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsBoolean,
  IsDateString,
  IsEmail,
  IsIn,
  IsNotEmpty,
  IsOptional,
  IsString,
  MaxLength,
} from 'class-validator';

export class CreateCustomerDto {
  @ApiProperty({ example: 'Ayşe', description: 'Ad' })
  @IsString()
  @IsNotEmpty()
  @MaxLength(100)
  firstName!: string;

  @ApiProperty({ example: 'Yılmaz', description: 'Soyad' })
  @IsString()
  @IsNotEmpty()
  @MaxLength(100)
  lastName!: string;

  @ApiPropertyOptional({ example: 'ayse@ornek.com' })
  @IsEmail()
  @IsOptional()
  email?: string;

  @ApiPropertyOptional({ example: '+905321234567', maxLength: 20 })
  @IsString()
  @MaxLength(20)
  @IsOptional()
  phone?: string;

  @ApiPropertyOptional({ example: '1990-05-15', description: 'Doğum tarihi (YYYY-MM-DD)' })
  @IsDateString()
  @IsOptional()
  dateOfBirth?: string;

  @ApiPropertyOptional({
    example: 'FEMALE',
    enum: ['MALE', 'FEMALE', 'OTHER', 'PREFER_NOT_TO_SAY'],
  })
  @IsString()
  @IsIn(['MALE', 'FEMALE', 'OTHER', 'PREFER_NOT_TO_SAY'])
  @IsOptional()
  gender?: string;

  @ApiPropertyOptional({ example: 'Alerjisi var: nikel', maxLength: 2000 })
  @IsString()
  @MaxLength(2000)
  @IsOptional()
  notes?: string;

  @ApiPropertyOptional({ example: true, description: 'KVKK/GDPR onam durumu' })
  @IsBoolean()
  @IsOptional()
  consentGiven?: boolean;
}
