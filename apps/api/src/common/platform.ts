/**
 * CALON PLATFORM KONFİGÜRASYONU — API TARAFI
 * ─────────────────────────────────────────────────────────────────────────────
 * Tüm marka/domain verileri tek yerden okunur.
 * Hardcode yasak — bu dosya dışında brand string bulunmaz.
 * ─────────────────────────────────────────────────────────────────────────────
 */

/** Domain topology */
export const PLATFORM = {
  /** Marka adı */
  name:        'Calon',

  /** Ana site */
  siteUrl:     process.env['SITE_URL']        ?? 'https://calon.com.tr',

  /** Salon dashboard (web app) */
  appUrl:      process.env['APP_URL']         ?? 'https://app.calon.com.tr',

  /** Public booking (booking app) */
  bookingUrl:  process.env['BOOKING_URL']     ?? 'https://book.calon.com.tr',

  /** Backend API */
  apiUrl:      process.env['API_URL']         ?? 'https://api.calon.com.tr',
} as const;

/**
 * Yeni müşteri için booking linkini döner.
 * onboarding.service.ts'de kullanılır.
 */
export function buildBookingLink(slug: string): string {
  return `${PLATFORM.bookingUrl}/${slug}`;
}
