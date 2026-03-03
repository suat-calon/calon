/**
 * CUSTOMER CONTROLLER — CRM Müşteri Yönetimi
 * ─────────────────────────────────────────────────────────────────────────────
 * Güvenlik:
 *   • Tüm endpoint'ler TenantGuard ile korunur (@Public() YOK)
 *   • tenantId SADECE @CurrentTenant()'dan (JWT) — body/query'den asla
 *   • GDPR silme: DELETE /customers/:id/gdpr → 204 No Content
 * ─────────────────────────────────────────────────────────────────────────────
 */

import {
  Controller,
  Post,
  Get,
  Delete,
  Param,
  Body,
  Query,
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
  ApiNoContentResponse,
  ApiNotFoundResponse,
} from '@nestjs/swagger';

import { CustomerService }        from './customer.service';
import { CreateCustomerDto }      from './dto/create-customer.dto';
import { ListCustomersQueryDto }  from './dto/list-customers-query.dto';
import { CurrentTenant }          from '../../common/decorators/current-tenant.decorator';
import { CurrentUser, CurrentUserPayload } from '../../common/decorators/current-user.decorator';
import { WriteOperation }         from '../billing/decorators/write-operation.decorator';

@ApiTags('CRM — Müşteriler')
@ApiBearerAuth()
@Controller('customers')
export class CustomerController {
  constructor(private readonly customerService: CustomerService) {}

  // ── POST /customers ──────────────────────────────────────────────────────────

  @Post()
  @WriteOperation()
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({ summary: 'Yeni müşteri kaydı oluştur' })
  @ApiCreatedResponse({ description: 'Müşteri başarıyla oluşturuldu' })
  create(
    @CurrentTenant() tenantId: string,
    @CurrentUser()   user:     CurrentUserPayload,
    @Body()          dto:      CreateCustomerDto,
  ) {
    return this.customerService.create(tenantId, dto, user.id);
  }

  // ── GET /customers ───────────────────────────────────────────────────────────

  @Get()
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Müşteri listesi (sayfalandırılmış + arama)' })
  @ApiOkResponse({ description: 'Müşteri listesi ve toplam kayıt sayısı' })
  findAll(
    @CurrentTenant() tenantId: string,
    @Query()         query:    ListCustomersQueryDto,
  ) {
    return this.customerService.findAll(tenantId, query);
  }

  // ── GET /customers/:id ───────────────────────────────────────────────────────

  @Get(':id')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Müşteri detayı' })
  @ApiOkResponse({ description: 'Müşteri kaydı' })
  @ApiNotFoundResponse({ description: 'Müşteri bulunamadı' })
  findOne(
    @CurrentTenant()            tenantId: string,
    @Param('id', ParseUUIDPipe) id:       string,
  ) {
    return this.customerService.findOne(tenantId, id);
  }

  // ── DELETE /customers/:id/gdpr ───────────────────────────────────────────────

  /**
   * KVKK/GDPR "Kişisel Verilerin Silinmesi" (Right to Erasure) talebi.
   *
   * • PII anonimleştirilir — geri döndürülemez
   * • Finansal kayıtlar korunur (isDeleted: true ile gizlenir)
   * • Tüm işlemler AuditLog'a GDPR_DELETION olarak yazılır
   * • 204 No Content döner (silinmiş nesne geri dönmez)
   */
  @Delete(':id/gdpr')
  @WriteOperation()
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'KVKK/GDPR silme hakkı — PII anonimleştirme' })
  @ApiNoContentResponse({ description: 'PII başarıyla anonimleştirildi' })
  @ApiNotFoundResponse({ description: 'Müşteri bulunamadı' })
  async handleDeletionRequest(
    @CurrentTenant()            tenantId: string,
    @CurrentUser()              user:     CurrentUserPayload,
    @Param('id', ParseUUIDPipe) id:       string,
  ): Promise<void> {
    await this.customerService.handleDeletionRequest(id, tenantId, user.id);
  }
}
