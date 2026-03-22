/**
 * StatusActionGroup — Quick status change buttons for an appointment
 * TASK 2: Hızlı durum değişimi — uygunsuzsa disable + tooltip
 */

'use client';

import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { Check, X, UserX, Play } from 'lucide-react';
import {
  STATUS_TRANSITIONS,
  type AppointmentStatus,
} from '@/lib/dashboard-mock';

interface StatusAction {
  target: AppointmentStatus;
  label: string;
  icon: React.ReactNode;
  variant: 'default' | 'destructive' | 'outline' | 'secondary';
}

const ALL_ACTIONS: StatusAction[] = [
  { target: 'CONFIRMED',  label: 'Onayla',       icon: <Check className="h-3.5 w-3.5" />,  variant: 'default' },
  { target: 'CHECKED_IN', label: 'Geldi',         icon: <Check className="h-3.5 w-3.5" />,  variant: 'outline' },
  { target: 'IN_SERVICE', label: 'Başlat',        icon: <Play className="h-3.5 w-3.5" />,   variant: 'default' },
  { target: 'COMPLETED',  label: 'Tamamla',       icon: <Check className="h-3.5 w-3.5" />,  variant: 'default' },
  { target: 'NO_SHOW',    label: 'Gelmedi',       icon: <UserX className="h-3.5 w-3.5" />,  variant: 'destructive' },
  { target: 'CANCELLED',  label: 'İptal et',      icon: <X className="h-3.5 w-3.5" />,      variant: 'destructive' },
];

interface StatusActionGroupProps {
  currentStatus: AppointmentStatus;
  onStatusChange: (newStatus: AppointmentStatus) => void;
  className?: string;
  /** Compact mode — icon-only buttons */
  compact?: boolean;
}

export function StatusActionGroup({
  currentStatus,
  onStatusChange,
  className,
  compact = false,
}: StatusActionGroupProps) {
  const allowedTargets = STATUS_TRANSITIONS[currentStatus] ?? [];

  if (allowedTargets.length === 0) {
    return (
      <p className="text-xs text-muted-foreground italic">
        {currentStatus === 'COMPLETED' ? 'Randevu tamamlandı' :
         currentStatus === 'CANCELLED' ? 'Randevu iptal edildi' :
         currentStatus === 'NO_SHOW' ? 'Müşteri gelmedi' : 'İşlem yapılamaz'}
      </p>
    );
  }

  const availableActions = ALL_ACTIONS.filter((a) =>
    allowedTargets.includes(a.target),
  );

  return (
    <div className={cn('flex items-center gap-1.5 flex-wrap', className)}>
      {availableActions.map((action) => (
        <Button
          key={action.target}
          size="sm"
          variant={action.variant}
          onClick={() => onStatusChange(action.target)}
          className={cn(
            'h-7 text-xs',
            compact ? 'w-7 p-0' : 'px-2.5',
          )}
          title={action.label}
        >
          {action.icon}
          {!compact && <span className="ml-1">{action.label}</span>}
        </Button>
      ))}
    </div>
  );
}
