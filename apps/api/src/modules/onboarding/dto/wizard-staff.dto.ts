import { IsString, MinLength, IsUUID, IsOptional } from 'class-validator';

export class WizardStaffDto {
  @IsString()
  @MinLength(1)
  firstName!: string;

  @IsString()
  @MinLength(1)
  lastName!: string;

  @IsOptional()
  @IsString()
  title?: string;

  /** locationId: wizard step 1'de oluşturulan Location'ın ID'si */
  @IsUUID()
  locationId!: string;
}
