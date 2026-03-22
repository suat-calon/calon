/**
 * RetentionCard — Customer retention overview panel
 * FAZ UI-12 TASK 1: Müşteri geri dönüş oranları
 *
 * KURAL: Sahte growth metriği YASAK
 * KURAL: Gerçek veriyi göster, uydurma yok
 */

import { cn } from '@/lib/utils';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Heart, UserPlus, AlertTriangle, Users } from 'lucide-react';
import type { RetentionStats } from '@/lib/dashboard-mock';

interface RetentionCardProps {
  data: RetentionStats | null;
  loading?: boolean;
  className?: string;
}

function MetricBlock({ icon, label, value, subtext, color }: {
  icon: React.ReactNode;
  label: string;
  value: string | number;
  subtext?: string;
  color: string;
}) {
  return (
    <div className="flex items-start gap-2">
      <div className={cn('rounded-lg p-1.5 shrink-0', color)}>
        {icon}
      </div>
      <div className="min-w-0">
        <p className="text-lg font-bold leading-tight">{value}</p>
        <p className="text-[10px] text-muted-foreground">{label}</p>
        {subtext && <p className="text-[10px] text-muted-foreground/70">{subtext}</p>}
      </div>
    </div>
  );
}

export function RetentionCard({ data, loading, className }: RetentionCardProps) {
  if (loading) {
    return (
      <Card className={className}>
        <CardHeader className="pb-2"><CardTitle className="text-sm font-semibold">Müşteri Geri Dönüşü</CardTitle></CardHeader>
        <CardContent>
          <div className="grid grid-cols-2 gap-4">
            {[1, 2, 3, 4].map((i) => (
              <div key={i} className="space-y-1">
                <div className="h-6 w-10 rounded bg-muted shimmer" />
                <div className="h-3 w-20 rounded bg-muted shimmer" />
              </div>
            ))}
          </div>
        </CardContent>
      </Card>
    );
  }

  if (!data) {
    return (
      <Card className={className}>
        <CardHeader className="pb-2"><CardTitle className="text-sm font-semibold">Müşteri Geri Dönüşü</CardTitle></CardHeader>
        <CardContent>
          <div className="flex flex-col items-center py-6 text-center">
            <div className="rounded-full bg-muted p-3 mb-3"><Heart className="h-5 w-5 text-muted-foreground" /></div>
            <p className="text-sm font-medium text-muted-foreground">Henüz müşteri geri dönüş verisi yok</p>
            <p className="text-xs text-muted-foreground mt-1">Müşteriler tekrar geldikçe burada görünecek.</p>
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className={className}>
      <CardHeader className="pb-2">
        <div className="flex items-center justify-between">
          <CardTitle className="text-sm font-semibold">Müşteri Geri Dönüşü</CardTitle>
          <span className={cn(
            'text-xs font-medium px-2 py-0.5 rounded-full',
            data.retentionRate >= 70 ? 'bg-green-50 text-green-700' : 'bg-yellow-50 text-yellow-700',
          )}>
            %{data.retentionRate} geri dönüş
          </span>
        </div>
      </CardHeader>
      <CardContent>
        <div className="grid grid-cols-2 gap-4">
          <MetricBlock
            icon={<Heart className="h-3.5 w-3.5 text-green-600" />}
            color="bg-green-50"
            label="Geri Dönen"
            value={data.returningThisWeek}
            subtext="bu hafta"
          />
          <MetricBlock
            icon={<UserPlus className="h-3.5 w-3.5 text-blue-600" />}
            color="bg-blue-50"
            label="Yeni Müşteri"
            value={data.newThisWeek}
            subtext="bu hafta"
          />
          <MetricBlock
            icon={<AlertTriangle className="h-3.5 w-3.5 text-red-600" />}
            color="bg-red-50"
            label="Kayıp Riski"
            value={data.atRiskCount}
            subtext="müşteri"
          />
          <MetricBlock
            icon={<Users className="h-3.5 w-3.5 text-yellow-600" />}
            color="bg-yellow-50"
            label="Tek Seferlik Oran"
            value={`%${data.oneTimeRate}`}
            subtext={`ort. ${data.avgVisitFrequencyDays} gün aralık`}
          />
        </div>
      </CardContent>
    </Card>
  );
}
