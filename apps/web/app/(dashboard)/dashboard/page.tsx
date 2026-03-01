'use client';

import { useRouter } from 'next/navigation';
import { LogOut }    from 'lucide-react';

import { Button }      from '@/components/ui/button';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';

export default function DashboardPage() {
  const router = useRouter();

  function handleLogout() {
    localStorage.removeItem('auralis_access_token');
    localStorage.removeItem('auralis_refresh_token');
    router.replace('/login');
  }

  return (
    <div className="min-h-screen bg-slate-50">
      {/* Üst nav */}
      <header className="border-b bg-white px-6 py-4 flex items-center justify-between shadow-sm">
        <div className="flex items-center gap-2">
          <span className="text-xl font-bold text-primary">Auralis</span>
          <span className="text-sm text-muted-foreground">Business OS</span>
        </div>
        <Button variant="ghost" size="sm" onClick={handleLogout}>
          <LogOut className="mr-2 h-4 w-4" />
          Çıkış Yap
        </Button>
      </header>

      {/* İçerik */}
      <main className="container mx-auto max-w-5xl p-6 space-y-6">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Dashboard</h1>
          <p className="text-muted-foreground mt-1">
            Auralis Business OS — Faz 4 tamamlandı.
          </p>
        </div>

        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <StatusCard title="IAM"        description="JWT + Refresh token"        badge="Faz 1 ✓" />
          <StatusCard title="Randevu"    description="XState + GIST çakışma"       badge="Faz 2 ✓" />
          <StatusCard title="Stok"       description="BullMQ async worker"         badge="Faz 3 ✓" />
          <StatusCard title="Katalog"    description="Ürün & Hizmet CRUD"          badge="Faz 3 ✓" />
        </div>

        <Card>
          <CardHeader>
            <CardTitle>Yapılacaklar</CardTitle>
            <CardDescription>Sonraki sprint görevleri</CardDescription>
          </CardHeader>
          <CardContent>
            <ul className="space-y-2 text-sm text-muted-foreground list-disc list-inside">
              <li>Randevu takvimi ve slot listeleme UI</li>
              <li>Stok uyarı bildirimleri (minStock altı)</li>
              <li>Müşteri yönetimi ekranları</li>
              <li>Ödeme ve komisyon modülü (FinanceModule)</li>
            </ul>
          </CardContent>
        </Card>
      </main>
    </div>
  );
}

// ── Yardımcı bileşen ──────────────────────────────────────────────────────────
function StatusCard({
  title,
  description,
  badge,
}: {
  title:       string;
  description: string;
  badge:       string;
}) {
  return (
    <Card>
      <CardHeader className="pb-2">
        <div className="flex items-center justify-between">
          <CardTitle className="text-base">{title}</CardTitle>
          <span className="rounded-full bg-primary/10 px-2 py-0.5 text-xs font-medium text-primary">
            {badge}
          </span>
        </div>
      </CardHeader>
      <CardContent>
        <p className="text-sm text-muted-foreground">{description}</p>
      </CardContent>
    </Card>
  );
}
