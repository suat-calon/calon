/**
 * BOOKING CONFIRMED PAGE — Faz 18: Viral Growth
 * ──────────────────────────────────────────────────────────────────────────────
 * Route: /booking-confirmed?slug=&ref=&service=&staff=&date=
 * Server Component wrapper + Client ShareSection.
 *
 * Canonical: /booking-confirmed (ref parametresi hariç)
 * ──────────────────────────────────────────────────────────────────────────────
 */

import { Metadata }   from 'next';
import { CheckCircle } from 'lucide-react';
import { ShareSection } from './ShareSection';

const SITE_URL = process.env['NEXT_PUBLIC_BOOKING_URL'] ?? 'https://book.auralis.app';

// ── Metadata ───────────────────────────────────────────────────────────────────

export const metadata: Metadata = {
  title:      'Randevunuz Oluşturuldu | Auralis',
  description: 'Randevunuz başarıyla oluşturuldu. Arkadaşlarınızı davet ederek puan kazanın.',
  // Canonical ref parametresi olmadan — SEO duplicate content koruması
  alternates:  { canonical: `${SITE_URL}/booking-confirmed` },
  robots:      { index: false, follow: false }, // Teşekkür sayfası indexlenmez
};

// ── Sayfa ──────────────────────────────────────────────────────────────────────

export default async function BookingConfirmedPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const sp = await searchParams;

  const slug    = typeof sp['slug']    === 'string' ? sp['slug']    : '';
  const ref     = typeof sp['ref']     === 'string' ? sp['ref']     : '';
  const service = typeof sp['service'] === 'string' ? sp['service'] : '';
  const staff   = typeof sp['staff']   === 'string' ? sp['staff']   : '';
  const date    = typeof sp['date']    === 'string' ? sp['date']    : '';

  return (
    <div className="min-h-screen bg-gradient-to-b from-white to-brand-50 flex flex-col items-center justify-center px-4 py-16">

      {/* ── Onay kartı ──────────────────────────────────────────────────────── */}
      <div className="w-full max-w-md bg-white rounded-3xl shadow-sm border border-gray-100 p-8 text-center">

        {/* Başarı ikonu */}
        <div className="w-20 h-20 bg-green-100 rounded-full flex items-center justify-center mx-auto mb-5">
          <CheckCircle className="w-10 h-10 text-green-600" />
        </div>

        <h1 className="text-2xl font-bold text-gray-900 mb-2">
          Randevunuz Oluşturuldu!
        </h1>
        <p className="text-gray-500 text-sm mb-6">
          Bilgileriniz kaydedildi. Randevu günü görüşmek üzere!
        </p>

        {/* Randevu özeti */}
        {(service || staff || date) && (
          <div className="bg-gray-50 rounded-2xl p-4 text-left text-sm space-y-2 mb-6">
            {service && (
              <div className="flex justify-between">
                <span className="text-gray-500">Hizmet</span>
                <span className="font-medium text-gray-900">{service}</span>
              </div>
            )}
            {staff && (
              <div className="flex justify-between">
                <span className="text-gray-500">Personel</span>
                <span className="font-medium text-gray-900">{staff}</span>
              </div>
            )}
            {date && (
              <div className="flex justify-between">
                <span className="text-gray-500">Tarih</span>
                <span className="font-medium text-gray-900">{date}</span>
              </div>
            )}
          </div>
        )}

        {/* Referral share widget (Client Component) */}
        {ref && slug && (
          <ShareSection
            referralCode={ref}
            salonSlug={slug}
            siteUrl={SITE_URL}
          />
        )}

        {/* Yeni randevu linki */}
        {slug && (
          <a
            href={`/${slug}`}
            className="mt-4 inline-block text-brand-600 text-sm font-medium hover:underline"
          >
            Yeni Randevu Al →
          </a>
        )}
      </div>

      {/* Footer */}
      <p className="mt-8 text-gray-400 text-xs text-center">
        Randevu sistemi{' '}
        <a
          href="https://auralis.app"
          target="_blank"
          rel="noopener noreferrer"
          className="font-semibold text-brand-600"
        >
          Auralis
        </a>{' '}
        ile güçlendirilmiştir.
      </p>

    </div>
  );
}
