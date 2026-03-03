import {
  Controller,
  Post,
  Patch,
  Param,
  Body,
  HttpCode,
  HttpStatus,
  ParseUUIDPipe,
} from '@nestjs/common';
import {
  ApiTags,
  ApiBearerAuth,
  ApiOperation,
  ApiCreatedResponse,
  ApiNoContentResponse,
  ApiOkResponse,
  ApiBadRequestResponse,
  ApiNotFoundResponse,
  ApiConflictResponse,
} from '@nestjs/swagger';

import { AppointmentService }         from './appointment.service';
import { AppointmentLockService }     from './appointment-lock.service';
import { CreateAppointmentDto }       from './dto/create-appointment.dto';
import { HoldSlotDto }                from './dto/hold-slot.dto';
import { UpdateAppointmentStatusDto } from './dto/update-appointment-status.dto';
import { RescheduleAppointmentDto }   from './dto/reschedule-appointment.dto';
import { CurrentTenant }              from '../../../common/decorators/current-tenant.decorator';
import { CurrentUser, CurrentUserPayload } from '../../../common/decorators/current-user.decorator';
import { WriteOperation }             from '../../billing/decorators/write-operation.decorator';

/**
 * APPOINTMENT CONTROLLER
 * ─────────────────────────────────────────────────────────────────────────────
 * Güvenlik:
 *   • Tüm endpoint'ler TenantGuard ile korunur (@Public() YOK)
 *   • tenantId SADECE @CurrentTenant()'dan (doğrulanmış JWT), body/query'den ASLA
 * ─────────────────────────────────────────────────────────────────────────────
 */
@ApiTags('Appointments')
@ApiBearerAuth()
@Controller('appointments')
export class AppointmentController {
  constructor(
    private readonly appointmentService: AppointmentService,
    private readonly lockService:        AppointmentLockService,
  ) {}

  // ── POST /hold ────────────────────────────────────────────────────────────

  /**
   * Redis Soft-Lock: Kullanıcı ödeme/onay sayfasına geçerken slotu 5 dakika kilitler.
   *
   * 204: Kilit başarıyla oluşturuldu.
   * 409: Aynı tenant/personel/saat kombinasyonu zaten kilitli.
   */
  @Post('hold')
  @WriteOperation()
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Randevu slotunu geçici kilitle (5 dk Redis TTL)' })
  @ApiNoContentResponse({ description: 'Slot başarıyla kilitlendi' })
  @ApiConflictResponse({ description: 'Bu saat dilimi geçici olarak kilitli (başkası işlemde)' })
  async holdSlot(
    @CurrentTenant() tenantId: string,
    @CurrentUser()   user:     CurrentUserPayload,
    @Body()          dto:      HoldSlotDto,
  ): Promise<void> {
    await this.lockService.holdSlot(
      tenantId,
      dto.staffId,
      dto.startTime,
      user.id,
    );
  }

  // ── POST / ────────────────────────────────────────────────────────────────

  @Post()
  @WriteOperation()
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({ summary: 'Yeni randevu oluştur' })
  @ApiCreatedResponse({ description: 'Randevu başarıyla oluşturuldu' })
  @ApiConflictResponse({ description: 'Seçilen saat bu personel veya oda için müsait değil' })
  create(
    @CurrentTenant() tenantId: string,
    @CurrentUser()   user:     CurrentUserPayload,
    @Body()          dto:      CreateAppointmentDto,
  ) {
    return this.appointmentService.create(tenantId, dto, user.id);
  }

  // ── PATCH /:id/reschedule ─────────────────────────────────────────────────

  /**
   * Randevuyu yeni bir saat dilimine taşır.
   *
   * Sadece PENDING ve CONFIRMED randevular taşınabilir.
   * Yeni slot için çakışma kontrolü ve Redis concurrency lock uygulanır.
   *
   * 200: Randevu başarıyla taşındı.
   * 400: Randevu bu durumda taşınamaz (örn. COMPLETED/CANCELLED).
   * 404: Randevu bulunamadı.
   * 409: Yeni saat dilimi meşgul.
   */
  @Patch(':id/reschedule')
  @WriteOperation()
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Randevuyu yeni saat dilimine taşı (Faz 14)' })
  @ApiOkResponse({ description: 'Randevu başarıyla taşındı' })
  @ApiBadRequestResponse({ description: 'Bu randevu taşınamaz (durum uygun değil)' })
  @ApiNotFoundResponse({ description: 'Randevu bulunamadı' })
  @ApiConflictResponse({ description: 'Yeni saat dilimi bu personel için müsait değil' })
  reschedule(
    @CurrentTenant()            tenantId: string,
    @CurrentUser()              user:     CurrentUserPayload,
    @Param('id', ParseUUIDPipe) id:       string,
    @Body()                     dto:      RescheduleAppointmentDto,
  ) {
    return this.appointmentService.reschedule(
      tenantId,
      id,
      dto,
      user.id,
      user.role,
    );
  }

  // ── PATCH /:id/status ─────────────────────────────────────────────────────

  @Patch(':id/status')
  @WriteOperation()
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Randevu durumunu güncelle' })
  @ApiOkResponse({ description: 'Durum başarıyla güncellendi' })
  @ApiBadRequestResponse({ description: 'Geçersiz durum geçişi (XState kuralı ihlali)' })
  @ApiNotFoundResponse({ description: 'Randevu bulunamadı' })
  updateStatus(
    @CurrentTenant()               tenantId: string,
    @CurrentUser()                 user:     CurrentUserPayload,
    @Param('id', ParseUUIDPipe)    id:       string,
    @Body()                        dto:      UpdateAppointmentStatusDto,
  ) {
    return this.appointmentService.updateStatus(
      tenantId,
      id,
      dto,
      user.id,
      user.role,
    );
  }
}
