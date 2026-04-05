'use client';

import { Loader2, AlertCircle, CreditCard } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { useBillingTenants, useBillingMetrics } from '@/hooks/api/use-admin';

export default function AdminBillingPage() {
  const { data: tenants, isLoading: tLoading, error: tError } = useBillingTenants();
  const { data: metrics, isLoading: mLoading, error: mError } = useBillingMetrics();

  const loading = tLoading || mLoading;
  const error = tError || mError;

  return (
    <div className="space-y-6 max-w-6xl">
      <h1 className="text-lg font-semibold tracking-tight">Faturalama</h1>
      <p className="text-sm text-muted-foreground">Read-only görünüm. Düzenleme bu fazda devre dışı.</p>

      {error ? (
        <div className="flex items-center gap-2 text-destructive py-8 justify-center">
          <AlertCircle className="h-5 w-5" /><span>{error.message.includes('401') ? 'Geçersiz API anahtarı.' : 'Yüklenemedi.'}</span>
        </div>
      ) : loading ? (
        <div className="flex justify-center py-12"><Loader2 className="h-6 w-6 animate-spin text-primary" /></div>
      ) : (
        <>
          {metrics && (
            <div className="grid grid-cols-3 gap-4">
              <div className="bg-card rounded-lg border p-4 text-center">
                <p className="text-2xl font-bold">{metrics.totalActive}</p>
                <p className="text-xs text-muted-foreground">Aktif Abonelik</p>
              </div>
              <div className="bg-card rounded-lg border p-4 text-center">
                <p className="text-2xl font-bold">{typeof metrics.totalRevenue === 'number' ? `₺${metrics.totalRevenue.toLocaleString('tr-TR')}` : metrics.totalRevenue}</p>
                <p className="text-xs text-muted-foreground">Toplam Gelir</p>
              </div>
              <div className="bg-card rounded-lg border p-4 text-center">
                <p className="text-2xl font-bold text-amber-600">{metrics.pastDue}</p>
                <p className="text-xs text-muted-foreground">Gecikmiş</p>
              </div>
            </div>
          )}

          {tenants && tenants.length > 0 ? (
            <div className="space-y-2">
              {tenants.map((t) => (
                <div key={t.id} className="bg-card rounded-lg border px-4 py-3 flex items-center gap-4">
                  <CreditCard className="h-4 w-4 text-muted-foreground" />
                  <div className="flex-1">
                    <span className="text-sm font-medium">{t.tenantId?.slice(0, 8)}...</span>
                  </div>
                  <Badge variant="secondary" className="text-[9px]">{t.plan}</Badge>
                  <Badge variant={t.status === 'ACTIVE' ? 'success' : 'secondary'} className="text-[9px]">{t.status}</Badge>
                </div>
              ))}
            </div>
          ) : (
            <p className="text-sm text-muted-foreground text-center py-8">Billing verisi henüz mevcut değil.</p>
          )}
        </>
      )}
    </div>
  );
}
