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
        <CardContent className="p-5 lg:p-6">
          <div className="flex items-start justify-between">
            <div className="space-y-2 flex-1">
              <div className="h-3.5 w-20 rounded bg-muted shimmer" />
              <div className="h-9 w-24 rounded bg-muted shimmer" />
              <div className="h-3.5 w-28 rounded bg-muted shimmer" />
            </div>
            <div className="rounded-xl bg-muted p-3 shimmer h-12 w-12" />
          </div>
        </CardContent>
      </Card>
    );
  }

  const displayValue = value ?? '—';

  return (
    <Card className={cn('relative overflow-hidden', className)}>
      <CardContent className="p-5 lg:p-6">
        <div className="flex items-start justify-between">
          <div className="space-y-1.5 min-w-0">
            <p className="text-sm font-medium text-muted-foreground">{label}</p>
            <p className="text-3xl font-bold tracking-tight truncate">{displayValue}</p>
            {detail && (
              <p className="text-sm text-muted-foreground truncate">{detail}</p>
            )}
            {trend && (
              <p className={cn(
                'text-sm font-medium',
                trend.positive ? 'text-green-600' : 'text-red-600',
              )}>
                {trend.positive ? '↑' : '↓'} {trend.value}
              </p>
            )}
          </div>
          <div className="rounded-xl bg-primary/10 p-3 text-primary shrink-0">
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
