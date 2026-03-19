/**
 * PUBLIC BOOKING DTO — P10.3.2 Contract Hardening
 * ──────────────────────────────────────────────────────────────────────────────
 * POST /public/book
 * tenantId body'ye ASLA girmez — slug üzerinden backend çözer.
 *
 * Faz 23: holdId opsiyonel (Phase 1 geriye uyumluluk).
 *   Var → hold-based commit (consumeHold + create aynı DB transaction içinde).
 *   Yok → legacy direct commit (Faz 16 davranışı).
 * Phase 3'te holdId zorunlu hale gelecek; @IsOptional() kaldırılacak.
 */

import {
  IsUUID,
  IsISO8601,
  IsString,
  IsEmail,
  IsOptional,
  IsNotEmpty,
  IsPhoneNumber,
  MinLength,
  MaxLength,
} from 'class-validator';

export class BookPublicDto {
  /** Salon slug — backend tenantId'ye çevirir; UUID asla frontend'e sızmaz */
  @IsString()
  @IsNotEmpty()
  @MaxLength(100)
  slug!: string;

  /** Lokasyon UUID */
  @IsUUID('4')
  locationId!: string;

  /** Seçilen personel UUID */
  @IsUUID('4')
  staffId!: string;

  /** Seçilen hizmet UUID */
  @IsUUID('4')
  serviceId!: string;

  /** ISO 8601 tarih+saat — UTC ("2026-03-15T10:00:00.000Z") */
  @IsISO8601()
  startTime!: string;

  /** Müşteri adı */
  @IsString()
  @IsNotEmpty()
  @MinLength(2)
  @MaxLength(80)
  firstName!: string;

  /** Müşteri soyadı */
  @IsString()
  @IsNotEmpty()
  @MinLength(2)
  @MaxLength(80)
  lastName!: string;

  /**
   * Müşteri telefon.
   * @IsPhoneNumber('TR') — libphonenumber-js ile TR formatı doğrulanır.
   * Kabul: 05XX..., +905XX..., 905XX...
   */
  @IsPhoneNumber('TR')
  @MaxLength(20)
  phone!: string;

  /** Müşteri e-posta (opsiyonel) */
  @IsOptional()
  @IsEmail()
  email?: string;

  /** Ek not */
  @IsOptional()
  @IsString()
  @MaxLength(500)
  notes?: string;

  /** Faz 18: Referral kodu (opsiyonel — ?ref= query parametresinden gelir) */
  @IsOptional()
  @IsString()
  @MaxLength(20)
  referralCode?: string;

  /**
   * Faz 23: DB-backed hold UUID (Phase 1 — opsiyonel).
   * POST /public/holds'tan alınan holdId buraya gönderilir.
   * Var: hold-based commit (consumeHold + randevu tek transaction).
   * Yok: legacy direct commit (Faz 16 davranışı — Phase 3'te kaldırılacak).
   */
  @IsOptional()
  @IsUUID('4')
  holdId?: string;
}
