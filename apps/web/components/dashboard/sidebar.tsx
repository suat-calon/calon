'use client';

import Link            from 'next/link';
import { usePathname } from 'next/navigation';
import {
  LayoutDashboard,
  CalendarDays,
  FolderOpen,
  Users,
  Scissors,
  UserCog,
  Settings,
} from 'lucide-react';

import { cn } from '@/lib/utils';

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

export function Sidebar() {
  const pathname = usePathname();

  const renderItem = ({ href, label, icon: Icon }: { href: string; label: string; icon: typeof CalendarDays }) => {
    const isActive =
      href === '/dashboard'
        ? pathname === '/dashboard'
        : pathname.startsWith(href);

    return (
      <Link
        key={href}
        href={href}
        className={cn(
          'flex items-center gap-3 px-3 py-2 rounded-lg text-[13px] font-medium transition-colors',
          isActive
            ? 'bg-primary/10 text-primary shadow-sm'
            : 'text-gray-600 hover:bg-gray-100 hover:text-gray-900',
        )}
      >
        <Icon className={cn('h-4 w-4 shrink-0', isActive ? 'text-primary' : 'text-gray-400')} />
        {label}
      </Link>
    );
  };

  return (
    <aside className="hidden lg:flex lg:flex-col lg:w-60 border-r bg-gray-50/50">
      {/* Logo */}
      <div className="h-16 flex items-center px-6 border-b bg-white">
        <Link href="/dashboard" className="flex items-center gap-2">
          <span className="text-xl font-bold text-primary">Calon</span>
        </Link>
      </div>

      {/* Main navigation */}
      <nav className="flex-1 px-3 py-3 space-y-0.5">
        {NAV_MAIN.map(renderItem)}
      </nav>

      {/* Bottom navigation — separated */}
      <div className="px-3 pb-3 pt-2 border-t border-gray-200/80">
        {NAV_BOTTOM.map(renderItem)}
      </div>
    </aside>
  );
}
