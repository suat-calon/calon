/**
 * ACQUIRE HOLD DTO — P10.3.2 Contract Hardening
 * POST /public/holds
 */

import { IsISO8601, IsNotEmpty, IsString, IsUUID, MaxLength } from 'class-validator';

export class AcquireHoldDto {
  /** Salon slug — backend tenantId'ye çevirir; UUID asla frontend'e sızmaz */
  @IsString()
  @IsNotEmpty()
  @MaxLength(100)
  slug!: string;

  /** Seçilen personel UUID */
  @IsUUID('4')
  staffId!: string;

  /** Seçilen hizmet UUID (endTime hesabı için backend kullanır) */
  @IsUUID('4')
  serviceId!: string;

  /** Randevu başlangıç zamanı (UTC ISO 8601) */
  @IsISO8601()
  startTime!: string;
}
