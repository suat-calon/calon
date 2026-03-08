import { IsEnum, IsEmail, IsString, IsOptional } from 'class-validator';
import { TenantPlan, BillingCycle } from '@prisma/client';

export class PaymentSessionDto {
  @IsEnum(TenantPlan)
  plan!: TenantPlan;

  @IsEnum(BillingCycle)
  cycle!: BillingCycle;

  @IsString()
  buyerName!: string;

  @IsOptional()
  @IsString()
  buyerSurname?: string;

  @IsEmail()
  buyerEmail!: string;
  // buyerIp NOT in DTO — extracted from req.ip in controller to prevent spoofing
}
