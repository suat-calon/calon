/**
 * AUTH CONTROLLER — /api/v1/auth
 * ──────────────────────────────────────────────────────────────────────────────
 * Tüm endpoint'ler @Public() ile işaretlendi:
 *   - /register : Yeni tenant + kullanıcı kaydı (bcrypt hash)
 *   - /login    : Kimlik doğrulama + HttpOnly cookie çifti
 *   - /refresh  : Silent Refresh + Token Rotation (cookie tabanlı)
 *   - /logout   : Cookie temizleme + Refresh token iptali
 *
 * Güvenlik (v2 — HttpOnly Cookie):
 *   • accessToken  → calon_access  cookie (HttpOnly, Secure, SameSite=Strict)
 *   • refreshToken → calon_refresh cookie (HttpOnly, Secure, SameSite=Strict, path=/api/v1/auth)
 *   • localStorage TOKEN YOKTUR — XSS token çalma saldırısına karşı tamamen kapalı
 *   • İç mesaj detayları Swagger dışında istemciye gönderilmez.
 * ──────────────────────────────────────────────────────────────────────────────
 */

import {
  Controller,
  Post,
  Body,
  Req,
  Res,
  HttpCode,
  HttpStatus,
  UnauthorizedException,
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
import type { Request, Response } from 'express';

import { AuthService, AuthTokens } from './auth.service';
import { Public }          from './guards/tenant.guard';
import { AllowPastDue }    from '../billing/decorators/allow-past-due.decorator';
import { RegisterDto }     from './dto/register.dto';
import { LoginDto }        from './dto/login.dto';
import { LogoutDto }       from './dto/logout.dto';

// ── Cookie sabitleri ────────────────────────────────────────────────────────

const COOKIE_ACCESS  = 'calon_access';
const COOKIE_REFRESH = 'calon_refresh';

/** access token: 15 dakika (ms) */
const ACCESS_MAX_AGE  = 15 * 60 * 1000;
/** refresh token: 30 gün (ms) */
const REFRESH_MAX_AGE = 30 * 24 * 60 * 60 * 1000;

// ── Yardımcı ────────────────────────────────────────────────────────────────

function setCookies(res: Response, tokens: AuthTokens): void {
  const isProduction = process.env['NODE_ENV'] === 'production';
  const base = {
    httpOnly: true,
    secure:   isProduction,
    sameSite: 'strict' as const,
  };

  res.cookie(COOKIE_ACCESS, tokens.accessToken, {
    ...base,
    maxAge: ACCESS_MAX_AGE,
    path:   '/',
  });

  // Refresh cookie: yalnızca auth endpointlerinde gönderilir (path kısıtı)
  res.cookie(COOKIE_REFRESH, tokens.refreshToken, {
    ...base,
    maxAge: REFRESH_MAX_AGE,
    path:   '/api/v1/auth',
  });
}

function clearCookies(res: Response): void {
  res.clearCookie(COOKIE_ACCESS,  { path: '/' });
  res.clearCookie(COOKIE_REFRESH, { path: '/api/v1/auth' });
}

// ── Controller ──────────────────────────────────────────────────────────────

@ApiTags('auth')
@AllowPastDue()
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
      'Başarıyla tamamlanınca access ve refresh token HttpOnly cookie olarak set edilir.',
  })
  @ApiCreatedResponse({
    description: 'Kayıt başarılı — cookie set edildi',
    schema: { example: { expiresIn: 900 } },
  })
  @ApiConflictResponse({ description: 'E-posta veya slug zaten kayıtlı' })
  @ApiBadRequestResponse({ description: 'Geçersiz girdi — validasyon hatası' })
  async register(
    @Body() dto: RegisterDto,
    @Res({ passthrough: true }) res: Response,
  ): Promise<{ expiresIn: number }> {
    const tokens = await this.authService.register(dto);
    setCookies(res, tokens);
    return { expiresIn: tokens.expiresIn };
  }

  // ─── GİRİŞ ──────────────────────────────────────────────────────────────
  @Public()
  @Post('login')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Giriş',
    description:
      'E-posta + şifre + tenantId ile kimlik doğrular. ' +
      'Başarılı girişte token çifti HttpOnly cookie olarak set edilir. ' +
      'Hatalı kimlik bilgilerinde hangisinin yanlış olduğu ifşa edilmez.',
  })
  @ApiOkResponse({
    description: 'Giriş başarılı — cookie set edildi',
    schema: { example: { expiresIn: 900 } },
  })
  @ApiUnauthorizedResponse({ description: 'Kimlik bilgileri hatalı' })
  async login(
    @Body() dto: LoginDto,
    @Res({ passthrough: true }) res: Response,
  ): Promise<{ expiresIn: number }> {
    const tokens = await this.authService.login(dto);
    setCookies(res, tokens);
    return { expiresIn: tokens.expiresIn };
  }

  // ─── TOKEN YENİLEME ──────────────────────────────────────────────────────
  @Public()
  @Post('refresh')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Access token yenile (Silent Refresh)',
    description:
      'calon_refresh cookie\'sindeki refresh token ile yeni 15 dakikalık access token alır. ' +
      'Her çağrıda eski token iptal edilir, yenisi üretilir (Token Rotation). ' +
      'İptal edilmiş token ile istek gelirse tüm oturumlar kapatılır.',
  })
  @ApiOkResponse({
    description: 'Token yenileme başarılı — yeni cookie set edildi',
    schema: { example: { expiresIn: 900 } },
  })
  @ApiUnauthorizedResponse({
    description: 'Geçersiz, süresi dolmuş veya iptal edilmiş refresh cookie',
  })
  async refresh(
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
  ): Promise<{ expiresIn: number }> {
    // Refresh token HttpOnly cookie'den alınır (body gerekmez)
    const refreshToken = (req.cookies as Record<string, string>)[COOKIE_REFRESH];
    if (!refreshToken) {
      throw new UnauthorizedException('Refresh cookie bulunamadı.');
    }

    const tokens = await this.authService.refresh(refreshToken);
    setCookies(res, tokens);
    return { expiresIn: tokens.expiresIn };
  }

  // ─── ÇIKIŞ ───────────────────────────────────────────────────────────────
  @Public()
  @Post('logout')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({
    summary: 'Çıkış (oturumu kapat)',
    description:
      'Cookie\'deki refresh token\'ı veritabanında iptal eder ve cookie\'leri temizler. ' +
      'Geçersiz token veya eksik cookie durumunda bile 204 döner (idempotent).',
  })
  async logout(
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
    @Body() dto?: LogoutDto,
  ): Promise<void> {
    // Refresh token önce cookie'den, yoksa body'den alınır (backward compat)
    const refreshToken =
      (req.cookies as Record<string, string>)[COOKIE_REFRESH] ?? dto?.refreshToken;

    if (refreshToken) {
      await this.authService.logout(refreshToken);
    }

    clearCookies(res);
  }
}
