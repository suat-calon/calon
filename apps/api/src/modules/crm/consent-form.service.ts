/**
 * CONSENT FORM SERVICE — Yasal Onam Formu Yönetimi (Immutable)
 * ─────────────────────────────────────────────────────────────────────────────
 * YASAL ZORUNLULUK — KESİNLİKLE UYMASI GEREKEN KURALLAR:
 *   ⛔ Update metodu YOKTUR — onam formları ASLA değiştirilemez
 *   ⛔ Delete metodu YOKTUR — onam formları ASLA silinemez
 *
 * Sağlanan işlemler (SADECE):
 *   • create()          — Yeni onam formu kaydı (anlık content snapshot)
 *   • findByCustomer()  — Müşteriye ait tüm formlar (okunur)
 *   • findOne()         — Tek form detayı (okunur)
 *
 * Yasal dayanak: KVKK Madde 3/1-a, GDPR Madde 7 — onam kanıtı değiştirilemez.
 * ConsentForm modeli isDeleted alanına sahip değildir; Prisma middleware
 * bu modele soft-delete filtresi uygulamaz.
 * ─────────────────────────────────────────────────────────────────────────────
 */

import { Injectable, NotFoundException } from '@nestjs/common';
import { ConsentForm }                   from '@prisma/client';

import { PrismaService }           from '../../common/prisma.service';
import { CreateConsentFormDto }    from './dto/create-consent-form.dto';

@Injectable()
export class ConsentFormService {
  constructor(private readonly prisma: PrismaService) {}

  // ── create ──────────────────────────────────────────────────────────────────

  /**
   * Yeni onam formu oluşturur.
   *
   * • Müşteri tenant'a ait mi ve aktif mi → doğrular (findUnique → manuel kontrol)
   * • content: Form içeriğinin anlık "snapshot"ı — geriye dönük değişikliklere karşı kanıt
   * • signedAt: Client'ın bildirdiği imza anı (sunucu saati değil; yasal geçerlilik için)
   * • ipAddress / userAgent: Dijital imza kanıtı zinciri
   */
  async create(
    tenantId:   string,
    dto:        CreateConsentFormDto,
    ipAddress?: string,
    userAgent?: string,
  ): Promise<ConsentForm> {
    // Müşteri doğrulama — findUnique middleware dışı → manual tenantId kontrolü
    const customer = await this.prisma.customer.findUnique({
      where: { id: dto.customerId },
    });

    if (!customer || customer.tenantId !== tenantId || customer.isDeleted) {
      throw new NotFoundException('Müşteri bulunamadı');
    }

    return this.prisma.consentForm.create({
      data: {
        tenantId,
        customerId:    dto.customerId,
        appointmentId: dto.appointmentId ?? null,
        formType:      dto.formType,
        content:       dto.content,
        signedAt:      new Date(dto.signedAt),
        ipAddress:     ipAddress ?? null,
        userAgent:     userAgent ?? null,
      },
    });
  }

  // ── findByCustomer ───────────────────────────────────────────────────────────

  /**
   * Müşteriye ait tüm onam formlarını getirir (kronolojik sıra).
   * Middleware: ConsentForm → TENANT_SCOPED_MODELS içinde → tenantId otomatik filtre
   */
  async findByCustomer(tenantId: string, customerId: string): Promise<ConsentForm[]> {
    // Müşteri tenant kontrolü
    const customer = await this.prisma.customer.findUnique({
      where: { id: customerId },
    });

    if (!customer || customer.tenantId !== tenantId || customer.isDeleted) {
      throw new NotFoundException('Müşteri bulunamadı');
    }

    return this.prisma.consentForm.findMany({
      where:   { tenantId, customerId },
      orderBy: { signedAt: 'desc' },
    });
  }

  // ── findOne ──────────────────────────────────────────────────────────────────

  /**
   * Tek onam formu detayı.
   * findUnique → middleware hariç → manual tenantId kontrolü.
   */
  async findOne(tenantId: string, id: string): Promise<ConsentForm> {
    const form = await this.prisma.consentForm.findUnique({ where: { id } });

    if (!form || form.tenantId !== tenantId) {
      throw new NotFoundException('Onam formu bulunamadı');
    }

    return form;
  }

  // ⛔ update() METODU YAZILMAMIŞIR — YASAL OLARAK YASAKTIR
  // ⛔ delete() METODU YAZILMAMIŞIR — YASAL OLARAK YASAKTIR
}
