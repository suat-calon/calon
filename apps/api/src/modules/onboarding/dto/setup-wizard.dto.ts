/**
 * SETUP WIZARD DTO — Onboarding Wizard Veri Kurulumu
 * ──────────────────────────────────────────────────────────────────────────────
 * POST /onboarding/setup-wizard için giriş DTO'su.
 * staffIndex/serviceIndex: payload içi çapraz referans için sıfır tabanlı indeks.
 */

import {
  IsString,
  IsNumber,
  IsInt,
  IsPositive,
  IsArray,
  IsOptional,
  ValidateNested,
  Min,
  Max,
  ArrayMinSize,
  MinLength,
} from 'class-validator';
import { Type } from 'class-transformer';

// ── Konum ─────────────────────────────────────────────────────────────────────

export class LocationDto {
  @IsString()
  @MinLength(2)
  name!: string;

  @IsOptional()
  @IsString()
  address?: string;

  @IsOptional()
  @IsString()
  city?: string;

  @IsOptional()
  @IsString()
  phone?: string;
}

// ── Hizmet ────────────────────────────────────────────────────────────────────

export class ServiceDto {
  @IsString()
  @MinLength(2)
  name!: string;

  /** ServiceCategory.name — aynı kategoride birden fazla hizmet olabilir (upsert by name) */
  @IsString()
  @MinLength(2)
  categoryName!: string;

  /** Dakika cinsinden hizmet süresi */
  @IsInt()
  @IsPositive()
  durationMin!: number;

  /** Fiyat (ondalık — TRY) */
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  price!: number;
}

// ── Personel ──────────────────────────────────────────────────────────────────

export class StaffDto {
  @IsString()
  @MinLength(1)
  firstName!: string;

  @IsString()
  @MinLength(1)
  lastName!: string;

  @IsOptional()
  @IsString()
  title?: string;
}

// ── Çalışma Saatleri ──────────────────────────────────────────────────────────

export class WorkingHourDto {
  /** staff[] dizisindeki sıfır tabanlı indeks */
  @IsInt()
  @Min(0)
  staffIndex!: number;

  /** 0=Pazartesi, 1=Salı, ..., 6=Pazar */
  @IsInt()
  @Min(0)
  @Max(6)
  dayOfWeek!: number;

  /** "09:00" formatı */
  @IsString()
  startTime!: string;

  /** "18:00" formatı */
  @IsString()
  endTime!: string;
}

// ── Personel ↔ Hizmet Bağlantısı ─────────────────────────────────────────────

export class StaffServiceLinkDto {
  /** staff[] dizisindeki sıfır tabanlı indeks */
  @IsInt()
  @Min(0)
  staffIndex!: number;

  /** services[] dizisindeki sıfır tabanlı indeks */
  @IsInt()
  @Min(0)
  serviceIndex!: number;
}

// ── Ana Wizard DTO ────────────────────────────────────────────────────────────

export class SetupWizardDto {
  @ValidateNested()
  @Type(() => LocationDto)
  location!: LocationDto;

  @IsArray()
  @ArrayMinSize(1)
  @ValidateNested({ each: true })
  @Type(() => ServiceDto)
  services!: ServiceDto[];

  @IsArray()
  @ArrayMinSize(1)
  @ValidateNested({ each: true })
  @Type(() => StaffDto)
  staff!: StaffDto[];

  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => WorkingHourDto)
  workingHours?: WorkingHourDto[];

  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => StaffServiceLinkDto)
  staffServices?: StaffServiceLinkDto[];
}
