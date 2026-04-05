'use client';

import { useEffect, useState } from 'react';
import { useRouter }           from 'next/navigation';

import apiClient      from '@/lib/api-client';
import { Sidebar }    from '@/components/dashboard/sidebar';
import { Topbar }     from '@/components/dashboard/topbar';

/**
 * Dashboard route grubu layout — auth guard + shell.
 *
 * Güvenlik (v2):
 *   - GET /auth/me endpoint'i HttpOnly cookie üzerinden oturumu doğrular
 *   - 401 gelirse /login'e yönlendirir
 */
export default function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const router            = useRouter();
  const [ready, setReady] = useState(false);

  useEffect(() => {
    apiClient
      .get('/auth/me')
      .then(() => setReady(true))
      .catch(() => router.replace('/login'));
  }, [router]);

  if (!ready) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-slate-50">
        <div className="flex flex-col items-center gap-4 text-muted-foreground">
          <div className="h-10 w-10 animate-spin rounded-full border-[3px] border-muted border-t-primary" />
          <div className="text-center">
            <p className="text-sm font-medium text-foreground">Calon</p>
            <p className="text-xs text-muted-foreground mt-0.5">Yükleniyor...</p>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen flex bg-slate-50">
      <Sidebar />
      <div className="flex-1 flex flex-col min-w-0">
        <Topbar />
        <main className="flex-1 overflow-y-auto p-4 lg:p-6">
          {children}
        </main>
      </div>
    </div>
  );
}
