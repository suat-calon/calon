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
      <header className="h-16 border-b bg-white flex items-center justify-between px-4 lg:px-6 shrink-0">
        {/* Mobile menu toggle */}
        <button
          className="lg:hidden p-2 -ml-2 rounded-md hover:bg-muted"
          onClick={() => setMobileOpen(!mobileOpen)}
        >
          {mobileOpen ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
        </button>

        {/* Mobile logo */}
        <Link href="/dashboard" className="lg:hidden flex items-center gap-2">
          <span className="text-xl font-bold text-primary">Calon</span>
        </Link>

        {/* Tenant info — Untitled-inspired clean label */}
        <div className="hidden lg:flex items-center gap-2.5">
          <span className="text-sm font-semibold text-foreground">{tenant?.name ?? '...'}</span>
          {tenant?.plan && (
            <span className="inline-flex items-center rounded-md bg-primary/10 px-2 py-0.5 text-xs font-medium text-primary ring-1 ring-inset ring-primary/20">
              {tenant.plan}
            </span>
          )}
        </div>

        {/* Logout */}
        <Button variant="ghost" size="sm" onClick={handleLogout} disabled={loggingOut}>
          <LogOut className="mr-2 h-4 w-4" />
          <span className="hidden sm:inline">{loggingOut ? 'Çıkılıyor...' : 'Çıkış'}</span>
        </Button>
      </header>

      {/* Mobile nav overlay */}
      {mobileOpen && (
        <div className="lg:hidden fixed inset-0 z-50 bg-black/40" onClick={() => setMobileOpen(false)}>
          <nav
            className="w-64 h-full bg-white border-r p-4 space-y-1"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="mb-6 flex items-center justify-between">
              <span className="text-xl font-bold text-primary">Calon</span>
              <button onClick={() => setMobileOpen(false)} className="p-1">
                <X className="h-5 w-5" />
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
                    'flex items-center gap-3 px-3 py-2 rounded-md text-sm font-medium',
                    isActive
                      ? 'bg-primary/10 text-primary'
                      : 'text-muted-foreground hover:bg-muted',
                  )}
                >
                  <Icon className="h-4 w-4" />
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
