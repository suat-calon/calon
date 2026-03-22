/**
 * Timeline — Live appointments with status color coding
 * Active (IN_SERVICE) = primary, upcoming = muted, overdue/no-show = red
 * Scroll container for overflow, empty state with CTA
 */

import { Calendar } from 'lucide-react';
import { cn } from '@/lib/utils';
import { Badge }  from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import type { LiveAppointment, AppointmentStatus } from '@/lib/dashboard-mock';

// ── Status config ─────────────────────────────────────────────────────────────

const STATUS_CONFIG: Record<AppointmentStatus, {
  label: string;
  badge: 'default' | 'secondary' | 'destructive' | 'success' | 'warning' | 'info' | 'outline';
  dot: string;
}> = {
  PENDING:    { label: 'Bekliyor',   badge: 'warning',     dot: 'bg-yellow-400' },
  CONFIRMED:  { label: 'Onaylı',     badge: 'info',        dot: 'bg-blue-400' },
  CHECKED_IN: { label: 'Geldi',      badge: 'info',        dot: 'bg-blue-500' },
  IN_SERVICE: { label: 'Hizmette',   badge: 'default',     dot: 'bg-primary' },
  COMPLETED:  { label: 'Tamamlandı', badge: 'success',     dot: 'bg-green-500' },
  CANCELLED:  { label: 'İptal',      badge: 'destructive', dot: 'bg-red-400' },
  NO_SHOW:    { label: 'Gelmedi',    badge: 'destructive', dot: 'bg-red-500' },
};

function formatShortTime(iso: string): string {
  try {
    const d = new Date(iso);
    if (isNaN(d.getTime())) return '--:--';
    return d.toLocaleTimeString('tr-TR', { hour: '2-digit', minute: '2-digit' });
  } catch {
    return '--:--';
  }
}

// ── Components ────────────────────────────────────────────────────────────────

interface TimelineProps {
  appointments: LiveAppointment[];
  className?: string;
  /** Loading state → show skeleton */
  loading?: boolean;
}

export function Timeline({ appointments, className, loading }: TimelineProps) {
  if (loading) {
    return <TimelineSkeleton />;
  }

  if (appointments.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-8 text-center">
        <div className="rounded-full bg-muted p-3 mb-3">
          <Calendar className="h-5 w-5 text-muted-foreground" />
        </div>
        <p className="text-sm font-medium text-muted-foreground mb-1">
          Bugün planlanmış randevu yok
        </p>
        <p className="text-xs text-muted-foreground mb-3">
          Yeni randevu oluşturarak günü planlayın.
        </p>
        <Button size="sm" variant="outline" asChild>
          <a href="/calendar">Yeni randevu oluştur</a>
        </Button>
      </div>
    );
  }

  return (
    <div
      className={cn(
        'space-y-0 max-h-[480px] overflow-y-auto scrollbar-thin pr-1',
        className,
      )}
    >
      {appointments.map((apt, idx) => {
        const cfg = STATUS_CONFIG[apt.status];
        const isActive = apt.status === 'IN_SERVICE' || apt.status === 'CHECKED_IN';
        const isLast = idx === appointments.length - 1;

        return (
          <div key={apt.id} className="flex gap-3">
            {/* Timeline rail */}
            <div className="flex flex-col items-center">
              <div
                className={cn(
                  'mt-1.5 h-2.5 w-2.5 rounded-full shrink-0 ring-2 ring-background',
                  cfg.dot,
                  isActive && 'animate-pulse',
                )}
              />
              {!isLast && (
                <div className="w-px flex-1 bg-border" />
              )}
            </div>

            {/* Content */}
            <div className={cn(
              'flex-1 pb-4 min-w-0',
              isLast && 'pb-0',
            )}>
              <div className="flex items-center gap-2 flex-wrap">
                <span className="text-xs font-mono text-muted-foreground">
                  {formatShortTime(apt.startTime)}–{formatShortTime(apt.endTime)}
                </span>
                <Badge variant={cfg.badge} className="text-[10px] px-1.5 py-0">
                  {cfg.label}
                </Badge>
              </div>
              <p className={cn(
                'text-sm font-medium mt-0.5 truncate',
                isActive && 'text-primary',
              )}>
                {apt.customerName || 'İsimsiz müşteri'}
              </p>
              <p className="text-xs text-muted-foreground truncate">
                {apt.serviceName || 'Hizmet belirtilmedi'} — {apt.staffName || 'Atanmamış'}
              </p>
            </div>
          </div>
        );
      })}
    </div>
  );
}

/** Skeleton for loading state — matches real layout dimensions */
function TimelineSkeleton() {
  return (
    <div className="space-y-0">
      {Array.from({ length: 4 }).map((_, i) => (
        <div key={i} className="flex gap-3">
          <div className="flex flex-col items-center">
            <div className="mt-1.5 h-2.5 w-2.5 rounded-full bg-muted shimmer ring-2 ring-background" />
            {i < 3 && <div className="w-px flex-1 bg-border" />}
          </div>
          <div className={cn('flex-1 min-w-0', i < 3 ? 'pb-4' : 'pb-0')}>
            <div className="flex items-center gap-2 mb-1">
              <div className="h-3 w-20 rounded bg-muted shimmer" />
              <div className="h-4 w-14 rounded-full bg-muted shimmer" />
            </div>
            <div className="h-4 w-28 rounded bg-muted shimmer mb-1" />
            <div className="h-3 w-36 rounded bg-muted shimmer" />
          </div>
        </div>
      ))}
    </div>
  );
}
