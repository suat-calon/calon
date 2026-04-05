'use client';

import { AlertCircle, Building2, Users, Calendar, TrendingUp, BarChart3, DollarSign } from 'lucide-react';
import { useGrowthMetrics } from '@/hooks/api/use-admin';

export default function AdminMetricsPage() {
  const { data: metrics, isLoading, error } = useGrowthMetrics();

  return (
    <div className="space-y-5 max-w-6xl">
      {/* Page header */}
      <div className="flex items-center justify-between pb-1 border-b border-border/40">
        <div>
          <h1 className="text-lg font-semibold tracking-tight">Platform Metrikleri</h1>
          <p className="text-[11px] text-muted-foreground/70 mt-0.5">Read-only metrik cockpit</p>
        </div>
      </div>

      {error ? (
        <div className="flex items-center gap-2 text-destructive py-8 justify-center text-sm">
          <AlertCircle className="h-4 w-4" />
          <span>{error.message.includes('401') ? 'Geçersiz oturum.' : 'Metrikler yüklenemedi.'}</span>
        </div>
      ) : isLoading ? (
        <div className="flex justify-center py-16">
          <div className="w-6 h-6 animate-spin rounded-full border-2 border-muted border-t-primary" />
        </div>
      ) : !metrics ? (
        <div className="flex flex-col items-center py-14">
          <div className="w-10 h-10 rounded-full bg-muted flex items-center justify-center mb-2.5">
            <BarChart3 className="h-4 w-4 text-muted-foreground/50" />
          </div>
          <p className="text-[13px] text-muted-foreground font-medium">Metrik verisi henüz mevcut değil</p>
          <p className="text-[11px] text-muted-foreground/60 mt-0.5">Veriler oluştuğunda burada görünecek.</p>
        </div>
      ) : (
        <>
          {/* KPI cards */}
          <div>
            <p className="text-[10px] font-semibold uppercase tracking-widest text-muted-foreground/60 mb-2.5">Büyüme Metrikleri</p>
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-2.5">
              <StatCard icon={Building2} label="Toplam Salon" value={metrics.totalSalons} />
              <StatCard icon={Users} label="Aktif Salon" value={metrics.activeSalons} accent />
              <StatCard icon={TrendingUp} label="Bu Ay Yeni" value={metrics.newSalonsThisMonth} />
              <StatCard icon={Calendar} label="Bugünkü Randevu" value={metrics.bookingsToday} />
            </div>
          </div>

          {/* MRR */}
          <div>
            <p className="text-[10px] font-semibold uppercase tracking-widest text-muted-foreground/60 mb-2.5">Gelir</p>
            <div className="bg-card rounded-lg border p-4">
              <div className="flex items-center gap-3">
                <div className="p-1.5 rounded-md bg-emerald-100 dark:bg-emerald-950/40">
                  <DollarSign className="h-3.5 w-3.5 text-emerald-600 dark:text-emerald-400" />
                </div>
                <div>
                  <p className="text-lg font-semibold leading-none">
                    ₺{(metrics.monthlyRecurringRevenue ?? 0).toLocaleString('tr-TR')}
                  </p>
                  <p className="text-[11px] text-muted-foreground mt-0.5">Tahmini Aylık Gelir (MRR)</p>
                </div>
              </div>
              <p className="text-[10px] text-muted-foreground/60 mt-2.5 ml-[42px]">Aktif aboneliklerin plan bazlı tahmini toplamı</p>
            </div>
          </div>

          {/* Plan distribution */}
          {metrics.planDistribution && Object.keys(metrics.planDistribution).length > 0 && (
            <div>
              <p className="text-[10px] font-semibold uppercase tracking-widest text-muted-foreground/60 mb-2.5">Plan Dağılımı</p>
              <div className="bg-card rounded-lg border p-4 space-y-2.5">
                {Object.entries(metrics.planDistribution).map(([plan, count]) => {
                  const pct = Math.min(100, ((count as number) / Math.max(metrics.totalSalons, 1)) * 100);
                  return (
                    <div key={plan} className="flex items-center gap-3">
                      <span className="text-[12px] font-medium w-24 shrink-0 uppercase tracking-wide">{plan}</span>
                      <div className="flex-1 h-2 bg-muted rounded-full overflow-hidden">
                        <div className="h-2 bg-primary rounded-full transition-all" style={{ width: `${pct}%` }} />
                      </div>
                      <span className="text-[12px] font-semibold tabular-nums w-6 text-right">{count as number}</span>
                    </div>
                  );
                })}
              </div>
            </div>
          )}
        </>
      )}
    </div>
  );
}

function StatCard({ icon: Icon, label, value, accent }: { icon: React.ComponentType<{ className?: string }>; label: string; value: number; accent?: boolean }) {
  return (
    <div className="bg-card rounded-lg border p-3.5">
      <div className="flex items-center gap-3">
        <div className={`p-1.5 rounded-md ${accent ? 'bg-primary/10' : 'bg-muted'}`}>
          <Icon className={`h-3.5 w-3.5 ${accent ? 'text-primary' : 'text-muted-foreground'}`} />
        </div>
        <div>
          <p className="text-lg font-semibold leading-none">{value}</p>
          <p className="text-[11px] text-muted-foreground mt-0.5">{label}</p>
        </div>
      </div>
    </div>
  );
}
