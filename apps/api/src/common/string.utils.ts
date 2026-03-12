/**
 * STRING UTILS
 * ──────────────────────────────────────────────────────────────────────────────
 * Tekrar eden string işlemleri için paylaşımlı yardımcı fonksiyonlar.
 * ──────────────────────────────────────────────────────────────────────────────
 */

/**
 * firstName + lastName birleştirir, boşluk sıkıştırır.
 * Her iki alan da opsiyonel: `undefined | null | ''` güvenli.
 *
 * @example
 *   getFullName('Ali', 'Yılmaz')  // 'Ali Yılmaz'
 *   getFullName('Ali', '')         // 'Ali'
 *   getFullName(undefined, 'Öz')  // 'Öz'
 *   getFullName(undefined, '')     // ''
 */
export function getFullName(
  firstName?: string | null,
  lastName?:  string | null,
): string {
  return [firstName, lastName]
    .filter(Boolean)
    .join(' ')
    .trim();
}
