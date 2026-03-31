'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import {
  LayoutDashboard, Building2, CreditCard, Activity, BarChart3,
  Shield, LogOut,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

const qc = new QueryClient();

const NAV = [
  { href: '/admin',          label: 'Genel Bakış', icon: LayoutDashboard },
  { href: '/admin/tenants',  label: 'Salonlar',    icon: Building2 },
  { href: '/admin/billing',  label: 'Faturalama',  icon: CreditCard },
  { href: '/admin/ops',      label: 'Operasyon',   icon: Activity },
  { href: '/admin/metrics',  label: 'Metrikler',   icon: BarChart3 },
];

export default function SuperAdminLayout({ children }: { children: React.ReactNode }) {
  const [authed, setAuthed] = useState(false);
  const [keyInput, setKeyInput] = useState('');
  const pathname = usePathname();

  useEffect(() => {
    const stored = sessionStorage.getItem('calon_admin_key');
    if (stored) setAuthed(true);
  }, []);

  function handleLogin() {
    if (!keyInput.trim()) return;
    sessionStorage.setItem('calon_admin_key', keyInput.trim());
    setAuthed(true);
  }

  function handleLogout() {
    sessionStorage.removeItem('calon_admin_key');
    setAuthed(false);
    setKeyInput('');
  }

  if (!authed) {
    return (
      <QueryClientProvider client={qc}>
        <div className="min-h-screen flex items-center justify-center bg-slate-50">
          <div className="bg-white rounded-xl shadow-lg p-8 w-full max-w-sm space-y-4">
            <div className="flex items-center gap-2 justify-center">
              <Shield className="h-6 w-6 text-primary" />
              <h1 className="text-xl font-bold">Super Admin</h1>
            </div>
            <p className="text-sm text-muted-foreground text-center">Platform yönetim paneli. API anahtarı gereklidir.</p>
            <Input
              type="password"
              placeholder="Admin API Key"
              value={keyInput}
              onChange={(e) => setKeyInput(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && handleLogin()}
            />
            <Button className="w-full" onClick={handleLogin}>Giriş</Button>
          </div>
        </div>
      </QueryClientProvider>
    );
  }

  return (
    <QueryClientProvider client={qc}>
      <div className="min-h-screen flex bg-slate-50">
        {/* Sidebar */}
        <aside className="w-56 bg-slate-900 text-white flex flex-col shrink-0">
          <div className="px-4 py-4 border-b border-slate-700">
            <div className="flex items-center gap-2">
              <Shield className="h-5 w-5 text-primary" />
              <span className="font-bold text-sm">Calon Admin</span>
            </div>
            <p className="text-[10px] text-slate-400 mt-1">Read-only Cockpit</p>
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
            <Button variant="ghost" size="sm" className="w-full text-slate-400 hover:text-white justify-start" onClick={handleLogout}>
              <LogOut className="h-3.5 w-3.5 mr-2" />Çıkış
            </Button>
          </div>
        </aside>

        {/* Main */}
        <main className="flex-1 p-6 overflow-auto">
          {children}
        </main>
      </div>
    </QueryClientProvider>
  );
}
