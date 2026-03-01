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
  ApiOkResponse,
  ApiBadRequestResponse,
  ApiNotFoundResponse,
  ApiConflictResponse,
} from '@nestjs/swagger';

import { AppointmentService }         from './appointment.service';
import { CreateAppointmentDto }        from './dto/create-appointment.dto';
import { UpdateAppointmentStatusDto }  from './dto/update-appointment-status.dto';
import { CurrentTenant }               from '../../../common/decorators/current-tenant.decorator';
import { CurrentUser, CurrentUserPayload } from '../../../common/decorators/current-user.decorator';

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
  constructor(private readonly appointmentService: AppointmentService) {}

  // ── POST / ────────────────────────────────────────────────────────────────

  @Post()
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

  // ── PATCH /:id/status ─────────────────────────────────────────────────────

  @Patch(':id/status')
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
