import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'Kurulum Sihirbazı — Calon',
  description: 'Salonunuzu 5 dakikada kurun ve ilk rezervasyonunuzu alın.',
};

export default function OnboardingLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 to-slate-100">
      {/* Minimal header */}
      <header className="border-b bg-white/80 backdrop-blur-sm">
        <div className="mx-auto flex h-14 max-w-4xl items-center px-4">
          <span className="text-xl font-bold tracking-tight text-slate-900">Calon</span>
        </div>
      </header>
      <main className="mx-auto max-w-2xl px-4 py-10">
        {children}
      </main>
    </div>
  );
}
