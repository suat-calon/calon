/**
 * ACQUIRE HOLD DTO — Faz 23
 * POST /public/holds
 */

import { IsISO8601, IsUUID } from 'class-validator';

export class AcquireHoldDto {
  /** Tenant kimliği (booking sayfasından salon ID'si olarak gelir) */
  @IsUUID('4')
  tenantId!: string;

  /** Personel kimliği */
  @IsUUID('4')
  staffId!: string;

  /** Hizmet kimliği (endTime hesabı için) */
  @IsUUID('4')
  serviceId!: string;

  /** Randevu başlangıç zamanı (UTC ISO 8601) */
  @IsISO8601()
  startTime!: string;
}
