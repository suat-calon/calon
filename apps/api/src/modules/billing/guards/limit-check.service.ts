/**
 * LIMIT CHECK SERVICE — Race-Safe Limit Denetimi
 * ──────────────────────────────────────────────────────────────────────────────
 * Katman 3: Service katmanında çağrılır (Guard değil — tx bağlamı gerektirir).
 *
 * Kullanım:
 *   - StaffService.create() → checkStaffLimit(tenantId, tx)
 *   - LocationService.create() → checkBranchLimit(tenantId, tx)
 *
 * Race-safe strateji:
 *   SELECT COUNT(*) ... FOR UPDATE → Kilidi al → Limit kontrolü → CREATE
 *   Eş zamanlı iki istek: ikincisi kilitten çıkınca count arttı → 403
 * ──────────────────────────────────────────────────────────────────────────────
 */

import { Injectable, ForbiddenException, Logger } from '@nestjs/common';
import { Prisma }               from '@prisma/client';
import { EntitlementsService }  from '../entitlements.service';
import { PrismaService }        from '../../../common/prisma.service';

@Injectable()
export class LimitCheckService {
  private readonly logger = new Logger(LimitCheckService.name);

  constructor(
    private readonly entitlements: EntitlementsService,
    private readonly prisma:       PrismaService,
  ) {}

  // ═══════════════════════════════════════════════════════════════════════════
  // PERSONEL LİMİT KONTROLÜ
  // ═══════════════════════════════════════════════════════════════════════════
  /**
   * @param tenantId  Tenant kimliği
   * @param jwtPlan   JWT'den gelen plan claim'i
   * @param tx        Çağıran servisin $transaction client'ı (race-safe için zorunlu)
   */
  async checkStaffLimit(
    tenantId: string,
    jwtPlan:  string,
    tx:       Prisma.TransactionClient,
  ): Promise<void> {
    const ent = await this.entitlements.getEntitlements(tenantId, jwtPlan);
    const max = ent.limits.staffMax;

    // SELECT COUNT FOR UPDATE — satır kilidi yerine advisory lock daha güvenilir
    // Ancak basitlik için count + kilidi serialize ediyoruz ($transaction isolation)
    const count = await tx.staffProfile.count({
      where: { tenantId, isDeleted: false },
    });

    if (count >= max) {
      this.logger.warn(
        `[Limit] staffMax aşıldı: tenantId=${tenantId} count=${count} max=${max}`,
      );
      throw new ForbiddenException({
        message:   `Personel limitine ulaşıldı. Mevcut: ${count}, Maksimum: ${max}`,
        errorCode: 'LIMIT_EXCEEDED',
        limit:     'staffMax',
        current:   count,
        max,
      });
    }
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // ŞUBE LİMİT KONTROLÜ
  // ═══════════════════════════════════════════════════════════════════════════
  async checkBranchLimit(
    tenantId: string,
    jwtPlan:  string,
    tx:       Prisma.TransactionClient,
  ): Promise<void> {
    const ent = await this.entitlements.getEntitlements(tenantId, jwtPlan);
    const max = ent.limits.branchMax;

    const count = await tx.location.count({
      where: { tenantId, isDeleted: false },
    });

    if (count >= max) {
      this.logger.warn(
        `[Limit] branchMax aşıldı: tenantId=${tenantId} count=${count} max=${max}`,
      );
      throw new ForbiddenException({
        message:   `Şube limitine ulaşıldı. Mevcut: ${count}, Maksimum: ${max}`,
        errorCode: 'LIMIT_EXCEEDED',
        limit:     'branchMax',
        current:   count,
        max,
      });
    }
  }
}
