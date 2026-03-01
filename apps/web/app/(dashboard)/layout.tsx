'use client';

import { useEffect, useState } from 'react';
import { useRouter }           from 'next/navigation';

/**
 * Dashboard route grubu layout — kimlik doğrulama kapısı.
 * localStorage'da access token yoksa /login'e yönlendirir.
 */
export default function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const router  = useRouter();
  const [ready, setReady] = useState(false);

  useEffect(() => {
    const token = localStorage.getItem('auralis_access_token');
    if (!token) {
      router.replace('/login');
    } else {
      setReady(true);
    }
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
