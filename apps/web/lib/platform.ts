/**
 * CALON PLATFORM KONFİGÜRASYONU — WEB (DASHBOARD) FRONTEND TARAFI
 * ─────────────────────────────────────────────────────────────────────────────
 * Tüm marka/domain verileri tek yerden okunur.
 * Hardcode yasak — bu dosya dışında brand string bulunmaz.
 * ─────────────────────────────────────────────────────────────────────────────
 */

export const PLATFORM = {
  /** Marka adı */
  name:       'Calon',

  /** Ürün tam adı (title, header) */
  productName: 'Calon Business OS',

  /** Ana site */
  siteUrl:    process.env['NEXT_PUBLIC_SITE_URL']    ?? 'https://calon.com.tr',

  /** Public booking */
  bookingUrl: process.env['NEXT_PUBLIC_BOOKING_URL'] ?? 'https://book.calon.com.tr',
} as const;
