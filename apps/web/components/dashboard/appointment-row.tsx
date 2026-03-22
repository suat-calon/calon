/**
 * AppointmentRow — Compact appointment operations row
 * TASK 1: müşteri / hizmet / uzman / saat / durum / tek satır aksiyon
 * TASK 7: Priority-based ordering (problem → upcoming → active → done)
 */

'use client';

import { cn } from '@/lib/utils';
import { Badge } from '@/components/ui/badge';
import { Clock, AlertTriangle } from 'lucide-react';
import { StatusActionGroup } from './status-action-group';
import type { AppointmentOp, AppointmentStatus } from '@/lib/dashboard-mock';

// ── Status display config ─────────────────────────────────────────────────────

const STATUS_DISPLAY: Record<AppointmentStatus, {
  label: string;
  badge: 'default' | 'secondary' | 'destructive' | 'success' | 'warning' | 'info' | 'outline';
}> = {
  PENDING:    { label: 'Bekliyor',   badge: 'warning' },
  CONFIRMED:  { label: 'Onaylı',     badge: 'info' },
  CHECKED_IN: { label: 'Geldi',      badge: 'info' },
  IN_SERVICE: { label: 'Hizmette',   badge: 'default' },
  COMPLETED:  { label: 'Tamamlandı', badge: 'success' },
  CANCELLED:  { label: 'İptal',      badge: 'destructive' },
  NO_SHOW:    { label: 'Gelmedi',    badge: 'destructive' },
};

function formatTime(iso: string): string {
  try {
    return new Date(iso).toLocaleTimeString('tr-TR', { hour: '2-digit', minute: '2-digit' });
  } catch {
    return '--:--';
  }
}

// ── Component ─────────────────────────────────────────────────────────────────

interface AppointmentRowProps {
  appointment: AppointmentOp;
  onStatusChange: (id: string, newStatus: AppointmentStatus) => void;
  onSelect: (appointment: AppointmentOp) => void;
  className?: string;
}

export function AppointmentRow({ appointment, onStatusChange, onSelect, className }: AppointmentRowProps) {
  const apt = appointment;
  const display = STATUS_DISPLAY[apt.status];
  const isProblem = apt.priority === 1;
  const isDone = apt.status === 'COMPLETED' || apt.status === 'CANCELLED' || apt.status === 'NO_SHOW';

  return (
    <div
      className={cn(
        'group flex flex-col sm:flex-row sm:items-center gap-2 sm:gap-3 rounded-lg border p-3 transition-colors',
        isProblem && 'border-destructive/30 bg-destructive/5',
        apt.isDelayed && !isProblem && 'border-yellow-300 bg-yellow-50/50',
        isDone && 'opacity-60',
        !isDone && 'hover:bg-accent/50 cursor-pointer',
        className,
      )}
      onClick={() => !isDone && onSelect(apt)}
      role={isDone ? undefined : 'button'}
      tabIndex={isDone ? undefined : 0}
      onKeyDown={(e) => { if (e.key === 'Enter' && !isDone) onSelect(apt); }}
    >
      {/* Time + status */}
      <div className="flex items-center gap-2 sm:w-[140px] shrink-0">
        <span className="text-xs font-mono text-muted-foreground whitespace-nowrap">
          {formatTime(apt.startTime)}–{formatTime(apt.endTime)}
        </span>
        <Badge variant={display.badge} className="text-[10px] px-1.5 py-0 shrink-0">
          {display.label}
        </Badge>
      </div>

      {/* Customer + service + staff */}
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-1.5">
          {apt.isDelayed && (
            <AlertTriangle className="h-3.5 w-3.5 text-yellow-600 shrink-0" />
          )}
          {apt.status === 'NO_SHOW' && (
            <Clock className="h-3.5 w-3.5 text-red-500 shrink-0" />
          )}
          <span className={cn(
            'text-sm font-medium truncate',
            isProblem && 'text-destructive',
            apt.isDelayed && !isProblem && 'text-yellow-700',
          )}>
            {apt.customerName}
          </span>
        </div>
        <p className="text-xs text-muted-foreground truncate">
          {apt.serviceName} — {apt.staffName}
          {apt.note && <span className="text-muted-foreground/60"> · {apt.note}</span>}
        </p>
      </div>

      {/* Quick actions — stop propagation so row click doesn't fire */}
      <div
        className="shrink-0"
        onClick={(e) => e.stopPropagation()}
        onKeyDown={(e) => e.stopPropagation()}
      >
        <StatusActionGroup
          currentStatus={apt.status}
          onStatusChange={(newStatus) => onStatusChange(apt.id, newStatus)}
          compact
        />
      </div>
    </div>
  );
}

/** Skeleton for loading */
export function AppointmentRowSkeleton() {
  return (
    <div className="flex items-center gap-3 rounded-lg border p-3">
      <div className="flex items-center gap-2 w-[140px] shrink-0">
        <div className="h-3 w-16 rounded bg-muted shimmer" />
        <div className="h-4 w-14 rounded-full bg-muted shimmer" />
      </div>
      <div className="flex-1 min-w-0 space-y-1.5">
        <div className="h-4 w-28 rounded bg-muted shimmer" />
        <div className="h-3 w-40 rounded bg-muted shimmer" />
      </div>
      <div className="flex gap-1.5 shrink-0">
        <div className="h-7 w-7 rounded bg-muted shimmer" />
        <div className="h-7 w-7 rounded bg-muted shimmer" />
      </div>
    </div>
  );
}
