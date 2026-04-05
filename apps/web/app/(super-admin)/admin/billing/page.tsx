'use client';

import { CreditCard, TrendingUp, AlertTriangle, CheckCircle2 } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { useBillingTenants, useBillingMetrics } from '@/hooks/api/use-admin';

export default function AdminBillingPage() {
  const { data: tenants, isLoading: tLoading, error: tError } = useBillingTenants();
  const { data: metrics, isLoading: mLoading, error: mError } = useBillingMetrics();

  const loading = tLoading || mLoading;
  const error = tError || mError;

  return (
    <div className="space-y-4 max-w-6xl">
      {/* Page header */}
      <div className="flex items-center justify-between pb-1 border-b border-border/40">
        <div>
          <h1 className="text-lg font-semibold tracking-tight">Faturalama</h1>
          <p className="text-[11px] text-muted-foreground/70 mt-0.5">Read-only cockpit · Düzenleme bu fazda devre dışı</p>
        </div>
      </div>

      {error ? (
        <div className="flex items-center gap-2 text-destructive py-8 justify-center text-sm">
          <span>Veriler yüklenemedi.</span>
        </div>
      ) : loading ? (
        <div className="flex justify-center py-12">
          <div className="w-5 h-5 animate-spin rounded-full border-2 border-muted border-t-primary" />
        </div>
      ) : (
        <>
          {/* Metrics */}
          {metrics && (
            <div>
              <p className="text-[10px] font-semibold uppercase tracking-widest text-muted-foreground/60 mb-2.5">Billing Metrikleri</p>
              <div className="grid grid-cols-3 gap-2.5">
                <div className="bg-card rounded-lg border p-3.5">
                  <div className="flex items-center gap-3">
                    <div className="p-1.5 rounded-md bg-primary/10">
                      <CheckCircle2 className="h-3.5 w-3.5 text-primary" />
                    </div>
                    <div>
                      <p className="text-lg font-semibold leading-none">{metrics.totalActive}</p>
                      <p className="text-[11px] text-muted-foreground mt-0.5">Aktif Abonelik</p>
                    </div>
                  </div>
                </div>
                <div className="bg-card rounded-lg border p-3.5">
                  <div className="flex items-center gap-3">
                    <div className="p-1.5 rounded-md bg-emerald-100 dark:bg-emerald-950/40">
                      <TrendingUp className="h-3.5 w-3.5 text-emerald-600 dark:text-emerald-400" />
                    </div>
                    <div>
                      <p className="text-lg font-semibold leading-none">{typeof metrics.totalRevenue === 'number' ? `₺${metrics.totalRevenue.toLocaleString('tr-TR')}` : metrics.totalRevenue}</p>
                      <p className="text-[11px] text-muted-foreground mt-0.5">Toplam Gelir</p>
                    </div>
                  </div>
                </div>
                <div className="bg-card rounded-lg border p-3.5">
                  <div className="flex items-center gap-3">
                    <div className="p-1.5 rounded-md bg-amber-100 dark:bg-amber-950/40">
                      <AlertTriangle className="h-3.5 w-3.5 text-amber-600 dark:text-amber-400" />
                    </div>
                    <div>
                      <p className="text-lg font-semibold leading-none">{metrics.pastDue}</p>
                      <p className="text-[11px] text-muted-foreground mt-0.5">Gecikmiş</p>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* Tenant billing list */}
          <div>
            <p className="text-[10px] font-semibold uppercase tracking-widest text-muted-foreground/60 mb-2.5">Abonelikler</p>
            {tenants && tenants.length > 0 ? (
              <div className="bg-card rounded-lg border divide-y divide-border/60">
                {tenants.map((t: { id: string; tenantId?: string; plan: string; status: string }) => (
                  <div key={t.id} className="px-4 py-2.5 flex items-center gap-3">
                    <CreditCard className="h-3.5 w-3.5 text-muted-foreground/50 shrink-0" />
                    <div className="flex-1 min-w-0">
                      <span className="text-[13px] font-medium font-mono">{t.tenantId?.slice(0, 12)}...</span>
                    </div>
                    <Badge variant="outline" className="text-[9px] px-1.5 py-0 h-4">{t.plan}</Badge>
                    <Badge
                      variant={t.status === 'ACTIVE' ? 'success' : t.status === 'TRIAL' ? 'info' : t.status === 'PAST_DUE' ? 'warning' : 'destructive'}
                      className="text-[9px] px-1.5 py-0 h-4"
                    >
                      {t.status}
                    </Badge>
                  </div>
                ))}
              </div>
            ) : (
              <div className="flex flex-col items-center py-12">
                <div className="w-10 h-10 rounded-full bg-muted flex items-center justify-center mb-2.5">
                  <CreditCard className="h-4 w-4 text-muted-foreground/50" />
                </div>
                <p className="text-[13px] text-muted-foreground font-medium">Billing verisi yok</p>
                <p className="text-[11px] text-muted-foreground/60 mt-0.5">İlk abonelik oluşturulduğunda burada görünecek.</p>
              </div>
            )}
          </div>
        </>
      )}
    </div>
  );
}
