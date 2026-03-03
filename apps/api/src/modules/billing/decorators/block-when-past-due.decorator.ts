import { SetMetadata } from '@nestjs/common';

export const BLOCK_WHEN_PAST_DUE_KEY = 'blockWhenPastDue';

/**
 * @BlockWhenPastDue() — PAST_DUE durumundaki tenant için bu endpoint kapalı.
 *
 * BillingGuard bu metadata'yı okur:
 *   - status === PAST_DUE && @BlockWhenPastDue() → 402 Payment Required
 *
 * Uygulama yerleri (spec):
 *   - POST /appointments (randevu oluştur)
 *   - POST /sms/send
 *   - POST /loyalty/redeem
 *   - POST /staff
 *   - POST /locations
 *
 * @example
 * @BlockWhenPastDue()
 * @Post()
 * create() { ... }
 */
export const BlockWhenPastDue = () => SetMetadata(BLOCK_WHEN_PAST_DUE_KEY, true);
