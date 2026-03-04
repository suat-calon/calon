import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsEmail, IsString, IsUUID, IsOptional } from 'class-validator';

export class LoginDto {
  @ApiProperty({ example: 'ayse@ornek.com' })
  @IsEmail({}, { message: 'Geçerli bir e-posta adresi giriniz.' })
  email!: string;

  @ApiProperty({ example: 'Gizli123!' })
  @IsString()
  password!: string;

  /**
   * Opsiyonel: Belirtilmezse kullanıcının ilk (tek) tenant'ı otomatik seçilir.
   * Birden fazla tenant üyesi olan kullanıcılar için açıkça gönderilmelidir.
   */
  @ApiPropertyOptional({
    example: '550e8400-e29b-41d4-a716-446655440000',
    description: 'Giriş yapılacak tenant UUID (opsiyonel — yoksa ilk tenant kullanılır)',
  })
  @IsOptional()
  @IsUUID('4', { message: 'Geçerli bir tenant ID (UUID) giriniz.' })
  tenantId?: string;
}
