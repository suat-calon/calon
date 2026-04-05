'use client';

import { Loader2, AlertCircle, BarChart3 } from 'lucide-react';
import { useGrowthMetrics } from '@/hooks/api/use-admin';

export default function AdminMetricsPage() {
  const { data: metrics, isLoading, error } = useGrowthMetrics();

  return (
    <div className="space-y-6 max-w-4xl">
      <h1 className="text-lg font-semibold tracking-tight">Platform Metrikleri</h1>

      {error ? (
        <div className="flex items-center gap-2 text-destructive py-8 justify-center">
          <AlertCircle className="h-5 w-5" /><span>{error.message.includes('401') ? 'Geçersiz API anahtarı.' : 'Metrikler yüklenemedi.'}</span>
        </div>
      ) : isLoading ? (
        <div className="flex justify-center py-12"><Loader2 className="h-6 w-6 animate-spin text-primary" /></div>
      ) : !metrics ? (
        <div className="flex flex-col items-center py-16">
          <BarChart3 className="h-8 w-8 text-muted-foreground/30 mb-2" />
          <p className="text-sm text-muted-foreground">Metrik verisi henüz mevcut değil.</p>
        </div>
      ) : (
        <>
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
            <MetricCard label="Toplam Salon" value={metrics.totalSalons} />
            <MetricCard label="Aktif Salon" value={metrics.activeSalons} accent />
            <MetricCard label="Bu Ay Yeni" value={metrics.newSalonsThisMonth} />
            <MetricCard label="Bugünkü Randevu" value={metrics.bookingsToday} />
          </div>

          <div className="bg-card rounded-lg border p-5 space-y-3">
            <h3 className="text-sm font-semibold">MRR (Tahmini Aylık Gelir)</h3>
            <p className="text-3xl font-bold">₺{(metrics.monthlyRecurringRevenue ?? 0).toLocaleString('tr-TR')}</p>
            <p className="text-xs text-muted-foreground">Aktif aboneliklerin plan bazlı tahmini toplamı</p>
          </div>

          {metrics.planDistribution && Object.keys(metrics.planDistribution).length > 0 && (
            <div className="bg-card rounded-lg border p-5 space-y-3">
              <h3 className="text-sm font-semibold">Plan Dağılımı</h3>
              <div className="space-y-2">
                {Object.entries(metrics.planDistribution).map(([plan, count]) => (
                  <div key={plan} className="flex items-center justify-between">
                    <span className="text-sm">{plan}</span>
                    <div className="flex items-center gap-2">
                      <div className="h-2 bg-primary/20 rounded-full w-32">
                        <div className="h-2 bg-primary rounded-full" style={{ width: `${Math.min(100, ((count as number) / Math.max(metrics.totalSalons, 1)) * 100)}%` }} />
                      </div>
                      <span className="text-sm font-medium w-8 text-right">{count as number}</span>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </>
      )}

      <p className="text-[10px] text-muted-foreground italic">
        Read-only metrik görünümü. Decision engine / intervention aksiyonları bu fazda aktif değil.
      </p>
    </div>
  );
}

function MetricCard({ label, value, accent }: { label: string; value: number; accent?: boolean }) {
  return (
    <div className="bg-card rounded-lg border p-4 text-center">
      <p className={`text-2xl font-bold ${accent ? 'text-primary' : ''}`}>{value}</p>
      <p className="text-xs text-muted-foreground mt-1">{label}</p>
    </div>
  );
}
