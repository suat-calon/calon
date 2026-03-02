/**
 * CONSENT FORM CONTROLLER — Yasal Onam Formu API (Immutable)
 * ─────────────────────────────────────────────────────────────────────────────
 * YASAL KURAL:
 *   ⛔ PUT / PATCH endpoint'i YOKTUR — onam formları değiştirilemez
 *   ⛔ DELETE endpoint'i YOKTUR      — onam formları silinemez
 *
 * Güvenlik:
 *   • Tüm endpoint'ler TenantGuard ile korunur
 *   • tenantId SADECE @CurrentTenant()'dan (JWT)
 *   • ipAddress / userAgent → dijital imza kanıtı zinciri için otomatik yakalanır
 * ─────────────────────────────────────────────────────────────────────────────
 */

import {
  Controller,
  Post,
  Get,
  Param,
  Body,
  Headers,
  HttpCode,
  HttpStatus,
  ParseUUIDPipe,
} from '@nestjs/common';
import {
  ApiTags,
  ApiBearerAuth,
  ApiOperation,
  ApiCreatedResponse,
  ApiOkResponse,
  ApiNotFoundResponse,
  ApiHeader,
} from '@nestjs/swagger';

import { ConsentFormService }    from './consent-form.service';
import { CreateConsentFormDto }  from './dto/create-consent-form.dto';
import { CurrentTenant }         from '../../common/decorators/current-tenant.decorator';

@ApiTags('CRM — Onam Formları')
@ApiBearerAuth()
@Controller('consent-forms')
export class ConsentFormController {
  constructor(private readonly consentFormService: ConsentFormService) {}

  // ── POST /consent-forms ──────────────────────────────────────────────────────

  /**
   * Yeni onam formu oluşturur.
   * ipAddress ve userAgent otomatik olarak request header'larından yakalanır.
   */
  @Post()
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({ summary: 'Yeni onam formu oluştur (immutable — değiştirilemez)' })
  @ApiCreatedResponse({ description: 'Onam formu başarıyla kaydedildi' })
  @ApiNotFoundResponse({ description: 'Müşteri bulunamadı' })
  @ApiHeader({ name: 'x-forwarded-for', required: false, description: 'İstemci IP adresi (proxy arkasında)' })
  create(
    @CurrentTenant()                      tenantId:   string,
    @Body()                               dto:        CreateConsentFormDto,
    @Headers('x-forwarded-for')           ipHeader?:  string,
    @Headers('user-agent')                userAgent?: string,
  ) {
    // X-Forwarded-For virgülle ayrılmış IP listesi olabilir; ilkini al
    const ipAddress = ipHeader?.split(',')[0]?.trim();
    return this.consentFormService.create(tenantId, dto, ipAddress, userAgent);
  }

  // ── GET /consent-forms/by-customer/:customerId ───────────────────────────────
  // DIKKAT: Bu route ':id' parametresinden önce tanımlanmalıdır (NestJS route sırası)

  @Get('by-customer/:customerId')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Müşteriye ait onam formları listesi' })
  @ApiOkResponse({ description: 'Onam formları listesi (imzalanma tarihi sıralı)' })
  @ApiNotFoundResponse({ description: 'Müşteri bulunamadı' })
  findByCustomer(
    @CurrentTenant()                         tenantId:   string,
    @Param('customerId', ParseUUIDPipe)      customerId: string,
  ) {
    return this.consentFormService.findByCustomer(tenantId, customerId);
  }

  // ── GET /consent-forms/:id ───────────────────────────────────────────────────

  @Get(':id')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Onam formu detayı' })
  @ApiOkResponse({ description: 'Onam formu kaydı' })
  @ApiNotFoundResponse({ description: 'Onam formu bulunamadı' })
  findOne(
    @CurrentTenant()            tenantId: string,
    @Param('id', ParseUUIDPipe) id:       string,
  ) {
    return this.consentFormService.findOne(tenantId, id);
  }

  // ⛔ PUT / PATCH endpoint'i bu controller'da tanımlanmamıştır — YASAL KURAL
  // ⛔ DELETE endpoint'i bu controller'da tanımlanmamıştır — YASAL KURAL
}
