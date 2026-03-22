/**
 * StaffPerformance — Staff performance & availability panel
 * TASK 3 + TASK 6: Uzman performansı + availability override
 */

'use client';

import { cn } from '@/lib/utils';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { User, Briefcase } from 'lucide-react';

export interface StaffStat {
  id: string;
  name: string;
  role: string;
  todayAppointments: number;
  completedAppointments: number;
  noShowCount: number;
  avgServiceDuration: number;
  estimatedRevenue: number;
  availability: 'available' | 'busy' | 'off';
  currency: string;
}

function formatCurrency(amount: number, currency: string): string {
  return new Intl.NumberFormat('tr-TR', { style: 'currency', currency, maximumFractionDigits: 0 }).format(amount);
}

interface StaffPerformanceProps {
  staff: StaffStat[];
  onAvailabilityChange?: (id: string, newStatus: StaffStat['availability']) => void;
  loading?: boolean;
  className?: string;
}

export function StaffPerformance({ staff, onAvailabilityChange, loading, className }: StaffPerformanceProps) {
  if (loading) {
    return (
      <Card className={className}>
        <CardHeader className="pb-2"><CardTitle className="text-sm font-semibold">Uzman Performansı</CardTitle></CardHeader>
        <CardContent className="space-y-2">
          {[1,2,3].map((i) => (
            <div key={i} className="flex items-center gap-3 rounded-lg border p-3">
              <div className="w-9 h-9 rounded-full bg-muted shimmer" />
              <div className="flex-1 space-y-1.5"><div className="h-4 w-20 rounded bg-muted shimmer" /><div className="h-3 w-36 rounded bg-muted shimmer" /></div>
              <div className="w-16 space-y-1"><div className="h-4 w-14 rounded bg-muted shimmer" /><div className="h-1.5 w-16 rounded-full bg-muted shimmer" /></div>
            </div>
          ))}
        </CardContent>
      </Card>
    );
  }

  if (staff.length === 0) {
    return (
      <Card className={className}>
        <CardHeader className="pb-2"><CardTitle className="text-sm font-semibold">Uzman Performansı</CardTitle></CardHeader>
        <CardContent>
          <div className="flex flex-col items-center py-6 text-center">
            <div className="rounded-full bg-muted p-3 mb-3"><Briefcase className="h-5 w-5 text-muted-foreground" /></div>
            <p className="text-sm font-medium text-muted-foreground">Henüz uzman verisi yok</p>
          </div>
        </CardContent>
      </Card>
    );
  }

  // Sort by revenue desc
  const sorted = [...staff].sort((a, b) => b.estimatedRevenue - a.estimatedRevenue);
  const maxRevenue = sorted[0]?.estimatedRevenue ?? 1;

  return (
    <Card className={className}>
      <CardHeader className="pb-2">
        <div className="flex items-center justify-between">
          <CardTitle className="text-sm font-semibold">Uzman Performansı</CardTitle>
          <Badge variant="outline" className="text-[10px]">{staff.length} uzman</Badge>
        </div>
      </CardHeader>
      <CardContent className="space-y-2">
        {sorted.map((s) => {
          const completionRate = s.todayAppointments > 0
            ? Math.round((s.completedAppointments / s.todayAppointments) * 100)
            : 0;
          const noShowRate = s.todayAppointments > 0
            ? Math.round((s.noShowCount / s.todayAppointments) * 100)
            : 0;
          const barWidth = maxRevenue > 0 ? Math.round((s.estimatedRevenue / maxRevenue) * 100) : 0;
          const isRisky = noShowRate >= 20;
          const isOff = s.availability === 'off';

          return (
            <div
              key={s.id}
              className={cn(
                'rounded-lg border p-3 transition-colors',
                isRisky && 'border-red-200 bg-red-50/30',
                isOff && 'opacity-50',
              )}
            >
              <div className="flex items-center gap-3">
                {/* Avatar */}
                <div className="relative shrink-0">
                  <div className="w-9 h-9 rounded-full bg-muted flex items-center justify-center">
                    <User className="h-4 w-4 text-muted-foreground" />
                  </div>
                  <div className={cn(
                    'absolute -bottom-0.5 -right-0.5 h-3 w-3 rounded-full border-2 border-background',
                    s.availability === 'busy' ? 'bg-primary animate-pulse' : s.availability === 'available' ? 'bg-green-500' : 'bg-gray-400',
                  )} />
                </div>

                {/* Info */}
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 mb-0.5">
                    <span className="text-sm font-medium truncate">{s.name}</span>
                    {isRisky && <Badge variant="destructive" className="text-[10px] px-1.5 py-0">Riskli</Badge>}
                    {s.todayAppointments >= 6 && <Badge variant="warning" className="text-[10px] px-1.5 py-0">Yoğun</Badge>}
                  </div>
                  <div className="flex items-center gap-2 text-xs text-muted-foreground flex-wrap">
                    <span>{s.role}</span>
                    <span>·</span>
                    <span>{s.completedAppointments}/{s.todayAppointments} randevu</span>
                    {s.noShowCount > 0 && (
                      <>
                        <span>·</span>
                        <span className="text-red-600">{s.noShowCount} no-show</span>
                      </>
                    )}
                    <span>·</span>
                    <span>{s.avgServiceDuration} dk ort.</span>
                  </div>
                  {/* Availability toggle — TASK 6 */}
                  {onAvailabilityChange && (
                    <div className="flex items-center gap-1.5 mt-1.5">
                      {(['available', 'busy', 'off'] as const).map((st) => (
                        <button
                          key={st}
                          type="button"
                          onClick={() => onAvailabilityChange(s.id, st)}
                          className={cn(
                            'px-2 py-0.5 rounded text-[10px] font-medium border transition-colors',
                            s.availability === st
                              ? st === 'available' ? 'bg-green-100 text-green-800 border-green-200'
                                : st === 'busy' ? 'bg-primary/10 text-primary border-primary/20'
                                : 'bg-gray-100 text-gray-600 border-gray-200'
                              : 'bg-transparent text-muted-foreground border-transparent hover:bg-accent',
                          )}
                        >
                          {st === 'available' ? 'Müsait' : st === 'busy' ? 'Dolu' : 'İzinli'}
                        </button>
                      ))}
                    </div>
                  )}
                </div>

                {/* Revenue */}
                <div className="shrink-0 text-right w-20">
                  <p className="text-sm font-bold">{formatCurrency(s.estimatedRevenue, s.currency)}</p>
                  <p className="text-[10px] text-muted-foreground">%{completionRate} tamamlama</p>
                </div>
              </div>
              {/* Revenue contribution bar */}
              <div className="h-1.5 w-full rounded-full bg-muted overflow-hidden mt-2">
                <div
                  className={cn(
                    'h-full rounded-full transition-all',
                    isRisky ? 'bg-red-400' : barWidth >= 80 ? 'bg-green-500' : 'bg-primary/60',
                  )}
                  style={{ width: `${barWidth}%` }}
                />
              </div>
            </div>
          );
        })}
      </CardContent>
    </Card>
  );
}
