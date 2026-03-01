/**
 * Auralis — Geçici landing sayfası
 * Sprint 1'de gerçek dashboard ile değiştirilecek.
 */
export default function HomePage() {
  return (
    <main className="flex min-h-screen items-center justify-center bg-slate-950">
      <div className="text-center">
        <h1 className="text-4xl font-bold text-white mb-2">Auralis</h1>
        <p className="text-slate-400 text-lg">Business OS — Faz 0 çelik çekirdeği hazır.</p>
        <div className="mt-6 flex gap-3 justify-center">
          <span className="px-3 py-1 rounded-full bg-indigo-600 text-white text-sm">NestJS ✓</span>
          <span className="px-3 py-1 rounded-full bg-indigo-600 text-white text-sm">PostgreSQL RLS ✓</span>
          <span className="px-3 py-1 rounded-full bg-indigo-600 text-white text-sm">GIST Constraint ✓</span>
          <span className="px-3 py-1 rounded-full bg-indigo-600 text-white text-sm">Idempotency ✓</span>
        </div>
      </div>
    </main>
  );
}
