/**
 * ACQUIRE HOLD DTO — Faz 23
 * POST /public/holds
 */

import { IsISO8601, IsString, IsUUID, MaxLength, MinLength } from 'class-validator';

export class AcquireHoldDto {
  /** Salon slug — backend tenantId'ye çevirir */
  @IsString()
  @MinLength(1)
  @MaxLength(100)
  slug!: string;

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
