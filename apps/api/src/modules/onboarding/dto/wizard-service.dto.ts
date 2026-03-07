import { IsString, MinLength, IsInt, IsPositive, IsNumber, Min } from 'class-validator';

export class WizardServiceDto {
  @IsString()
  @MinLength(2)
  name!: string;

  /** Dakika cinsinden süre */
  @IsInt()
  @IsPositive()
  durationMin!: number;

  /** Fiyat (TRY) */
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  price!: number;
}
