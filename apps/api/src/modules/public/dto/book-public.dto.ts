/**
 * PUBLIC BOOKING DTO — Faz 16 + Faz 23
 * ──────────────────────────────────────────────────────────────────────────────
 * POST /public/book için giriş DTO'su.
 * tenantId body'den alınır (JWT yok — public endpoint).
 * IDOR riski yok: tenantId slug üzerinden zaten doğrulanmış olmalı.
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
  MinLength,
  MaxLength,
} from 'class-validator';

export class BookPublicDto {
  /** Salon slug — backend tenantId'ye çevirir; UUID asla frontend'e sızmaz */
  @IsString()
  @MinLength(1)
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
  @MinLength(1)
  @MaxLength(80)
  firstName!: string;

  /** Müşteri soyadı */
  @IsString()
  @MinLength(1)
  @MaxLength(80)
  lastName!: string;

  /** Müşteri telefon (tenant içinde benzersiz aranacak) */
  @IsString()
  @MinLength(7)
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
