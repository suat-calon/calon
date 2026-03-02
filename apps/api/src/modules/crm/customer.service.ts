/**
 * CUSTOMER SERVICE — CRM Müşteri Yönetimi
 * ─────────────────────────────────────────────────────────────────────────────
 * Sağladığı işlemler:
 *   • create()                — Yeni müşteri kaydı
 *   • findAll()               — Sayfalandırılmış + arama destekli listeleme
 *   • findOne()               — Tek müşteri detayı
 *   • handleDeletionRequest() — KVKK/GDPR "Silme Hakkı" (Right to Erasure)
 *
 * Güvenlik:
 *   • findUnique: Prisma middleware'den hariç → tenantId manuel kontrol zorunlu
 *   • tenantId SADECE TenantGuard'dan (JWT); body/query'den asla alınmaz
 *
 * GDPR Prensibi:
 *   • PII yok edilir (anonimleştirme), finansal kayıtlar korunur (isDeleted: true)
 *   • Tüm adımlar tek $transaction içinde atomik olarak yürütülür
 * ─────────────────────────────────────────────────────────────────────────────
 */

import { Injectable, NotFoundException } from '@nestjs/common';
import { Prisma, Customer }              from '@prisma/client';
import { randomUUID }                    from 'node:crypto';

import { PrismaService }          from '../../common/prisma.service';
import { CreateCustomerDto }      from './dto/create-customer.dto';
import { ListCustomersQueryDto }  from './dto/list-customers-query.dto';

export interface PaginatedCustomers {
  data:  Customer[];
  total: number;
  take:  number;
  skip:  number;
}

@Injectable()
export class CustomerService {
  constructor(private readonly prisma: PrismaService) {}

  // ── create ──────────────────────────────────────────────────────────────────

  /**
   * Yeni müşteri oluşturur.
   * consentGiven = true ise consentDate otomatik olarak şu anki zaman olarak set edilir.
   */
  async create(
    tenantId: string,
    dto:      CreateCustomerDto,
    actorId?: string,
  ): Promise<Customer> {
    return this.prisma.customer.create({
      data: {
        tenantId,
        firstName:    dto.firstName,
        lastName:     dto.lastName,
        email:        dto.email       ?? null,
        phone:        dto.phone       ?? null,
        dateOfBirth:  dto.dateOfBirth ? new Date(dto.dateOfBirth) : null,
        gender:       dto.gender      ?? null,
        notes:        dto.notes       ?? null,
        consentGiven: dto.consentGiven ?? false,
        consentDate:  dto.consentGiven ? new Date() : null,
      },
    });
  }

  // ── findAll ──────────────────────────────────────────────────────────────────

  /**
   * Müşteri listesi — sayfalandırma + metin araması.
   * Middleware zaten tenantId ve isDeleted:false ekler; burada tekrarlanması güvenlik katmanı.
   */
  async findAll(
    tenantId: string,
    query:    ListCustomersQueryDto,
  ): Promise<PaginatedCustomers> {
    const take = query.take ?? 20;
    const skip = query.skip ?? 0;

    const where: Prisma.CustomerWhereInput = {
      tenantId,
      isDeleted: false,
      ...(query.search
        ? {
            OR: [
              { firstName: { contains: query.search, mode: 'insensitive' } },
              { lastName:  { contains: query.search, mode: 'insensitive' } },
              { email:     { contains: query.search, mode: 'insensitive' } },
              { phone:     { contains: query.search } },
            ],
          }
        : {}),
    };

    const [data, total] = await Promise.all([
      this.prisma.customer.findMany({
        where,
        take,
        skip,
        orderBy: { createdAt: 'desc' },
      }),
      this.prisma.customer.count({ where }),
    ]);

    return { data, total, take, skip };
  }

  // ── findOne ──────────────────────────────────────────────────────────────────

  /**
   * Tek müşteri kaydı.
   * findUnique Prisma middleware'den hariç → tenantId + isDeleted manuel kontrol.
   */
  async findOne(tenantId: string, id: string): Promise<Customer> {
    const customer = await this.prisma.customer.findUnique({ where: { id } });

    if (!customer || customer.tenantId !== tenantId || customer.isDeleted) {
      throw new NotFoundException('Müşteri bulunamadı');
    }

    return customer;
  }

