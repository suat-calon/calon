/**
 * CALON PLATFORM KONFİGÜRASYONU — BOOKING FRONTEND TARAFI
 * ─────────────────────────────────────────────────────────────────────────────
 * Tüm marka/domain verileri tek yerden okunur.
 * Hardcode yasak — bu dosya dışında brand string bulunmaz.
 * NEXT_PUBLIC_ prefix'li değişkenler client bundle'a enjekte edilir.
 * ─────────────────────────────────────────────────────────────────────────────
 */

/** Domain topology */
export const PLATFORM = {
  /** Marka adı */
  name:       'Calon',

  /** Ana site (footer linkleri, register yönlendirmesi) */
  siteUrl:    process.env['NEXT_PUBLIC_SITE_URL']    ?? 'https://calon.com.tr',

  /** Public booking base URL (canonical, sitemap, OG) */
  bookingUrl: process.env['NEXT_PUBLIC_BOOKING_URL'] ?? 'https://book.calon.com.tr',

  /** Salon kayıt sayfası */
  registerUrl: `${process.env['NEXT_PUBLIC_SITE_URL'] ?? 'https://calon.com.tr'}/register`,
} as const;

/**
 * WhatsApp referral deep link mesajı.
 * booking-confirmed/page.tsx'de ShareSection tarafından kullanılır.
 */
export function buildWhatsAppReferralMessage(params: {
  salonName:   string;
  salonSlug:   string;
  referralCode: string;
}): string {
  const link = `${PLATFORM.bookingUrl}/${params.salonSlug}?ref=${params.referralCode}`;
  return encodeURIComponent(
    `${params.salonName}'da randevu aldım, sen de al! İlk randevunda avantaj kazanmak için: ${link}`,
  );
}

/**
 * SEO title suffix'i — tüm metadata başlıkları bu pattern'ı kullanır.
 */
export const PAGE_TITLE_SUFFIX = `Online Randevu — ${PLATFORM.name}`;
