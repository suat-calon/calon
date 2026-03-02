/**
 * GALLERY SERVICE — Öncesi/Sonrası Fotoğraf Yönetimi
 * ─────────────────────────────────────────────────────────────────────────────
 * Sağlık / Biyometrik Veri Yönetimi:
 *   • Bu servisteki veriler KVKK Madde 6 kapsamında "özel nitelikli kişisel veri"dir.
 *   • Fotoğraf URL'leri S3 / Object Storage'dan gelir; bu servis yalnızca
 *     URL metadata'sını veritabanına kaydeder (dosya yükleme yapılmaz).
 *   • Controller seviyesinde TenantGuard koruması zorunludur.
 *
 * Sağlanan işlemler:
 *   • addPhoto()             — Yeni fotoğraf URL kaydı
 *   • findByCustomer()       — Müşteriye ait fotoğraflar
 *   • findByAppointment()    — Randevuya ait fotoğraflar
 *
 * NOT: Silme işlemi bu serviste tanımlanmamıştır.
 *   Fotoğraf soft-delete → CustomerService.handleDeletionRequest() içinde
 *   GDPR akışının bir parçası olarak otomatik yönetilir.
 * ─────────────────────────────────────────────────────────────────────────────
 */

import { Injectable, NotFoundException } from '@nestjs/common';
import { CustomerPhoto }                 from '@prisma/client';

import { PrismaService } from '../../common/prisma.service';
import { AddPhotoDto }   from './dto/add-photo.dto';

@Injectable()
export class GalleryService {
  constructor(private readonly prisma: PrismaService) {}

  // ── addPhoto ─────────────────────────────────────────────────────────────────

  /**
   * Yeni bir öncesi/sonrası fotoğraf kaydı ekler.
   *
   * • Müşteri tenant'a ait ve aktif mi → doğrular
   * • Gerçek dosya yükleme bu metodun sorumluluğunda değildir.
   *   Frontend/client, S3 presigned URL ile doğrudan yükler; bu endpoint
   *   yalnızca sonuç URL'ini DB'ye kaydeder.
   */
  async addPhoto(
    tenantId: string,
    dto:      AddPhotoDto,
    actorId?: string,
  ): Promise<CustomerPhoto> {
    // Müşteri doğrulama — findUnique middleware dışı → manual kontrol
    const customer = await this.prisma.customer.findUnique({
      where: { id: dto.customerId },
    });

    if (!customer || customer.tenantId !== tenantId || customer.isDeleted) {
      throw new NotFoundException('Müşteri bulunamadı');
    }

    return this.prisma.customerPhoto.create({
      data: {
        tenantId,
        customerId:    dto.customerId,
        appointmentId: dto.appointmentId ?? null,
        photoType:     dto.photoType,
        url:           dto.url,
        thumbnailUrl:  dto.thumbnailUrl ?? null,
        bodyArea:      dto.bodyArea     ?? null,
        notes:         dto.notes        ?? null,
        takenAt:       dto.takenAt ? new Date(dto.takenAt) : new Date(),
      },
    });
  }

  // ── findByCustomer ───────────────────────────────────────────────────────────

  /**
   * Müşteriye ait tüm aktif fotoğrafları getirir (çekim tarihi sıralı).
   * Middleware: customerPhoto → TENANT_SCOPED_MODELS + SOFT_DELETE_MODELS
   *             → tenantId ve isDeleted:false otomatik filtre
   */
  async findByCustomer(tenantId: string, customerId: string): Promise<CustomerPhoto[]> {
    // Müşteri tenant kontrolü
    const customer = await this.prisma.customer.findUnique({
      where: { id: customerId },
    });

    if (!customer || customer.tenantId !== tenantId || customer.isDeleted) {
      throw new NotFoundException('Müşteri bulunamadı');
    }

    return this.prisma.customerPhoto.findMany({
      where:   { tenantId, customerId, isDeleted: false },
      orderBy: { takenAt: 'asc' },
    });
  }

  // ── findByAppointment ────────────────────────────────────────────────────────

  /**
   * Randevuya ait tüm aktif fotoğrafları getirir.
   */
  async findByAppointment(tenantId: string, appointmentId: string): Promise<CustomerPhoto[]> {
    return this.prisma.customerPhoto.findMany({
      where:   { tenantId, appointmentId, isDeleted: false },
      orderBy: { takenAt: 'asc' },
    });
  }
}
