import { ApiProperty }           from '@nestjs/swagger';
import { IsEmail, IsString, IsUUID } from 'class-validator';

export class LoginDto {
  @ApiProperty({ example: 'ayse@ornek.com' })
  @IsEmail({}, { message: 'Geçerli bir e-posta adresi giriniz.' })
  email!: string;

  @ApiProperty({ example: 'Gizli123!' })
  @IsString()
  password!: string;

  @ApiProperty({
    example: '550e8400-e29b-41d4-a716-446655440000',
    description: 'Giriş yapılacak tenant UUID',
  })
  @IsUUID('4', { message: 'Geçerli bir tenant ID (UUID) giriniz.' })
  tenantId!: string;
}
