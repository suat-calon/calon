/**
 * CapacityPanel — Capacity & gap analysis
 * TASK 4: Günün doluluk oranı, boş/yoğun saatler
 * Basit heatmap hissi — karmaşık grafik değil
 */

import { cn } from '@/lib/utils';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Clock } from 'lucide-react';

export interface HourSlot {
  hour: number;
  /** 0-100 occupancy for this hour */
  occupancy: number;
  /** Number of appointments in this hour */
  appointments: number;
}

export interface CapacityStats {
  overallOccupancy: number;
  hourSlots: HourSlot[];
  busiestHours: string[];
  emptiestHours: string[];
}

function getHeatColor(occupancy: number): string {
  if (occupancy >= 80) return 'bg-green-500';
  if (occupancy >= 50) return 'bg-primary/70';
  if (occupancy >= 20) return 'bg-yellow-400';
  if (occupancy > 0) return 'bg-yellow-200';
  return 'bg-muted';
}

function getTextColor(occupancy: number): string {
  if (occupancy >= 80) return 'text-green-700';
  if (occupancy >= 50) return 'text-primary';
  if (occupancy > 0) return 'text-yellow-700';
  return 'text-muted-foreground';
}

interface CapacityPanelProps {
  data: CapacityStats | null;
  loading?: boolean;
  className?: string;
}

export function CapacityPanel({ data, loading, className }: CapacityPanelProps) {
  if (loading) {
    return (
      <Card className={className}>
        <CardHeader className="pb-2"><CardTitle className="text-sm font-semibold">Kapasite Analizi</CardTitle></CardHeader>
        <CardContent>
          <div className="space-y-3">
            <div className="h-4 w-32 rounded bg-muted shimmer" />
            <div className="grid grid-cols-10 gap-1">
              {Array.from({ length: 10 }).map((_, i) => (
                <div key={i} className="h-8 rounded bg-muted shimmer" />
              ))}
            </div>
            <div className="h-3 w-48 rounded bg-muted shimmer" />
          </div>
        </CardContent>
      </Card>
    );
  }

  if (!data || data.hourSlots.length === 0) {
    return (
      <Card className={className}>
        <CardHeader className="pb-2"><CardTitle className="text-sm font-semibold">Kapasite Analizi</CardTitle></CardHeader>
        <CardContent>
          <div className="flex flex-col items-center py-6 text-center">
            <div className="rounded-full bg-muted p-3 mb-3"><Clock className="h-5 w-5 text-muted-foreground" /></div>
            <p className="text-sm font-medium text-muted-foreground">Henüz yeterli veri yok</p>
            <p className="text-xs text-muted-foreground mt-1">Randevu verileri oluştukça kapasite analizi görünecek.</p>
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className={className}>
      <CardHeader className="pb-2">
        <div className="flex items-center justify-between">
          <CardTitle className="text-sm font-semibold">Kapasite Analizi</CardTitle>
          <span className={cn(
            'text-xs font-medium',
            data.overallOccupancy >= 70 ? 'text-green-600' : data.overallOccupancy >= 40 ? 'text-primary' : 'text-yellow-600',
          )}>
            %{data.overallOccupancy} doluluk
          </span>
        </div>
      </CardHeader>
      <CardContent>
        {/* Hour heatmap grid */}
        <div className="grid grid-cols-5 sm:grid-cols-10 gap-1 mb-4">
          {data.hourSlots.map((slot) => (
            <div
              key={slot.hour}
              className="flex flex-col items-center"
              title={`${slot.hour}:00 — %${slot.occupancy} dolu, ${slot.appointments} randevu`}
            >
              <div className={cn(
                'w-full h-7 rounded-sm flex items-center justify-center transition-colors',
                getHeatColor(slot.occupancy),
              )}>
                <span className="text-[9px] font-bold text-white/90">
                  {slot.appointments > 0 ? slot.appointments : ''}
                </span>
              </div>
              <span className="text-[9px] text-muted-foreground mt-0.5">
                {slot.hour}
              </span>
            </div>
          ))}
        </div>

        {/* Legend */}
        <div className="flex items-center gap-3 mb-3">
          <div className="flex items-center gap-1"><div className="w-3 h-3 rounded-sm bg-green-500" /><span className="text-[10px] text-muted-foreground">Yoğun</span></div>
          <div className="flex items-center gap-1"><div className="w-3 h-3 rounded-sm bg-primary/70" /><span className="text-[10px] text-muted-foreground">Normal</span></div>
          <div className="flex items-center gap-1"><div className="w-3 h-3 rounded-sm bg-yellow-400" /><span className="text-[10px] text-muted-foreground">Az</span></div>
          <div className="flex items-center gap-1"><div className="w-3 h-3 rounded-sm bg-muted" /><span className="text-[10px] text-muted-foreground">Boş</span></div>
        </div>

        {/* Key insights */}
        <div className="grid grid-cols-2 gap-3">
          {data.busiestHours.length > 0 && (
            <div>
              <p className="text-[10px] text-muted-foreground mb-1">En yoğun saatler</p>
              <p className="text-xs font-medium text-green-700">{data.busiestHours.join(', ')}</p>
            </div>
          )}
          {data.emptiestHours.length > 0 && (
            <div>
              <p className="text-[10px] text-muted-foreground mb-1">En boş saatler</p>
              <p className="text-xs font-medium text-yellow-700">{data.emptiestHours.join(', ')}</p>
            </div>
          )}
        </div>
      </CardContent>
    </Card>
  );
}
