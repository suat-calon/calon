'use client';

import { Loader2, AlertCircle, Activity, CheckCircle2, XCircle } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { useHealthStatus, useVersionInfo } from '@/hooks/api/use-admin';

export default function AdminOpsPage() {
  const { data: health, isLoading: hLoading, error: hError } = useHealthStatus();
  const { data: version, isLoading: vLoading } = useVersionInfo();

  return (
    <div className="space-y-6 max-w-4xl">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold tracking-tight">Operasyon & Sağlık</h1>
        {health && (
          <Badge variant={health.status === 'ready' ? 'success' : 'destructive'} className="text-xs">
            {health.status === 'ready' ? '● Sağlıklı' : '○ Sorunlu'}
          </Badge>
        )}
      </div>

      {hError ? (
        <div className="flex items-center gap-2 text-destructive py-8 justify-center">
          <AlertCircle className="h-5 w-5" /><span>Sağlık verisi alınamadı.</span>
        </div>
      ) : hLoading ? (
        <div className="flex justify-center py-12"><Loader2 className="h-6 w-6 animate-spin text-primary" /></div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {/* Health checks */}
          <div className="bg-white rounded-xl border p-5 space-y-3">
            <h3 className="text-sm font-semibold flex items-center gap-2"><Activity className="h-4 w-4" />Altyapı Sağlığı</h3>
            {health?.checks ? (
              <div className="space-y-2">
                <HealthRow name="PostgreSQL (Neon)" status={health.checks.database.status} latency={health.checks.database.latencyMs} />
                <HealthRow name="Redis (Upstash)" status={health.checks.redis.status} latency={health.checks.redis.latencyMs} />
              </div>
            ) : <p className="text-sm text-muted-foreground">Veri mevcut değil</p>}
          </div>

          {/* Version */}
          <div className="bg-white rounded-xl border p-5 space-y-3">
            <h3 className="text-sm font-semibold">Versiyon Bilgisi</h3>
            {vLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : version ? (
              <div className="space-y-1.5 text-sm">
                <div className="flex justify-between"><span className="text-muted-foreground">Version</span><span className="font-mono">{version.version}</span></div>
                <div className="flex justify-between"><span className="text-muted-foreground">Commit</span><span className="font-mono text-xs">{version.commit}</span></div>
                <div className="flex justify-between"><span className="text-muted-foreground">Node</span><span>{version.nodeVersion}</span></div>
                <div className="flex justify-between"><span className="text-muted-foreground">Ortam</span><Badge variant="secondary" className="text-[9px]">{version.environment}</Badge></div>
              </div>
            ) : <p className="text-sm text-muted-foreground">Veri yok</p>}
          </div>
        </div>
      )}

      <div className="bg-white rounded-xl border p-5 space-y-2">
        <h3 className="text-sm font-semibold">Queue / Worker</h3>
        <p className="text-sm text-muted-foreground">Queue detay metrikleri Prometheus <code>/metrics</code> endpoint üzerinden erişilebilir. Bu fazda doğrudan queue görünümü henüz aktif değil.</p>
        <p className="text-xs text-muted-foreground italic">Sonraki fazda: queue job sayıları, failed job listesi, DLQ görünümü</p>
      </div>

      <p className="text-[10px] text-muted-foreground italic">Read-only cockpit. Retry/replay/delete aksiyonları bu fazda devre dışı.</p>
    </div>
  );
}

function HealthRow({ name, status, latency }: { name: string; status: string; latency: number }) {
  const up = status === 'up';
  return (
    <div className="flex items-center justify-between py-1.5 border-b last:border-0">
      <div className="flex items-center gap-2">
        {up ? <CheckCircle2 className="h-4 w-4 text-emerald-500" /> : <XCircle className="h-4 w-4 text-red-500" />}
        <span className="text-sm">{name}</span>
      </div>
      <span className={`text-xs font-mono ${up ? 'text-emerald-600' : 'text-red-600'}`}>{latency}ms</span>
    </div>
  );
}
