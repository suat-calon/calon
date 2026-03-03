import {
  Controller,
  Get,
  Post,
  Put,
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
  ApiNotFoundResponse,
} from '@nestjs/swagger';

import { StaffService }         from './staff.service';
import { CreateStaffDto }       from './dto/create-staff.dto';
import { ListStaffQueryDto }    from './dto/list-staff-query.dto';
import { SetWorkingHoursDto }   from './dto/set-working-hours.dto';
import { CreateShiftDto, ListShiftsQueryDto } from './dto/create-shift.dto';
import { CurrentTenant }        from '../../common/decorators/current-tenant.decorator';
import { WriteOperation }       from '../billing/decorators/write-operation.decorator';

/**
 * STAFF CONTROLLER
 * ─────────────────────────────────────────────────────────────────────────────
 * Güvenlik:
 *   • Tüm endpoint'ler TenantGuard ile korunur (@Public() YOK)
 *   • tenantId SADECE @CurrentTenant()'dan (JWT), body/query'den ASLA
 *
 * Rota tasarımı:
 *   • Statik segmentler (:id/:working-hours, :id/shifts) parametre
 *     segmentlerinden ÖNCE tanımlanır → NestJS routing çakışması yok
 * ─────────────────────────────────────────────────────────────────────────────
 */
@ApiTags('Staff — Personel Yönetimi')
@ApiBearerAuth()
@Controller('staff')
export class StaffController {
  constructor(private readonly staffService: StaffService) {}

  // ── POST / ────────────────────────────────────────────────────────────────

  @Post()
  @WriteOperation()
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({ summary: 'Yeni personel profili oluştur' })
  @ApiCreatedResponse({ description: 'Personel başarıyla oluşturuldu' })
  create(
    @CurrentTenant() tenantId: string,
    @Body()          dto:      CreateStaffDto,
  ) {
    return this.staffService.create(tenantId, dto);
  }

  // ── GET / ─────────────────────────────────────────────────────────────────

  @Get()
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Personel listesi (sayfalı, arama + lokasyon filtresi)' })
  @ApiOkResponse({ description: 'Personel listesi başarıyla getirildi' })
  findAll(
    @CurrentTenant() tenantId: string,
    @Query()         query:    ListStaffQueryDto,
  ) {
    return this.staffService.findAll(tenantId, query);
  }

  // ── GET /:id ──────────────────────────────────────────────────────────────

  @Get(':id')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Personel detayını getir (çalışma saatleri dahil)' })
  @ApiOkResponse({ description: 'Personel başarıyla getirildi' })
  @ApiNotFoundResponse({ description: 'Personel bulunamadı' })
  findOne(
    @CurrentTenant()            tenantId: string,
    @Param('id', ParseUUIDPipe) id:       string,
  ) {
    return this.staffService.findOne(tenantId, id);
  }

  // ── PUT /:id/working-hours ────────────────────────────────────────────────

  /**
   * Personelin haftalık çalışma saatlerini toplu günceller.
   * Gönderilen günler upsert edilir; gönderilmeyen günler dokunulmaz.
   * İdempotent: Aynı istek birden fazla gönderilirse sonuç aynıdır.
   */
  @Put(':id/working-hours')
  @WriteOperation()
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Haftalık çalışma saatlerini güncelle (upsert)' })
  @ApiOkResponse({ description: 'Çalışma saatleri başarıyla güncellendi' })
  @ApiNotFoundResponse({ description: 'Personel bulunamadı' })
  setWorkingHours(
    @CurrentTenant()            tenantId: string,
    @Param('id', ParseUUIDPipe) staffId:  string,
    @Body()                     dto:      SetWorkingHoursDto,
  ) {
    return this.staffService.setWorkingHours(tenantId, staffId, dto);
  }

  // ── POST /:id/shifts ──────────────────────────────────────────────────────

  /**
   * Personele özel vardiya / istisna gün ekler.
   * Kullanım: izin günü, farklı saat diliminde fazla mesai, rapor gibi
   * olağandışı programlama durumları için.
   */
  @Post(':id/shifts')
  @WriteOperation()
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({ summary: 'Personele özel vardiya ekle (izin, rapor, fazla mesai)' })
  @ApiCreatedResponse({ description: 'Vardiya başarıyla oluşturuldu' })
  @ApiNotFoundResponse({ description: 'Personel bulunamadı' })
  createShift(
    @CurrentTenant()            tenantId: string,
    @Param('id', ParseUUIDPipe) staffId:  string,
    @Body()                     dto:      CreateShiftDto,
  ) {
    return this.staffService.createShift(tenantId, staffId, dto);
  }

  // ── GET /:id/shifts ───────────────────────────────────────────────────────

  @Get(':id/shifts')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Personel vardiyalarını listele (tarih aralığı filtresi)' })
  @ApiOkResponse({ description: 'Vardiya listesi başarıyla getirildi' })
  @ApiNotFoundResponse({ description: 'Personel bulunamadı' })
  listShifts(
    @CurrentTenant()            tenantId: string,
    @Param('id', ParseUUIDPipe) staffId:  string,
    @Query()                    query:    ListShiftsQueryDto,
  ) {
    return this.staffService.listShifts(tenantId, staffId, query);
  }
}
