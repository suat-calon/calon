/**
 * ONBOARDING CONTROLLER — Self-Onboarding Wizard Endpoint'leri
 * ──────────────────────────────────────────────────────────────────────────────
 * Base: /api/v1/onboarding
 *
 * Tüm endpoint'ler @Public() → TenantGuard atlanır (unauthenticated erişim).
 * setup-wizard hariç: o JWT gerektirmez ama tenantId'yi token'dan alır.
 * ──────────────────────────────────────────────────────────────────────────────
 */

import {
  Controller,
  Post,
  Body,
  Headers,
  Req,
  HttpCode,
  HttpStatus,
  BadRequestException,
} from '@nestjs/common';

import { Public }              from '../iam/guards/tenant.guard';
import { AllowPastDue }        from '../billing/decorators/allow-past-due.decorator';
import { OnboardingService }   from './onboarding.service';
import { RegisterOnboardingDto } from './dto/register-onboarding.dto';
import { SetupWizardDto }        from './dto/setup-wizard.dto';

@AllowPastDue()
@Controller('onboarding')
export class OnboardingController {
  constructor(private readonly onboarding: OnboardingService) {}

  // ── POST /onboarding/register ─────────────────────────────────────────────
  /**
   * Yeni kullanıcı + tenant kaydı.
   * Unauthenticated endpoint: JWT gerekmez.
   */
  @Public()
  @Post('register')
  @HttpCode(HttpStatus.CREATED)
  async register(@Body() dto: RegisterOnboardingDto) {
    return this.onboarding.register(dto);
  }

  // ── POST /onboarding/setup-wizard ─────────────────────────────────────────
  /**
   * Wizard veri kurulumu: Location, Services, Staff, WorkingHours, StaffServices.
   * JWT gerektirir (tenantId token'dan alınır).
   * Idempotency-Key header zorunlu — eksikse 400.
   */
  @Post('setup-wizard')
  @HttpCode(HttpStatus.OK)
  async setupWizard(
    @Headers('idempotency-key') idempotencyKey: string | undefined,
    @Req() req: { tenantId?: string },
    @Body() dto: SetupWizardDto,
  ) {
    if (!idempotencyKey || idempotencyKey.trim() === '') {
      throw new BadRequestException(
        'Idempotency-Key header zorunludur. ' +
        'Her wizard çağrısı için benzersiz bir UUID gönderin.',
      );
    }

    const tenantId = req.tenantId!; // TenantGuard zaten set etti
    return this.onboarding.setupWizard(tenantId, idempotencyKey.trim(), dto);
  }
}
