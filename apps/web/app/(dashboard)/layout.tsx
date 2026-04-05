'use client';

import { useEffect, useState } from 'react';
import { useRouter }           from 'next/navigation';

import apiClient      from '@/lib/api-client';
import { Sidebar }    from '@/components/dashboard/sidebar';
import { Topbar }     from '@/components/dashboard/topbar';

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
      .then((res) => {
        const role = res.data?.role ?? res.data?.userRole ?? '';
        if (role === 'SUPER_ADMIN') {
          // SUPER_ADMIN has no business on tenant surface — redirect to admin cockpit
          router.replace('/admin');
        } else {
          setReady(true);
        }
      })
      .catch(() => router.replace('/login'));
  }, [router]);

  if (!ready) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <div className="flex flex-col items-center gap-4 text-muted-foreground">
          <div className="w-8 h-8 animate-spin rounded-full border-2 border-muted border-t-primary" />
          <div className="text-center">
            <p className="text-sm font-semibold text-foreground tracking-tight">Calon</p>
            <p className="text-[11px] text-muted-foreground mt-0.5">Yükleniyor...</p>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen flex bg-muted/40 dark:bg-background">
      <Sidebar />
      <div className="flex-1 flex flex-col min-w-0">
        <Topbar />
        <main className="flex-1 overflow-y-auto">
          <div className="px-4 lg:px-6 py-4 lg:py-5">
            {children}
          </div>
        </main>
      </div>
    </div>
  );
}
