import { IsUUID, IsInt, Min, IsOptional, IsString, MaxLength } from 'class-validator';

export class RedeemPointsDto {
  @IsUUID()
  customerId!: string;

  @IsInt()
  @Min(1, { message: 'En az 1 puan harcamalısınız.' })
  points!: number;

  @IsOptional()
  @IsString()
  @MaxLength(255)
  description?: string;
}
