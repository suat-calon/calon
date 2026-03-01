import { ApiProperty } from '@nestjs/swagger';
import { IsString, MinLength } from 'class-validator';

export class LogoutDto {
  @ApiProperty({
    example: 'a1b2c3d4e5f6...96-karakter-hex',
    description: 'İptal edilecek refresh token',
  })
  @IsString()
  @MinLength(10)
  refreshToken!: string;
}
