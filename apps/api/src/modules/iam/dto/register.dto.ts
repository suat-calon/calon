import { ApiProperty }                          from '@nestjs/swagger';
import { IsEmail, IsString, Matches, MaxLength, MinLength } from 'class-validator';

export class RegisterDto {
  @ApiProperty({ example: 'Ayşe', description: 'Ad' })
  @IsString()
  @MinLength(2)
  @MaxLength(50)
  firstName!: string;

  @ApiProperty({ example: 'Demir', description: 'Soyad' })
  @IsString()
  @MinLength(2)
  @MaxLength(50)
  lastName!: string;

  @ApiProperty({ example: 'ayse@ornek.com' })
  @IsEmail({}, { message: 'Geçerli bir e-posta adresi giriniz.' })
  email!: string;

  /**
   * Kural: En az 8 karakter, 1 büyük, 1 küçük harf, 1 rakam, 1 özel karakter
   */
  @ApiProperty({
    example: 'Gizli123!',
    minLength: 8,
    description: 'En az 8 karakter, büyük/küçük harf, rakam ve özel karakter içermelidir',
  })
  @IsString()
  @MinLength(8)
  @MaxLength(100)
  @Matches(/^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[\W_]).{8,}$/, {
    message: 'Şifre en az bir büyük harf, küçük harf, rakam ve özel karakter içermelidir.',
  })
  password!: string;

  @ApiProperty({ example: 'Aurora Güzellik', description: 'İşletme adı' })
  @IsString()
  @MinLength(2)
  @MaxLength(100)
  tenantName!: string;

  @ApiProperty({
    example: 'aurora-guzellik',
    description: 'URL-uyumlu kısa ad — sadece küçük harf, rakam, tire',
  })
  @IsString()
  @MinLength(2)
  @MaxLength(50)
  @Matches(/^[a-z0-9-]+$/, {
    message: 'Slug sadece küçük harf, rakam ve tire (-) içerebilir.',
  })
  tenantSlug!: string;
}
