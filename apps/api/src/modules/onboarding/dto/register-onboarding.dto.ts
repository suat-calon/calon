/**
 * REGISTER ONBOARDING DTO — Self-Onboarding Kayıt
 * ──────────────────────────────────────────────────────────────────────────────
 * POST /onboarding/register için giriş DTO'su.
 * Phone zorunlu değil; slug verilmezse sistem otomatik üretir.
 */

import {
  IsEmail,
  IsString,
  MinLength,
  IsOptional,
  Matches,
  ValidateNested,
} from 'class-validator';
import { Type } from 'class-transformer';

export class TenantInfoDto {
  /** İşletme adı — slugify için kaynak */
  @IsString()
  @MinLength(2)
  name!: string;

  /**
   * İsteğe bağlı slug: küçük harf, rakam ve tire.
   * Verilmezse sistem name'den otomatik üretir.
   * Verilirse benzersizlik kontrolü yapılır; alınmışsa 409 SLUG_TAKEN.
   */
  @IsOptional()
  @IsString()
  @Matches(/^[a-z0-9-]{2,63}$/, {
    message: 'Slug yalnızca küçük harf, rakam ve tire içerebilir (2-63 karakter).',
  })
  slug?: string;

  /** IANA timezone (örn: "Europe/Istanbul"). Varsayılan: "Europe/Istanbul" */
  @IsOptional()
  @IsString()
  timezone?: string;

  /** Para birimi ISO kodu (örn: "TRY"). Varsayılan: "TRY" */
  @IsOptional()
  @IsString()
  currency?: string;
}

export class RegisterOnboardingDto {
  @IsEmail()
  email!: string;

  @IsString()
  @MinLength(8)
  password!: string;

  @IsString()
  @MinLength(1)
  firstName!: string;

  @IsString()
  @MinLength(1)
  lastName!: string;

  /** Opsiyonel telefon numarası */
  @IsOptional()
  @IsString()
  phone?: string;

  @ValidateNested()
  @Type(() => TenantInfoDto)
  tenant!: TenantInfoDto;
}
