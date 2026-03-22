/**
 * ActionCard — Single actionable item for the Action Center
 * Status + description + single CTA (verb-first)
 * Overflow-aware: parent controls max visible count
 */

import { cn } from '@/lib/utils';
import { Badge }  from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import type { DashboardAction } from '@/lib/dashboard-mock';

const URGENCY_VARIANT: Record<DashboardAction['urgency'], 'destructive' | 'warning' | 'secondary'> = {
  high:   'destructive',
  medium: 'warning',
  low:    'secondary',
};

const TYPE_LABEL: Record<DashboardAction['type'], string> = {
  pending_approval:   'Onay',
  upcoming_soon:      'Yaklaşan',
  payment_due:        'Ödeme',
  empty_slot:         'Boş Slot',
  cancelled_recovery: 'İptal',
};

interface ActionCardProps {
  action: DashboardAction;
  className?: string;
}

export function ActionCard({ action, className }: ActionCardProps) {
  return (
    <div
      className={cn(
        'flex items-center gap-3 rounded-lg border bg-card p-3 transition-colors hover:bg-accent/50',
        action.urgency === 'high' && 'border-destructive/30 bg-destructive/5',
        className,
      )}
    >
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2 mb-0.5">
          <Badge variant={URGENCY_VARIANT[action.urgency]} className="text-[10px] px-1.5 py-0 shrink-0">
            {TYPE_LABEL[action.type]}
          </Badge>
          <span className="text-sm font-medium truncate">{action.title}</span>
        </div>
        <p className="text-xs text-muted-foreground truncate">{action.description}</p>
      </div>
      <Button size="sm" variant={action.urgency === 'high' ? 'default' : 'outline'} className="shrink-0" asChild>
        <a href={action.cta.href}>{action.cta.label}</a>
      </Button>
    </div>
  );
}

/** Skeleton for loading state */
export function ActionCardSkeleton() {
  return (
    <div className="flex items-center gap-3 rounded-lg border bg-card p-3">
      <div className="min-w-0 flex-1 space-y-2">
        <div className="flex items-center gap-2">
          <div className="h-4 w-12 rounded-full bg-muted shimmer" />
          <div className="h-4 w-32 rounded bg-muted shimmer" />
        </div>
        <div className="h-3 w-48 rounded bg-muted shimmer" />
      </div>
      <div className="h-8 w-20 rounded bg-muted shimmer shrink-0" />
    </div>
  );
}
