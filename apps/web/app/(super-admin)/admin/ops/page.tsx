'use client';

import { AlertCircle, Activity, CheckCircle2, XCircle, Server, Layers } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { useHealthStatus, useVersionInfo } from '@/hooks/api/use-admin';

export default function AdminOpsPage() {
  const { data: health, isLoading: hLoading, error: hError } = useHealthStatus();
  const { data: version, isLoading: vLoading } = useVersionInfo();

  return (
    <div className="space-y-5 max-w-6xl">
      {/* Page header */}
      <div className="flex items-center justify-between pb-1 border-b border-border/40">
        <div>
          <h1 className="text-xl font-semibold tracking-tight">Operasyon & Sağlık</h1>
          <p className="text-[11px] text-muted-foreground/70 mt-0.5">Read-only cockpit</p>
        </div>
        {health && (
          <Badge variant={health.status === 'ready' ? 'success' : 'destructive'} className="text-[10px]">
            {health.status === 'ready' ? '● Sağlıklı' : '○ Sorunlu'}
          </Badge>
        )}
      </div>

      {hError ? (
        <div className="flex items-center gap-2 text-destructive py-8 justify-center text-sm">
          <AlertCircle className="h-4 w-4" />
          <span>Sağlık verisi alınamadı.</span>
        </div>
      ) : hLoading ? (
        <div className="flex justify-center py-16">
          <div className="w-6 h-6 animate-spin rounded-full border-2 border-muted border-t-primary" />
        </div>
      ) : (
        <>
          {/* Infrastructure health */}
          <div>
            <p className="text-[10px] font-semibold uppercase tracking-widest text-muted-foreground/60 mb-2.5">Altyapı Sağlığı</p>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-2.5">
              <div className="bg-card rounded-lg border p-4 space-y-2">
                <h3 className="text-sm font-semibold flex items-center gap-2">
                  <Activity className="h-3.5 w-3.5 text-muted-foreground" />
                  Servis Durumu
                </h3>
                {health?.checks ? (
                  <div className="space-y-1.5">
                    <HealthRow name="PostgreSQL (Neon)" status={health.checks.database.status} latency={health.checks.database.latencyMs} />
                    <HealthRow name="Redis (Upstash)" status={health.checks.redis.status} latency={health.checks.redis.latencyMs} />
                  </div>
                ) : <p className="text-[11px] text-muted-foreground/70">Veri mevcut değil</p>}
              </div>

              {/* Version */}
              <div className="bg-card rounded-lg border p-4 space-y-2">
                <h3 className="text-sm font-semibold flex items-center gap-2">
                  <Server className="h-3.5 w-3.5 text-muted-foreground" />
                  Versiyon Bilgisi
                </h3>
                {vLoading ? (
                  <div className="flex justify-center py-3">
                    <div className="w-4 h-4 animate-spin rounded-full border-2 border-muted border-t-primary" />
                  </div>
                ) : version ? (
                  <div className="space-y-1.5 text-sm">
                    <div className="flex justify-between">
                      <span className="text-muted-foreground">Version</span>
                      <span className="font-mono text-[11px]">{version.version}</span>
                    </div>
                    {version.commit && (
                      <div className="flex justify-between">
                        <span className="text-muted-foreground">Commit</span>
                        <span className="font-mono text-[11px]">{version.commit}</span>
                      </div>
                    )}
                    <div className="flex justify-between">
                      <span className="text-muted-foreground">Node</span>
                      <span className="font-mono text-[11px]">{version.nodeVersion}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-muted-foreground">Ortam</span>
                      <Badge variant="secondary" className="text-[9px] px-1.5 py-0 h-4">{version.environment}</Badge>
                    </div>
                  </div>
                ) : <p className="text-[11px] text-muted-foreground/70">Veri yok</p>}
              </div>
            </div>
          </div>

          {/* Queue / Worker — proper empty state */}
          <div>
            <p className="text-[10px] font-semibold uppercase tracking-widest text-muted-foreground/60 mb-2.5">Queue & Worker</p>
            <div className="bg-card rounded-lg border p-4">
              <div className="flex flex-col items-center py-6">
                <div className="w-10 h-10 rounded-full bg-muted flex items-center justify-center mb-2.5">
                  <Layers className="h-4 w-4 text-muted-foreground/50" />
                </div>
                <p className="text-[13px] text-muted-foreground font-medium">Queue görünümü henüz aktif değil</p>
                <p className="text-[11px] text-muted-foreground/60 mt-0.5">Prometheus <code className="text-[10px] bg-muted px-1 py-0.5 rounded">/metrics</code> endpoint üzerinden erişilebilir</p>
                <p className="text-[10px] text-muted-foreground/40 mt-2">Sonraki faz: job sayıları · failed job listesi · DLQ görünümü</p>
              </div>
            </div>
          </div>
        </>
      )}
    </div>
  );
}

function HealthRow({ name, status, latency }: { name: string; status: string; latency: number }) {
  const up = status === 'up';
  return (
    <div className="flex items-center justify-between py-1.5 border-b border-border/40 last:border-0">
      <div className="flex items-center gap-2">
        {up ? <CheckCircle2 className="h-3.5 w-3.5 text-emerald-500" /> : <XCircle className="h-3.5 w-3.5 text-red-500" />}
        <span className="text-[13px]">{name}</span>
      </div>
      <span className={`text-[11px] font-mono tabular-nums ${up ? 'text-emerald-600 dark:text-emerald-400' : 'text-red-600 dark:text-red-400'}`}>
        {latency}ms
      </span>
    </div>
  );
}
