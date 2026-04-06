'use client';

import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { useTheme } from 'next-themes';
import {
  LayoutDashboard, Building2, CreditCard, Activity, BarChart3,
  Shield, LogOut, Sun, Moon,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { useAuth } from '@/hooks/api/use-auth';
import { cn } from '@/lib/utils';

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
  const { theme, setTheme } = useTheme();

  // Loading
  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <div className="flex flex-col items-center gap-3">
          <div className="w-8 h-8 animate-spin rounded-full border-2 border-muted border-t-primary" />
          <p className="text-xs text-muted-foreground">Yükleniyor...</p>
        </div>
      </div>
    );
  }

  // Not logged in
  if (error || !auth) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <div className="bg-card rounded-lg border p-8 w-full max-w-sm space-y-4 text-center">
          <Shield className="h-7 w-7 text-primary mx-auto" />
          <h1 className="text-lg font-semibold">Super Admin</h1>
          <p className="text-xs text-muted-foreground">Oturum bulunamadı. Lütfen önce giriş yapın.</p>
          <Button className="w-full" size="sm" onClick={() => router.push('/login')}>Giriş Yap</Button>
        </div>
      </div>
    );
  }

  // Wrong role
  if (auth.role !== 'SUPER_ADMIN') {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <div className="bg-card rounded-lg border p-8 w-full max-w-sm space-y-4 text-center">
          <Shield className="h-7 w-7 text-destructive mx-auto" />
          <h1 className="text-lg font-semibold">Erişim Reddedildi</h1>
          <p className="text-xs text-muted-foreground">Bu alan yalnızca SUPER_ADMIN rolüne açıktır.</p>
          <p className="text-[10px] text-muted-foreground/60">Mevcut rol: {auth.role}</p>
          <Button variant="outline" size="sm" className="w-full" onClick={() => router.push('/calendar')}>Panele Dön</Button>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen flex bg-muted/40 dark:bg-background">
      {/* Sidebar — control cockpit style */}
      <aside className="w-[256px] bg-white/30 dark:bg-card/40 backdrop-blur-xl border-r border-border/40 flex flex-col shrink-0">
        <div className="h-16 flex items-center px-5 border-b border-border/60">
          <div className="flex items-center gap-2">
            <div className="w-6 h-6 rounded-md bg-primary/15 flex items-center justify-center">
              <Shield className="h-3.5 w-3.5 text-primary" />
            </div>
            <div>
              <span className="text-sm font-semibold text-foreground">Calon Admin</span>
              <p className="text-[9px] text-muted-foreground/60 leading-none">SUPER_ADMIN</p>
            </div>
          </div>
        </div>

        <nav className="flex-1 px-2.5 py-2.5 space-y-[2px]">
          <p className="px-3 pt-1 pb-2 text-[10px] font-semibold uppercase tracking-widest text-muted-foreground/70">Platform</p>
          {NAV.map((item) => {
            const active = pathname === item.href || (item.href !== '/admin' && pathname.startsWith(item.href));
            return (
              <Link key={item.href} href={item.href}
                className={cn(
                  'group flex items-center gap-3 px-3.5 py-2 rounded-[10px] text-sm font-medium transition-all duration-200 aurora-sidebar-item',
                  active && 'active',
                )}
              >
                <item.icon className={cn('h-5 w-5 shrink-0', active ? 'text-primary' : 'text-muted-foreground/60 group-hover:text-foreground/70')} />
                {item.label}
              </Link>
            );
          })}
        </nav>

        <div className="px-2.5 pb-2.5 pt-2 border-t border-border/60 space-y-[2px]">
          <p className="px-3 pt-1 pb-2 text-[10px] font-semibold uppercase tracking-widest text-muted-foreground/70">Sistem</p>
          <button
            type="button"
            onClick={() => setTheme(theme === 'dark' ? 'light' : 'dark')}
            className="group flex items-center gap-2.5 w-full px-3 py-2 rounded-[10px] text-sm font-medium aurora-sidebar-item"
          >
            {theme === 'dark' ? <Sun className="h-[18px] w-[18px] text-foreground/40" /> : <Moon className="h-[18px] w-[18px] text-foreground/40" />}
            {theme === 'dark' ? 'Açık Tema' : 'Koyu Tema'}
          </button>
          <Button
            variant="ghost"
            size="sm"
            className="w-full justify-start text-foreground/60 hover:text-foreground text-sm h-auto py-2 px-3 font-medium"
            onClick={async () => {
              try { await fetch('/api/v1/auth/logout', { method: 'POST', credentials: 'include' }); } catch {}
              router.push('/login');
            }}
          >
            <LogOut className="h-[18px] w-[18px] mr-2.5 text-foreground/40" />Çıkış Yap
          </Button>
        </div>
      </aside>

      {/* Main */}
      <main className="flex-1 overflow-auto">
        <div className="px-8 py-8">
          {children}
        </div>
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