  // ── handleDeletionRequest — KVKK/GDPR Silme Hakkı ───────────────────────────

  /**
   * Müşteri "Kişisel Verilerin Silinmesi" (Right to Erasure) talebi.
   *
   * Tek bir Prisma $transaction içinde sırasıyla:
   *   1. Müşteri doğrulaması (findUnique → manuel tenantId kontrolü)
   *   2. İlişkili randevuların TransactionLedger kayıtları → isDeleted: true
   *      (finansal veriler 10 yıl saklanır, kişisel veriyle bağlantısı korunur)
   *   3. Müşteriyle ilişkili fotoğraflar → isDeleted: true
   *      (biyometrik/sağlık verisi → özel nitelikli veri, KVKK Madde 6)
   *   4. Customer PII → kriptografik anonimleştirme
   *      (isim: ANONYMIZED_{uuid}, email/phone/avatarUrl: null)
   *   5. AuditLog → GDPR_DELETION aksiyonu (sistem seviyesi iz)
   *
   * Atomik: Herhangi bir adımda hata → tüm transaction geri alınır.
   */
  async handleDeletionRequest(
    customerId: string,
    tenantId:   string,
    actorId?:   string,
  ): Promise<void> {
    await this.prisma.$transaction(async (tx: Prisma.TransactionClient) => {

      // ── 1. Müşteri doğrulaması ───────────────────────────────────────────────
      // findUnique → middleware hariç → manual tenantId ve isDeleted kontrolü
      const customer = await tx.customer.findUnique({ where: { id: customerId } });

      if (!customer || customer.tenantId !== tenantId || customer.isDeleted) {
        throw new NotFoundException('Müşteri bulunamadı');
      }

      // ── 2. Finansal ledger soft-delete (bağlantıyı koru) ────────────────────
      // Randevular middleware ile tenantId+isDeleted filtreli — yalnızca aktif randevular
      const appointments = await tx.appointment.findMany({
        where:  { tenantId, customerId },
        select: { id: true },
      });

      const appointmentIds = appointments.map((a) => a.id);

      if (appointmentIds.length > 0) {
        await tx.transactionLedger.updateMany({
          where: { tenantId, appointmentId: { in: appointmentIds } },
          data:  { isDeleted: true },
        });
      }

      // ── 3. Fotoğrafları soft-delete et (KVKK Madde 6 — özel nitelikli veri) ─
      await tx.customerPhoto.updateMany({
        where: { tenantId, customerId },
        data:  { isDeleted: true },
      });

      // ── 4. PII Anonimleştirme ────────────────────────────────────────────────
      // Kriptografik olarak izlenemeyen benzersiz etiket — geri döndürülemez
      const anonymizedTag = `ANONYMIZED_${randomUUID()}`;

      await tx.customer.update({
        where: { id: customerId },
        data: {
          firstName:    anonymizedTag,
          lastName:     '',
          email:        null,
          phone:        null,
          avatarUrl:    null,
          dateOfBirth:  null,
          gender:       null,
          notes:        null,
          anonymizedAt: new Date(),
          isDeleted:    true,
          deletedAt:    new Date(),
        },
      });

      // ── 5. Denetim kaydı: GDPR_DELETION ─────────────────────────────────────
      // actorId = undefined → sistem aktörü (otomatik silme talebi)
      await tx.auditLog.create({
        data: {
          tenantId,
          entityType: 'Customer',
          entityId:   customerId,
          action:     'GDPR_DELETION',
          actorId:    actorId ?? undefined,
          before: {
            firstName: customer.firstName,
            lastName:  customer.lastName,
            email:     customer.email,
            phone:     customer.phone,
          },
          after: {
            firstName:    anonymizedTag,
            lastName:     '',
            email:        null,
            phone:        null,
            anonymizedAt: new Date().toISOString(),
          },
        },
      });
    });
  }
}
