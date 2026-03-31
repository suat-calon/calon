'use client';

import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import {
  LayoutDashboard, Building2, CreditCard, Activity, BarChart3,
  Shield, LogOut, Loader2,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { useAuth } from '@/hooks/api/use-auth';

const qc = new QueryClient();

const NAV = [
  { href: '/admin',          label: 'Genel Bakış', icon: LayoutDashboard },
  { href: '/admin/tenants',  label: 'Salonlar',    icon: Building2 },
  { href: '/admin/billing',  label: 'Faturalama',  icon: CreditCard },
  { href: '/admin/ops',      label: 'Operasyon',   icon: Activity },
  { href: '/admin/metrics',  label: 'Metrikler',   icon: BarChart3 },
];

function AdminLayoutInner({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();
  const { data: auth, isLoading, error } = useAuth();

  // Loading
  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-slate-50">
        <Loader2 className="h-6 w-6 animate-spin text-primary" />
      </div>
    );
  }

  // Not logged in → redirect to login
  if (error || !auth) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-slate-50">
        <div className="bg-white rounded-xl shadow-lg p-8 w-full max-w-sm space-y-4 text-center">
          <Shield className="h-8 w-8 text-primary mx-auto" />
          <h1 className="text-xl font-bold">Super Admin</h1>
          <p className="text-sm text-muted-foreground">Oturum bulunamadı. Lütfen önce giriş yapın.</p>
          <Button className="w-full" onClick={() => router.push('/login')}>Giriş Yap</Button>
        </div>
      </div>
    );
  }

  // Wrong role → forbidden
  if (auth.role !== 'SUPER_ADMIN') {
    return (
      <div className="min-h-screen flex items-center justify-center bg-slate-50">
        <div className="bg-white rounded-xl shadow-lg p-8 w-full max-w-sm space-y-4 text-center">
          <Shield className="h-8 w-8 text-destructive mx-auto" />
          <h1 className="text-xl font-bold">Erişim Reddedildi</h1>
          <p className="text-sm text-muted-foreground">Bu alan yalnızca platform yöneticilerine (SUPER_ADMIN) açıktır.</p>
          <p className="text-xs text-muted-foreground">Mevcut rol: {auth.role}</p>
          <Button variant="outline" className="w-full" onClick={() => router.push('/calendar')}>Panele Dön</Button>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen flex bg-slate-50">
      {/* Sidebar */}
      <aside className="w-56 bg-slate-900 text-white flex flex-col shrink-0">
        <div className="px-4 py-4 border-b border-slate-700">
          <div className="flex items-center gap-2">
            <Shield className="h-5 w-5 text-primary" />
            <span className="font-bold text-sm">Calon Admin</span>
          </div>
          <p className="text-[10px] text-slate-400 mt-1">Read-only Cockpit · SUPER_ADMIN</p>
        </div>
        <nav className="flex-1 py-3 space-y-0.5">
          {NAV.map((item) => {
            const active = pathname === item.href || (item.href !== '/admin' && pathname.startsWith(item.href));
            return (
              <Link key={item.href} href={item.href}
                className={`flex items-center gap-2.5 px-4 py-2 text-sm transition-colors ${active ? 'bg-slate-700 text-white font-medium' : 'text-slate-300 hover:bg-slate-800 hover:text-white'}`}
              >
                <item.icon className="h-4 w-4" />
                {item.label}
              </Link>
            );
          })}
        </nav>
        <div className="p-3 border-t border-slate-700">
          <Button variant="ghost" size="sm" className="w-full text-slate-400 hover:text-white justify-start" onClick={() => router.push('/calendar')}>
            <LogOut className="h-3.5 w-3.5 mr-2" />Panele Dön
          </Button>
        </div>
      </aside>

      {/* Main */}
      <main className="flex-1 p-6 overflow-auto">
        {children}
      </main>
    </div>
  );
}

export default function SuperAdminLayout({ children }: { children: React.ReactNode }) {
  return (
    <QueryClientProvider client={qc}>
      <AdminLayoutInner>{children}</AdminLayoutInner>
    </QueryClientProvider>
  );
}
