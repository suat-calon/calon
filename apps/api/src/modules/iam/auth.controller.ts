/**
 * AUTH CONTROLLER — /api/v1/auth
 * ──────────────────────────────────────────────────────────────────────────────
 * Tüm endpoint'ler @Public() ile işaretlendi:
 *   - /register : Yeni tenant + kullanıcı kaydı (bcrypt hash)
 *   - /login    : Kimlik doğrulama + token çifti
 *   - /refresh  : Silent Refresh + Token Rotation
 *   - /logout   : Refresh token iptali
 *
 * Güvenlik: İç mesaj detayları Swagger dışında istemciye gönderilmez.
 *           UnauthorizedException mesajları kasıtlı olarak belirsizdir (timing attack önlemi).
 * ──────────────────────────────────────────────────────────────────────────────
 */

import {
  Controller,
  Post,
  Body,
  HttpCode,
  HttpStatus,
} from '@nestjs/common';
import {
  ApiTags,
  ApiOperation,
  ApiCreatedResponse,
  ApiOkResponse,
  ApiConflictResponse,
  ApiUnauthorizedResponse,
  ApiBadRequestResponse,
} from '@nestjs/swagger';

import { AuthService, AuthTokens } from './auth.service';
import { Public }          from './guards/tenant.guard';
import { RegisterDto }     from './dto/register.dto';
import { LoginDto }        from './dto/login.dto';
import { RefreshTokenDto } from './dto/refresh-token.dto';
import { LogoutDto }       from './dto/logout.dto';

@ApiTags('auth')
@Controller('auth')
export class AuthController {
  constructor(private readonly authService: AuthService) {}

  // ─── KAYIT ──────────────────────────────────────────────────────────────
  @Public()
  @Post('register')
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({
    summary: 'Yeni işletme kaydı',
    description:
      'Yeni bir tenant (işletme) + TENANT_OWNER rolünde kullanıcı oluşturur. ' +
      'Başarıyla tamamlanınca access + refresh token çifti döner.',
  })
  @ApiCreatedResponse({
    description: 'Kayıt başarılı — token çifti döndürüldü',
    schema: {
      example: {
        accessToken:  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...',
        refreshToken: 'a1b2c3d4e5f6...96-karakter-hex',
        expiresIn:    900,
      },
    },
  })
  @ApiConflictResponse({ description: 'E-posta veya slug zaten kayıtlı' })
  @ApiBadRequestResponse({ description: 'Geçersiz girdi — validasyon hatası' })
  register(@Body() dto: RegisterDto): Promise<AuthTokens> {
    return this.authService.register(dto);
  }

  // ─── GİRİŞ ──────────────────────────────────────────────────────────────
  @Public()
  @Post('login')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Giriş',
    description:
      'E-posta + şifre + tenantId ile kimlik doğrular. ' +
      'Hatalı kimlik bilgilerinde hangisinin yanlış olduğu ifşa edilmez (enum bilgisi gizleme).',
  })
  @ApiOkResponse({
    description: 'Giriş başarılı — token çifti döndürüldü',
    schema: {
      example: {
        accessToken:  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...',
        refreshToken: 'a1b2c3d4e5f6...96-karakter-hex',
        expiresIn:    900,
      },
    },
  })
  @ApiUnauthorizedResponse({ description: 'Kimlik bilgileri hatalı' })
  login(@Body() dto: LoginDto): Promise<AuthTokens> {
    return this.authService.login(dto);
  }

  // ─── TOKEN YENİLEME ──────────────────────────────────────────────────────
  @Public()
  @Post('refresh')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Access token yenile (Silent Refresh)',
    description:
      '30 günlük refresh token ile yeni 15 dakikalık access token alır. ' +
      'Her çağrıda eski token iptal edilir, yenisi üretilir (Token Rotation). ' +
      'İptal edilmiş token ile istek gelirse tüm oturumlar kapatılır.',
  })
  @ApiOkResponse({
    description: 'Token yenileme başarılı',
    schema: {
      example: {
        accessToken:  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...',
        refreshToken: 'yeni96KarakterHex...',
        expiresIn:    900,
      },
    },
  })
  @ApiUnauthorizedResponse({
    description: 'Geçersiz, süresi dolmuş veya iptal edilmiş token',
  })
  refresh(@Body() dto: RefreshTokenDto): Promise<AuthTokens> {
    return this.authService.refresh(dto.refreshToken);
  }

  // ─── ÇIKIŞ ───────────────────────────────────────────────────────────────
  @Public()
  @Post('logout')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({
    summary: 'Çıkış (oturumu kapat)',
    description:
      'Refresh token\'ı veritabanında iptal eder. ' +
      'Geçersiz token ile çağrılsa bile 204 döner (idempotent).',
  })
  async logout(@Body() dto: LogoutDto): Promise<void> {
    await this.authService.logout(dto.refreshToken);
  }
}
