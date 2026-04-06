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
          'group flex items-center gap-3 px-3 py-[7px] rounded-[10px] text-[13px] font-medium transition-all duration-200 aurora-sidebar-item',
          isActive && 'active',
        )}
      >
        <Icon className={cn(
          'h-[18px] w-[18px] shrink-0 transition-colors',
          isActive ? 'text-primary' : 'text-muted-foreground/60 group-hover:text-foreground/70',
        )} />
        {label}
      </Link>
    );
  };

  return (
    <aside className="hidden lg:flex lg:flex-col lg:w-[232px] border-r border-border/40 bg-white/30 dark:bg-card/40 backdrop-blur-xl">
      {/* Brand zone */}
      <div className="h-14 flex items-center px-4 border-b border-border/60">
        <Link href="/dashboard" className="flex items-center gap-2.5">
          <div className="w-7 h-7 rounded-lg bg-primary flex items-center justify-center shadow-sm">
            <span className="text-[11px] font-bold text-primary-foreground">C</span>
          </div>
          <span className="text-[15px] font-semibold text-foreground tracking-tight">Calon</span>
        </Link>
      </div>

      {/* Main navigation */}
      <nav className="flex-1 px-2.5 py-2.5 space-y-[2px]">
        <p className="px-3 pt-1 pb-2 text-[10px] font-semibold uppercase tracking-widest text-muted-foreground/70">
          Operasyon
        </p>
        {NAV_MAIN.map(renderItem)}
      </nav>

      {/* Bottom section — settings + theme toggle */}
      <div className="px-2.5 pb-2.5 pt-2 border-t border-border/60 space-y-[2px]">
        <p className="px-3 pt-1 pb-2 text-[10px] font-semibold uppercase tracking-widest text-muted-foreground/70">
          Sistem
        </p>
        {NAV_BOTTOM.map(renderItem)}

        {/* Theme toggle */}
        <button
          type="button"
          onClick={() => setTheme(theme === 'dark' ? 'light' : 'dark')}
          className="group flex items-center gap-3 w-full px-3 py-[7px] rounded-[10px] text-[13px] font-medium aurora-sidebar-item"
        >
          {theme === 'dark' ? (
            <Sun className="h-[18px] w-[18px] shrink-0 text-foreground/40 group-hover:text-foreground/60" />
          ) : (
            <Moon className="h-[18px] w-[18px] shrink-0 text-foreground/40 group-hover:text-foreground/60" />
          )}
          {theme === 'dark' ? 'Açık Tema' : 'Koyu Tema'}
        </button>
      </div>
    </aside>
  );
}
