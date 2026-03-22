/**
 * StaffOpsCard — Staff operations panel card
 * TASK 4: Hangi uzman dolu, kimin boş slotu var, kimin günü yoğun
 */

import { cn } from '@/lib/utils';
import { Badge } from '@/components/ui/badge';
import { User, Clock } from 'lucide-react';
import type { StaffOp } from '@/lib/dashboard-mock';

const STATUS_CONFIG: Record<StaffOp['currentStatus'], { label: string; badge: 'default' | 'warning' | 'secondary' | 'outline'; dot: string }> = {
  busy:      { label: 'Dolu',    badge: 'default',   dot: 'bg-primary' },
  available: { label: 'Müsait',  badge: 'secondary', dot: 'bg-green-500' },
  break:     { label: 'Mola',    badge: 'warning',   dot: 'bg-yellow-400' },
  off:       { label: 'İzinli',  badge: 'outline',   dot: 'bg-gray-400' },
};

function formatTime(iso: string): string {
  try {
    return new Date(iso).toLocaleTimeString('tr-TR', { hour: '2-digit', minute: '2-digit' });
  } catch {
    return '--:--';
  }
}

interface StaffOpsCardProps {
  staff: StaffOp;
  className?: string;
}

export function StaffOpsCard({ staff, className }: StaffOpsCardProps) {
  const cfg = STATUS_CONFIG[staff.currentStatus];
  const loadPct = staff.todayAppointments > 0
    ? Math.round((staff.completedAppointments / staff.todayAppointments) * 100)
    : 0;
  const isHeavy = staff.todayAppointments >= 6;

  return (
    <div className={cn(
      'flex items-center gap-3 rounded-lg border bg-card p-3 transition-colors',
      staff.currentStatus === 'busy' && 'border-primary/20',
      className,
    )}>
      {/* Avatar + status dot */}
      <div className="relative shrink-0">
        <div className="w-9 h-9 rounded-full bg-muted flex items-center justify-center">
          <User className="h-4 w-4 text-muted-foreground" />
        </div>
        <div className={cn(
          'absolute -bottom-0.5 -right-0.5 h-3 w-3 rounded-full border-2 border-background',
          cfg.dot,
          staff.currentStatus === 'busy' && 'animate-pulse',
        )} />
      </div>

      {/* Info */}
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2">
          <span className="text-sm font-medium truncate">{staff.name}</span>
          <Badge variant={cfg.badge} className="text-[10px] px-1.5 py-0 shrink-0">
            {cfg.label}
          </Badge>
          {isHeavy && (
            <Badge variant="warning" className="text-[10px] px-1.5 py-0 shrink-0">
              Yoğun
            </Badge>
          )}
        </div>
        <div className="flex items-center gap-2 mt-0.5">
          <span className="text-xs text-muted-foreground">
            {staff.role}
          </span>
          <span className="text-xs text-muted-foreground">·</span>
          <span className="text-xs text-muted-foreground">
            {staff.completedAppointments}/{staff.todayAppointments} randevu
          </span>
          {staff.emptySlots > 0 && (
            <>
              <span className="text-xs text-muted-foreground">·</span>
              <span className="text-xs text-yellow-600 font-medium">
                {staff.emptySlots} boş slot
              </span>
            </>
          )}
        </div>
        {/* Sub-info: current customer or next appointment */}
        {staff.currentCustomer && (
          <p className="text-xs text-primary mt-0.5 truncate">
            Şu an: {staff.currentCustomer}
          </p>
        )}
        {!staff.currentCustomer && staff.nextAppointmentTime && (
          <p className="text-xs text-muted-foreground mt-0.5 flex items-center gap-1">
            <Clock className="h-3 w-3" />
            Sonraki: {formatTime(staff.nextAppointmentTime)}
          </p>
        )}
      </div>

      {/* Progress bar */}
      <div className="shrink-0 w-12 text-right">
        <p className="text-xs font-medium">{loadPct}%</p>
        <div className="h-1.5 w-12 rounded-full bg-muted overflow-hidden mt-0.5">
          <div
            className={cn(
              'h-full rounded-full transition-all',
              loadPct >= 80 ? 'bg-green-500' : loadPct >= 40 ? 'bg-primary' : 'bg-muted-foreground/30',
            )}
            style={{ width: `${loadPct}%` }}
          />
        </div>
      </div>
    </div>
  );
}

/** Skeleton for loading */
export function StaffOpsCardSkeleton() {
  return (
    <div className="flex items-center gap-3 rounded-lg border bg-card p-3">
      <div className="w-9 h-9 rounded-full bg-muted shimmer" />
      <div className="flex-1 min-w-0 space-y-1.5">
        <div className="h-4 w-24 rounded bg-muted shimmer" />
        <div className="h-3 w-36 rounded bg-muted shimmer" />
      </div>
      <div className="w-12 space-y-1">
        <div className="h-3 w-8 rounded bg-muted shimmer ml-auto" />
        <div className="h-1.5 w-12 rounded-full bg-muted shimmer" />
      </div>
    </div>
  );
}
