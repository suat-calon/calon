import { SetMetadata } from '@nestjs/common';

export const ALLOW_PAST_DUE_KEY = 'allowPastDue';

/**
 * @AllowPastDue() — PAST_DUE veya SUSPENDED durumundaki tenant için bu endpoint açık (whitelist).
 *
 * BillingGuard Default-Deny prensibini tersine çevirir:
 *   - PAST_DUE + write method (POST/PUT/PATCH/DELETE) + @AllowPastDue() → GEÇER
 *   - SUSPENDED + @AllowPastDue() → GEÇER
 *
 * Zorunlu kullanım yerleri:
 *   - IAM Auth controller (login, refresh, register, logout)
 *   - Admin Billing controller (ödeme alma / plan değiştirme)
 *
 * @example
 * @AllowPastDue()
 * @Controller('iam')
 * export class AuthController { ... }
 */
export const AllowPastDue = () => SetMetadata(ALLOW_PAST_DUE_KEY, true);
