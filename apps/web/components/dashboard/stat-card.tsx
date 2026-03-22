/**
 * StatCard — Compact stat display for Today Snapshot
 * Token-driven, reusable, null-safe, zero hardcode
 */

import { cn } from '@/lib/utils';
import {
  Card,
  CardContent,
} from '@/components/ui/card';

interface StatCardProps {
  icon: React.ReactNode;
  label: string;
  value: string | number | null | undefined;
  /** Optional secondary info (e.g. "2 onay bekliyor") */
  detail?: string | null;
  /** Optional trend: positive = green, negative = red */
  trend?: { value: string; positive: boolean } | null;
  className?: string;
  /** Loading state → shows skeleton */
  loading?: boolean;
}

export function StatCard({ icon, label, value, detail, trend, className, loading }: StatCardProps) {
  if (loading) {
    return (
      <Card className={cn('relative overflow-hidden', className)}>
        <CardContent className="p-4">
          <div className="flex items-start justify-between">
            <div className="space-y-2 flex-1">
              <div className="h-3 w-16 rounded bg-muted shimmer" />
              <div className="h-7 w-20 rounded bg-muted shimmer" />
              <div className="h-3 w-24 rounded bg-muted shimmer" />
            </div>
            <div className="rounded-md bg-muted p-2 shimmer h-9 w-9" />
          </div>
        </CardContent>
      </Card>
    );
  }

  const displayValue = value ?? '—';

  return (
    <Card className={cn('relative overflow-hidden', className)}>
      <CardContent className="p-4">
        <div className="flex items-start justify-between">
          <div className="space-y-1 min-w-0">
            <p className="text-xs font-medium text-muted-foreground">{label}</p>
            <p className="text-2xl font-bold tracking-tight truncate">{displayValue}</p>
            {detail && (
              <p className="text-xs text-muted-foreground truncate">{detail}</p>
            )}
            {trend && (
              <p className={cn(
                'text-xs font-medium',
                trend.positive ? 'text-green-600' : 'text-red-600',
              )}>
                {trend.positive ? '↑' : '↓'} {trend.value}
              </p>
            )}
          </div>
          <div className="rounded-md bg-primary/10 p-2 text-primary shrink-0">
            {icon}
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

/** Skeleton placeholder for loading state */
export function StatCardSkeleton({ className }: { className?: string }) {
  return <StatCard icon={<div />} label="" value={null} loading className={className} />;
}
