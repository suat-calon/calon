'use client';

import Link            from 'next/link';
import { usePathname } from 'next/navigation';
import { useTheme }    from 'next-themes';
import {
  LayoutDashboard,
  CalendarDays,
  FolderOpen,
  Users,
  Scissors,
  UserCog,
  Settings,
  Sun,
  Moon,
} from 'lucide-react';

import { cn } from '@/lib/utils';

// ── Navigation structure ────────────────────────────────────────────────────

const NAV_MAIN = [
  { href: '/calendar',   label: 'Randevular', icon: CalendarDays },
  { href: '/dashboard',  label: 'Özet',       icon: LayoutDashboard },
  { href: '/catalog',    label: 'Katalog',    icon: FolderOpen },
  { href: '/customers',  label: 'Müşteriler', icon: Users },
  { href: '/staff',      label: 'Personel',   icon: UserCog },
  { href: '/services',   label: 'Hizmetler',  icon: Scissors },
] as const;

const NAV_BOTTOM = [
  { href: '/settings',   label: 'Ayarlar',    icon: Settings },
] as const;

// ── Component ───────────────────────────────────────────────────────────────

export function Sidebar() {
  const pathname = usePathname();
  const { theme, setTheme } = useTheme();

  const renderItem = (
    { href, label, icon: Icon }: { href: string; label: string; icon: typeof CalendarDays },
  ) => {
    const isActive =
      href === '/dashboard'
        ? pathname === '/dashboard'
        : pathname.startsWith(href);

    return (
      <Link
        key={href}
        href={href}
        className={cn(
          'flex items-center gap-3 px-3 py-2 rounded-lg text-[13px] font-medium transition-all duration-150',
          isActive
            ? 'bg-primary text-primary-foreground shadow-sm'
            : 'text-foreground/70 hover:bg-accent/10 hover:text-foreground',
        )}
      >
        <Icon className={cn(
          'h-4 w-4 shrink-0 transition-colors',
          isActive ? 'text-primary-foreground' : 'text-foreground/50',
        )} />
        {label}
      </Link>
    );
  };

  return (
    <aside className="hidden lg:flex lg:flex-col lg:w-60 border-r border-border bg-card">
      {/* Brand zone — logo + tenant identity anchor */}
      <div className="h-16 flex items-center px-5 border-b border-border">
        <Link href="/dashboard" className="flex items-center gap-2.5">
          <div className="w-7 h-7 rounded-lg bg-primary flex items-center justify-center">
            <span className="text-xs font-bold text-primary-foreground">C</span>
          </div>
          <span className="text-base font-bold text-foreground">Calon</span>
        </Link>
      </div>

      {/* Main navigation */}
      <nav className="flex-1 px-3 py-3 space-y-0.5">
        {NAV_MAIN.map(renderItem)}
      </nav>

      {/* Bottom section — settings + theme toggle */}
      <div className="px-3 pb-3 pt-2 border-t border-border space-y-1">
        <p className="px-3 pb-1 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
          Sistem
        </p>
        {NAV_BOTTOM.map(renderItem)}

        {/* Theme toggle */}
        <button
          type="button"
          onClick={() => setTheme(theme === 'dark' ? 'light' : 'dark')}
          className="flex items-center gap-3 w-full px-3 py-2 rounded-lg text-[13px] font-medium text-foreground/70 hover:bg-accent/10 hover:text-foreground transition-all duration-150"
        >
          {theme === 'dark' ? (
            <Sun className="h-4 w-4 shrink-0 text-foreground/50" />
          ) : (
            <Moon className="h-4 w-4 shrink-0 text-foreground/50" />
          )}
          {theme === 'dark' ? 'Açık Tema' : 'Koyu Tema'}
        </button>
      </div>
    </aside>
  );
}
