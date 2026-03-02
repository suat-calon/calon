/**
 * GALLERY CONTROLLER — Öncesi/Sonrası Fotoğraf API
 * ─────────────────────────────────────────────────────────────────────────────
 * Özel Nitelikli Veri (Sağlık/Biyometrik):
 *   • Bu endpoint'ler KVKK Madde 6 kapsamındaki sağlık verilerine erişir.
 *   • Tüm endpoint'ler TenantGuard ile korunur — kimliği doğrulanmış
 *     ve tenant yetkisi olan personel dışında erişim KESİNLİKLE reddedilir.
 *   • @Public() dekoratörü bu controller'da ASLA kullanılmaz.
 *
 * Mimari NOT:
 *   • Bu servis S3/Object Storage URL'lerini kaydeder; dosya yükleme yapmaz.
 *   • Presigned URL üretimi ayrı bir endpoint'te yapılır (v2 planı).
 *   • Fotoğraf silme KVKK akışı içinde CustomerService.handleDeletionRequest()
 *     tarafından otomatik yönetilir.
 * ─────────────────────────────────────────────────────────────────────────────
 */

import {
  Controller,
  Post,
  Get,
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
  ApiNotFoundResponse,
} from '@nestjs/swagger';

import { GalleryService }  from './gallery.service';
import { AddPhotoDto }     from './dto/add-photo.dto';
import { CurrentTenant }   from '../../common/decorators/current-tenant.decorator';
import { CurrentUser, CurrentUserPayload } from '../../common/decorators/current-user.decorator';

@ApiTags('CRM — Galeri (Öncesi/Sonrası Fotoğraflar)')
@ApiBearerAuth()
@Controller('gallery')
export class GalleryController {
  constructor(private readonly galleryService: GalleryService) {}

  // ── POST /gallery/photos ─────────────────────────────────────────────────────

  /**
   * Yeni öncesi/sonrası fotoğraf URL kaydı ekler.
   * Dosya yükleme bu endpoint'in sorumluluğunda değildir.
   * Client, S3 presigned URL ile doğrudan yükler; bu endpoint yalnızca
   * yükleme sonrası URL'yi veritabanına kaydeder.
   */
  @Post('photos')
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({ summary: 'Fotoğraf URL kaydı ekle (özel nitelikli sağlık verisi)' })
  @ApiCreatedResponse({ description: 'Fotoğraf kaydı oluşturuldu' })
  @ApiNotFoundResponse({ description: 'Müşteri bulunamadı' })
  addPhoto(
    @CurrentTenant() tenantId: string,
    @CurrentUser()   user:     CurrentUserPayload,
    @Body()          dto:      AddPhotoDto,
  ) {
    return this.galleryService.addPhoto(tenantId, dto, user.id);
  }

  // ── GET /gallery/photos/by-customer/:customerId ──────────────────────────────
  // DIKKAT: Bu route 'photos/by-appointment/:appointmentId' ile çakışmamak için
  //         'by-customer/' prefix'i kullanılır ve önce tanımlanır.

  @Get('photos/by-customer/:customerId')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Müşteriye ait tüm fotoğraflar (öncesi/sonrası)' })
  @ApiOkResponse({ description: 'Fotoğraf listesi (çekim tarihi sıralı)' })
  @ApiNotFoundResponse({ description: 'Müşteri bulunamadı' })
  findByCustomer(
    @CurrentTenant()                        tenantId:   string,
    @Param('customerId', ParseUUIDPipe)     customerId: string,
  ) {
    return this.galleryService.findByCustomer(tenantId, customerId);
  }

  // ── GET /gallery/photos/by-appointment/:appointmentId ────────────────────────

  @Get('photos/by-appointment/:appointmentId')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Randevuya ait tüm fotoğraflar' })
  @ApiOkResponse({ description: 'Fotoğraf listesi (çekim tarihi sıralı)' })
  findByAppointment(
    @CurrentTenant()                          tenantId:      string,
    @Param('appointmentId', ParseUUIDPipe)    appointmentId: string,
  ) {
    return this.galleryService.findByAppointment(tenantId, appointmentId);
  }
}
