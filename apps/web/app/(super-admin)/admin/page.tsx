'use client';

import { AlertCircle, Building2, Users, Calendar, TrendingUp } from 'lucide-react';
import { useAdminOverview, useGrowthMetrics, useHealthStatus, useVersionInfo } from '@/hooks/api/use-admin';

export default function AdminOverviewPage() {
  const { data: overview, isLoading: ovLoading, error: ovError } = useAdminOverview();
  const { data: growth, isLoading: grLoading, error: grError } = useGrowthMetrics();
  const { data: health } = useHealthStatus();
  const { data: version } = useVersionInfo();

  const loading = ovLoading || grLoading;
  const error = ovError || grError;

  return (
    <div className="space-y-5 max-w-6xl">
      {/* Header */}
      <div className="flex items-center justify-between pb-1 border-b border-border/40">
        <h1 className="text-lg font-semibold tracking-tight">Platform Genel Bakış</h1>
        {health && (
          <span className={`text-[10px] px-2 py-0.5 rounded-full font-semibold ${health.checks?.database?.status === 'up' ? 'bg-emerald-100 dark:bg-emerald-950/40 text-emerald-700 dark:text-emerald-400' : 'bg-red-100 dark:bg-red-950/40 text-red-700 dark:text-red-400'}`}>
            {health.status === 'ready' ? '● Sağlıklı' : '○ Sorunlu'}
          </span>
        )}
      </div>

      {error ? (
        <div className="flex items-center gap-2 text-destructive py-8 justify-center text-sm">
          <AlertCircle className="h-4 w-4" />
          <span>{error.message.includes('401') ? 'Geçersiz oturum.' : 'Veriler yüklenemedi.'}</span>
        </div>
      ) : loading ? (
        <div className="flex justify-center py-16">
          <div className="w-6 h-6 animate-spin rounded-full border-2 border-muted border-t-primary" />
        </div>
      ) : (
        <>
          {/* Stat cards */}
          <div>
            <p className="text-[10px] font-semibold uppercase tracking-widest text-muted-foreground/60 mb-2.5">Platform Metrikleri</p>
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-2.5">
              <StatCard icon={Building2} label="Toplam Salon" value={overview?.totalTenants ?? growth?.totalSalons ?? 0} />
              <StatCard icon={Users} label="Aktif Salon" value={overview?.activeTenants ?? growth?.activeSalons ?? 0} accent />
              <StatCard icon={Calendar} label="Bugünkü Randevu" value={growth?.bookingsToday ?? 0} />
              <StatCard icon={TrendingUp} label="Bu Ay Yeni" value={growth?.newSalonsThisMonth ?? 0} />
            </div>
          </div>

          {/* Health + Version */}
          <div>
            <p className="text-[10px] font-semibold uppercase tracking-widest text-muted-foreground/60 mb-2.5">Altyapı</p>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-2.5">
              <div className="bg-card rounded-lg border p-4 space-y-2">
                <h3 className="text-[13px] font-semibold">Platform Sağlığı</h3>
                {health?.checks ? (
                  <div className="space-y-1.5 text-[13px]">
                    <div className="flex justify-between"><span className="text-muted-foreground">Database</span><span className={health.checks.database.status === 'up' ? 'text-emerald-600 dark:text-emerald-400' : 'text-red-600 dark:text-red-400'}>{health.checks.database.status} ({health.checks.database.latencyMs}ms)</span></div>
                    <div className="flex justify-between"><span className="text-muted-foreground">Redis</span><span className={health.checks.redis.status === 'up' ? 'text-emerald-600 dark:text-emerald-400' : 'text-red-600 dark:text-red-400'}>{health.checks.redis.status} ({health.checks.redis.latencyMs}ms)</span></div>
                  </div>
                ) : <p className="text-[11px] text-muted-foreground/70">Veri yok</p>}
              </div>
              <div className="bg-card rounded-lg border p-4 space-y-2">
                <h3 className="text-[13px] font-semibold">Versiyon</h3>
                {version ? (
                  <div className="space-y-1.5 text-[13px]">
                    <div className="flex justify-between"><span className="text-muted-foreground">Version</span><span className="font-mono text-[11px]">{version.version}</span></div>
                    <div className="flex justify-between"><span className="text-muted-foreground">Node</span><span className="font-mono text-[11px]">{version.nodeVersion}</span></div>
                    <div className="flex justify-between"><span className="text-muted-foreground">Ortam</span><span className="font-mono text-[11px]">{version.environment}</span></div>
                  </div>
                ) : <p className="text-[11px] text-muted-foreground/70">Veri yok</p>}
              </div>
            </div>
          </div>

          {/* Plan distribution */}
          {growth?.planDistribution && Object.keys(growth.planDistribution).length > 0 && (
            <div>
              <p className="text-[10px] font-semibold uppercase tracking-widest text-muted-foreground/60 mb-2.5">Plan Dağılımı</p>
              <div className="bg-card rounded-lg border p-4">
                <div className="flex gap-6">
                  {Object.entries(growth.planDistribution).map(([plan, count]) => (
                    <div key={plan} className="text-center">
                      <p className="text-lg font-semibold">{count as number}</p>
                      <p className="text-[10px] text-muted-foreground uppercase tracking-wide">{plan}</p>
                    </div>
                  ))}
                </div>
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
