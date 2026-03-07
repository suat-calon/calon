'use client';

import { useEffect, useState } from 'react';
import { useRouter }           from 'next/navigation';

import apiClient from '@/lib/api-client';

/**
 * Dashboard route grubu layout — kimlik doğrulama kapısı.
 *
 * Güvenlik (v2):
 *   - localStorage token kontrolü YOKTUR (XSS saldırısına kapalı)
 *   - GET /auth/me endpoint'i HttpOnly cookie üzerinden oturumu doğrular
 *   - 401 gelirse /login'e yönlendirir, silent refresh apiClient interceptor'u üstlenir
 */
export default function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const router              = useRouter();
  const [ready, setReady]   = useState(false);

  useEffect(() => {
    apiClient
      .get('/auth/me')
      .then(() => setReady(true))
      .catch(() => router.replace('/login'));
  }, [router]);

  if (!ready) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-slate-50">
        <div className="flex flex-col items-center gap-3 text-muted-foreground">
          <div className="h-8 w-8 animate-spin rounded-full border-4 border-primary border-t-transparent" />
          <p className="text-sm">Yükleniyor…</p>
        </div>
      </div>
    );
  }

  return <>{children}</>;
}
