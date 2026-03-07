/**
 * ONBOARDING CONTROLLER — Self-Onboarding Wizard Endpoint'leri
 * ──────────────────────────────────────────────────────────────────────────────
 * Base: /api/v1/onboarding
 *
 * register       → @Public(), cookie set edilir (Faz 21)
 * setup-wizard   → JWT gerektirir (toplu kurulum)
 * status         → JWT gerektirir — wizard durumu (Faz 21)
 * wizard/location → JWT gerektirir — adım 1 (Faz 21)
 * wizard/service  → JWT gerektirir — adım 2 (Faz 21)
 * wizard/staff    → JWT gerektirir — adım 3 (Faz 21)
 * ──────────────────────────────────────────────────────────────────────────────
 */

import {
  Controller,
  Post,
  Get,
  Body,
  Headers,
  Req,
  Res,
  HttpCode,
  HttpStatus,
  BadRequestException,
} from '@nestjs/common';
import type { Response } from 'express';

import { Public }                from '../iam/guards/tenant.guard';
import { AllowPastDue }          from '../billing/decorators/allow-past-due.decorator';
import { OnboardingService }     from './onboarding.service';
import { RegisterOnboardingDto } from './dto/register-onboarding.dto';
import { SetupWizardDto }        from './dto/setup-wizard.dto';
import { WizardLocationDto }     from './dto/wizard-location.dto';
import { WizardServiceDto }      from './dto/wizard-service.dto';
import { WizardStaffDto }        from './dto/wizard-staff.dto';

// ── Cookie sabitleri (auth.controller ile aynı) ───────────────────────────────
const COOKIE_ACCESS   = 'calon_access';
const COOKIE_REFRESH  = 'calon_refresh';
const ACCESS_MAX_AGE  = 15 * 60 * 1000;
const REFRESH_MAX_AGE = 30 * 24 * 60 * 60 * 1000;

function setCookies(
  res: Response,
  tokens: { accessToken: string; refreshToken: string },
): void {
  const isProd = process.env['NODE_ENV'] === 'production';
  const base   = { httpOnly: true, secure: isProd, sameSite: 'strict' as const };
  res.cookie(COOKIE_ACCESS, tokens.accessToken, {
    ...base, maxAge: ACCESS_MAX_AGE, path: '/',
  });
  res.cookie(COOKIE_REFRESH, tokens.refreshToken, {
    ...base, maxAge: REFRESH_MAX_AGE, path: '/api/v1/auth',
  });
}

@AllowPastDue()
@Controller('onboarding')
export class OnboardingController {
  constructor(private readonly onboarding: OnboardingService) {}

  // ── POST /onboarding/register ─────────────────────────────────────────────
  /**
   * Yeni kullanıcı + tenant kaydı.
   * Başarılı kayıt sonrası calon_access / calon_refresh cookie'leri set edilir.
   * Wizard adımları bu cookie ile authenticate edilir.
   */
  @Public()
  @Post('register')
  @HttpCode(HttpStatus.CREATED)
  async register(
    @Body() dto: RegisterOnboardingDto,
    @Res({ passthrough: true }) res: Response,
  ) {
    const result = await this.onboarding.register(dto);
    setCookies(res, {
      accessToken:  result.accessToken,
      refreshToken: result.refreshToken,
    });
    // Token'ları gizle — HttpOnly cookie üzerinden taşınır
    const { accessToken: _a, refreshToken: _r, ...safe } = result;
    return safe;
  }

  // ── POST /onboarding/setup-wizard ─────────────────────────────────────────
  @Post('setup-wizard')
  @HttpCode(HttpStatus.OK)
  async setupWizard(
    @Headers('idempotency-key') idempotencyKey: string | undefined,
    @Req() req: { tenantId?: string },
    @Body() dto: SetupWizardDto,
  ) {
    if (!idempotencyKey?.trim()) {
      throw new BadRequestException(
        'Idempotency-Key header zorunludur. Her wizard çağrısı için benzersiz bir UUID gönderin.',
      );
    }
    return this.onboarding.setupWizard(req.tenantId!, idempotencyKey.trim(), dto);
  }

  // ── GET /onboarding/status ────────────────────────────────────────────────
  /** Wizard durumu: tamamlanan adımlar + kaynak ID'leri */
  @Get('status')
  @HttpCode(HttpStatus.OK)
  getStatus(@Req() req: { tenantId?: string }) {
    return this.onboarding.getStatus(req.tenantId!);
  }

  // ── POST /onboarding/wizard/location ──────────────────────────────────────
  /** Faz 21 Adım 1: Salon konum bilgisi oluştur */
  @Post('wizard/location')
  @HttpCode(HttpStatus.CREATED)
  createLocation(
    @Req() req: { tenantId?: string },
    @Body() dto: WizardLocationDto,
  ) {
    return this.onboarding.createWizardLocation(req.tenantId!, dto);
  }

  // ── POST /onboarding/wizard/service ──────────────────────────────────────
  /** Faz 21 Adım 2: Hizmet oluştur (oto-kategori "Genel") */
  @Post('wizard/service')
  @HttpCode(HttpStatus.CREATED)
  createService(
    @Req() req: { tenantId?: string },
    @Body() dto: WizardServiceDto,
  ) {
    return this.onboarding.createWizardService(req.tenantId!, dto);
  }

  // ── POST /onboarding/wizard/staff ─────────────────────────────────────────
  /** Faz 21 Adım 3: Personel oluştur */
  @Post('wizard/staff')
  @HttpCode(HttpStatus.CREATED)
  createStaff(
    @Req() req: { tenantId?: string },
    @Body() dto: WizardStaffDto,
  ) {
    return this.onboarding.createWizardStaff(req.tenantId!, dto);
  }
}
