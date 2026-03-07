import { IsString, MinLength, IsOptional } from 'class-validator';

export class WizardLocationDto {
  @IsString()
  @MinLength(2)
  name!: string;

  @IsString()
  @MinLength(2)
  city!: string;

  @IsString()
  @MinLength(5)
  phone!: string;

  @IsOptional()
  @IsString()
  address?: string;
}
