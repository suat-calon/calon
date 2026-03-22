/**
 * ServicePerformance — Service performance panel
 * TASK 2: "Hangi hizmeti öne çıkarayım?" sorusunu cevaplar
 * Tablo YASAK — kart listesi / horizontal bar list
 */

'use client';

import { useState } from 'react';
import { cn } from '@/lib/utils';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Scissors, TrendingUp } from 'lucide-react';
import { InlineEdit } from './inline-edit';
import { ChevronRight } from 'lucide-react';

export interface ServiceStat {
  id: string;
  name: string;
  appointmentCount: number;
  totalRevenue: number;
  avgDuration: number;
  occupancyPct: number;
  price: number;
  isActive: boolean;
  currency: string;
}

interface ServicePerformanceProps {
  services: ServiceStat[];
  onPriceChange?: (id: string, newPrice: string) => void;
  onDurationChange?: (id: string, newDuration: string) => void;
  onToggleActive?: (id: string) => void;
  loading?: boolean;
  className?: string;
}

function formatCurrency(amount: number, currency: string): string {
  return new Intl.NumberFormat('tr-TR', { style: 'currency', currency, maximumFractionDigits: 0 }).format(amount);
}

const MAX_VISIBLE = 5;

export function ServicePerformance({
  services, onPriceChange, onDurationChange, onToggleActive, loading, className,
}: ServicePerformanceProps) {
  const [showAll, setShowAll] = useState(false);

  if (loading) {
    return (
      <Card className={className}>
        <CardHeader className="pb-2"><CardTitle className="text-sm font-semibold">Hizmet Performansı</CardTitle></CardHeader>
        <CardContent className="space-y-2">
          {[1,2,3].map((i) => (
            <div key={i} className="flex items-center gap-3 rounded-lg border p-3">
              <div className="flex-1 space-y-1.5"><div className="h-4 w-24 rounded bg-muted shimmer" /><div className="h-3 w-40 rounded bg-muted shimmer" /></div>
              <div className="w-16 space-y-1"><div className="h-4 w-14 rounded bg-muted shimmer" /><div className="h-1.5 w-16 rounded-full bg-muted shimmer" /></div>
            </div>
          ))}
        </CardContent>
      </Card>
    );
  }

  if (services.length === 0) {
    return (
      <Card className={className}>
        <CardHeader className="pb-2"><CardTitle className="text-sm font-semibold">Hizmet Performansı</CardTitle></CardHeader>
        <CardContent>
          <div className="flex flex-col items-center py-6 text-center">
            <div className="rounded-full bg-muted p-3 mb-3"><Scissors className="h-5 w-5 text-muted-foreground" /></div>
            <p className="text-sm font-medium text-muted-foreground">Henüz yeterli hizmet verisi yok</p>
            <p className="text-xs text-muted-foreground mt-1">Randevular tamamlandıkça burada görünecek.</p>
          </div>
        </CardContent>
      </Card>
    );
  }

  // Sort by revenue desc — best performer first
  const sorted = [...services].sort((a, b) => b.totalRevenue - a.totalRevenue);
  const bestId = sorted[0]?.id;
  const worstId = sorted.length >= 3 ? sorted[sorted.length - 1]?.id : null;
  const maxRevenue = sorted[0]?.totalRevenue ?? 1;

  const visible = showAll ? sorted : sorted.slice(0, MAX_VISIBLE);
  const hiddenCount = sorted.length - MAX_VISIBLE;

  return (
    <Card className={className}>
      <CardHeader className="pb-2">
        <div className="flex items-center justify-between">
          <CardTitle className="text-sm font-semibold">Hizmet Performansı</CardTitle>
          <Badge variant="outline" className="text-[10px]">{services.length} hizmet</Badge>
        </div>
      </CardHeader>
      <CardContent className="space-y-2">
        {visible.map((svc) => {
          const barWidth = maxRevenue > 0 ? Math.round((svc.totalRevenue / maxRevenue) * 100) : 0;
          const isBest = svc.id === bestId;
          const isWorst = svc.id === worstId && svc.occupancyPct < 30;

          return (
            <div
              key={svc.id}
              className={cn(
                'rounded-lg border p-3 transition-colors',
                !svc.isActive && 'opacity-50',
                isBest && 'border-green-200 bg-green-50/30',
                isWorst && 'border-yellow-200 bg-yellow-50/30',
              )}
            >
              <div className="flex items-center gap-3">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 mb-1">
                    <span className="text-sm font-medium truncate">{svc.name}</span>
                    {isBest && <Badge variant="success" className="text-[10px] px-1.5 py-0">En iyi</Badge>}
                    {isWorst && <Badge variant="warning" className="text-[10px] px-1.5 py-0">Düşük</Badge>}
                    {!svc.isActive && <Badge variant="secondary" className="text-[10px] px-1.5 py-0">Pasif</Badge>}
                  </div>
                  <div className="flex items-center gap-3 text-xs text-muted-foreground flex-wrap">
                    <span>{svc.appointmentCount} randevu</span>
                    <span>·</span>
                    <InlineEdit
                      value={svc.price}
                      onSave={(v) => onPriceChange?.(svc.id, v)}
                      prefix="₺"
                      type="number"
                    />
                    <span>·</span>
                    <InlineEdit
                      value={svc.avgDuration}
                      onSave={(v) => onDurationChange?.(svc.id, v)}
                      suffix="dk"
                      type="number"
                    />
                    {onToggleActive && (
                      <>
                        <span>·</span>
                        <button
                          type="button"
                          onClick={() => onToggleActive(svc.id)}
                          className="text-xs font-medium text-primary hover:underline"
                        >
                          {svc.isActive ? 'Pasife al' : 'Aktif yap'}
                        </button>
                      </>
                    )}
                  </div>
                </div>
                <div className="shrink-0 text-right w-20">
                  <p className="text-sm font-bold">{formatCurrency(svc.totalRevenue, svc.currency)}</p>
                  <p className="text-[10px] text-muted-foreground">%{svc.occupancyPct} doluluk</p>
                </div>
              </div>
              {/* Revenue bar */}
              <div className="h-1.5 w-full rounded-full bg-muted overflow-hidden mt-2">
                <div
                  className={cn(
                    'h-full rounded-full transition-all',
                    isBest ? 'bg-green-500' : isWorst ? 'bg-yellow-400' : 'bg-primary/60',
                  )}
                  style={{ width: `${barWidth}%` }}
                />
              </div>
            </div>
          );
        })}
        {hiddenCount > 0 && (
          <button
            type="button"
            onClick={() => setShowAll((v) => !v)}
            className="flex items-center justify-center gap-1 w-full rounded-lg border border-dashed py-2 text-xs font-medium text-muted-foreground hover:text-foreground hover:border-border transition-colors"
          >
            {showAll ? 'Daha az göster' : `+${hiddenCount} daha var`}
            {!showAll && <ChevronRight className="h-3.5 w-3.5" />}
          </button>
        )}
      </CardContent>
    </Card>
  );
}
