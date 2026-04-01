/**
 * CUSTOMER PORTAL LAYOUT — Phase 1
 * Salon branding header + portal navigation.
 * White-label: salon name/color from fetchSalon().
 */

import { fetchSalon } from '../../../lib/api';

export default async function AccountLayout({
  children,
  params,
}: {
  children: React.ReactNode;
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const salon = await fetchSalon(slug);

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Salon branded header */}
      <header className="bg-white border-b border-gray-200 px-6 py-4">
        <div className="max-w-3xl mx-auto flex items-center justify-between">
          <div>
            <h1 className="text-lg font-bold text-gray-900">{salon?.name ?? 'Salon'}</h1>
            <p className="text-xs text-gray-500">Müşteri Portalı</p>
          </div>
          <a
            href={`/${slug}`}
            className="text-sm text-brand-600 hover:text-brand-800 font-medium"
          >
            ← Vitrini Gör
          </a>
        </div>
      </header>

      {/* Portal content */}
      <main className="max-w-3xl mx-auto px-6 py-8">
        {children}
      </main>

      {/* Footer */}
      <footer className="border-t border-gray-100 py-6 text-center text-gray-400 text-xs">
        <a href={`/${slug}#booking`} className="text-brand-600 hover:text-brand-800 font-medium">
          Yeni Randevu Al →
        </a>
      </footer>
    </div>
  );
}
