'use client';

import { useState }  from 'react';
import { useRouter }  from 'next/navigation';
import Link           from 'next/link';
import { usePathname } from 'next/navigation';
import {
  LogOut,
  Menu,
  X,
  LayoutDashboard,
  CalendarDays,
  FolderOpen,
  Users,
  UserCog,
  Scissors,
} from 'lucide-react';

import { Button }    from '@/components/ui/button';
import { useTenant } from '@/hooks/api/use-auth';
import apiClient     from '@/lib/api-client';
import { cn }        from '@/lib/utils';

const MOBILE_NAV = [
  { href: '/calendar',   label: 'Randevular', icon: CalendarDays },
  { href: '/dashboard',  label: 'Özet',       icon: LayoutDashboard },
  { href: '/catalog',    label: 'Katalog',    icon: FolderOpen },
  { href: '/customers',  label: 'Müşteriler', icon: Users },
  { href: '/staff',      label: 'Personel',   icon: UserCog },
  { href: '/services',   label: 'Hizmetler',  icon: Scissors },
] as const;

export function Topbar() {
  const router  = useRouter();
  const pathname = usePathname();
  const { data: tenant } = useTenant();
  const [mobileOpen, setMobileOpen] = useState(false);
  const [loggingOut, setLoggingOut] = useState(false);

  async function handleLogout() {
    setLoggingOut(true);
    try   { await apiClient.post('/auth/logout'); }
    catch { /* idempotent */ }
    finally { setLoggingOut(false); router.replace('/login'); }
  }

  return (
    <>
      <header className="h-16 border-b border-border/60 bg-card/50 dark:bg-card/30 flex items-center justify-between px-5 lg:px-8 shrink-0 backdrop-blur-sm">
        {/* Mobile menu toggle */}
        <button
          className="lg:hidden p-2 -ml-2 rounded-md hover:bg-muted"
          onClick={() => setMobileOpen(!mobileOpen)}
        >
          {mobileOpen ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
        </button>

        {/* Mobile logo */}
        <Link href="/dashboard" className="lg:hidden flex items-center gap-2">
          <div className="w-6 h-6 rounded-md bg-primary flex items-center justify-center">
            <span className="text-[10px] font-bold text-primary-foreground">C</span>
          </div>
          <span className="text-base font-semibold text-foreground">Calon</span>
        </Link>

        {/* Tenant info */}
        <div className="hidden lg:flex items-center gap-3">
          <div className="flex items-center gap-2">
            <span className="text-base font-semibold text-foreground">{tenant?.name ?? '...'}</span>
            {tenant?.plan && (
              <span className="inline-flex items-center rounded-full bg-primary/8 px-2 py-0.5 text-[10px] font-semibold text-primary ring-1 ring-inset ring-primary/15">
                {tenant.plan}
              </span>
            )}
          </div>
        </div>

        {/* Logout */}
        <Button variant="ghost" size="sm" className="text-muted-foreground hover:text-foreground" onClick={handleLogout} disabled={loggingOut}>
          <LogOut className="mr-2 h-3.5 w-3.5" />
          <span className="hidden sm:inline text-xs">{loggingOut ? 'Çıkılıyor...' : 'Çıkış'}</span>
        </Button>
      </header>

      {/* Mobile nav overlay */}
      {mobileOpen && (
        <div className="lg:hidden fixed inset-0 z-50 bg-black/50 backdrop-blur-sm" onClick={() => setMobileOpen(false)}>
          <nav
            className="w-64 h-full bg-card border-r border-border p-4 space-y-1 shadow-2xl"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="mb-5 flex items-center justify-between">
              <div className="flex items-center gap-2">
                <div className="w-6 h-6 rounded-md bg-primary flex items-center justify-center">
                  <span className="text-[10px] font-bold text-primary-foreground">C</span>
                </div>
                <span className="text-base font-semibold text-foreground">Calon</span>
              </div>
              <button onClick={() => setMobileOpen(false)} className="p-1 rounded hover:bg-muted">
                <X className="h-4 w-4 text-muted-foreground" />
              </button>
            </div>
            {MOBILE_NAV.map(({ href, label, icon: Icon }) => {
              const isActive = href === '/dashboard'
                ? pathname === '/dashboard'
                : pathname.startsWith(href);
              return (
                <Link
                  key={href}
                  href={href}
                  onClick={() => setMobileOpen(false)}
                  className={cn(
                    'flex items-center gap-3 px-3 py-2 rounded-md text-sm font-medium transition-colors',
                    isActive
                      ? 'bg-primary text-primary-foreground'
                      : 'text-foreground/60 hover:bg-muted hover:text-foreground',
                  )}
                >
                  <Icon className={cn('h-4 w-4', isActive ? 'text-primary-foreground' : 'text-foreground/40')} />
                  {label}
                </Link>
              );
            })}
          </nav>
        </div>
      )}
    </>
  );
}
