/**
 * SegmentCard — Customer segment display with CTA
 * FAZ UI-12 TASK 2: Müşteri segmentleri
 *
 * KURAL: Her segment sayı + açıklama + tek CTA
 */

import React from 'react';
import { cn } from '@/lib/utils';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  UserPlus,
  Heart,
  Clock,
  AlertTriangle,
  Star,
  User,
  Users,
  ChevronRight,
} from 'lucide-react';
import type { CustomerSegment, CustomerSegmentType } from '@/lib/dashboard-mock';

const MAX_VISIBLE = 4;

const SEGMENT_CONFIG: Record<CustomerSegmentType, {
  icon: React.ReactNode;
  color: string;
  badgeVariant: 'default' | 'destructive' | 'warning' | 'outline';
}> = {
  new:          { icon: <UserPlus className="h-3.5 w-3.5" />, color: 'text-blue-600 bg-blue-50', badgeVariant: 'default' },
  returning:    { icon: <Heart className="h-3.5 w-3.5" />, color: 'text-green-600 bg-green-50', badgeVariant: 'default' },
  dormant:      { icon: <Clock className="h-3.5 w-3.5" />, color: 'text-yellow-600 bg-yellow-50', badgeVariant: 'warning' },
  no_show_risk: { icon: <AlertTriangle className="h-3.5 w-3.5" />, color: 'text-red-600 bg-red-50', badgeVariant: 'destructive' },
  loyal:        { icon: <Star className="h-3.5 w-3.5" />, color: 'text-primary bg-primary/10', badgeVariant: 'default' },
  one_time:     { icon: <User className="h-3.5 w-3.5" />, color: 'text-muted-foreground bg-muted', badgeVariant: 'outline' },
};

interface SegmentPanelProps {
  segments: CustomerSegment[];
  loading?: boolean;
  className?: string;
}

export function SegmentPanel({ segments, loading, className }: SegmentPanelProps) {
  const [showAll, setShowAll] = React.useState(false);
  const visible = showAll ? segments : segments.slice(0, MAX_VISIBLE);
  const hiddenCount = segments.length - MAX_VISIBLE;

  if (loading) {
    return (
      <Card className={className}>
        <CardHeader className="pb-2"><CardTitle className="text-sm font-semibold">Müşteri Segmentleri</CardTitle></CardHeader>
        <CardContent className="space-y-2">
          {[1, 2, 3].map((i) => (
            <div key={i} className="flex items-center gap-3 p-2">
              <div className="w-7 h-7 rounded-lg bg-muted shimmer shrink-0" />
              <div className="flex-1 space-y-1">
                <div className="h-4 w-24 rounded bg-muted shimmer" />
                <div className="h-3 w-40 rounded bg-muted shimmer" />
              </div>
            </div>
          ))}
        </CardContent>
      </Card>
    );
  }

  if (segments.length === 0) {
    return (
      <Card className={className}>
        <CardHeader className="pb-2"><CardTitle className="text-sm font-semibold">Müşteri Segmentleri</CardTitle></CardHeader>
        <CardContent>
          <div className="flex flex-col items-center py-6 text-center">
            <div className="rounded-full bg-muted p-3 mb-3"><Users className="h-5 w-5 text-muted-foreground" /></div>
            <p className="text-sm font-medium text-muted-foreground">Henüz segment verisi yok</p>
            <p className="text-xs text-muted-foreground mt-1">Müşteri verisi oluştukça segmentler burada belirecek.</p>
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className={className}>
      <CardHeader className="pb-2">
        <div className="flex items-center justify-between">
          <CardTitle className="text-sm font-semibold">Müşteri Segmentleri</CardTitle>
          <Badge variant="outline" className="text-[10px]">{segments.length} segment</Badge>
        </div>
      </CardHeader>
      <CardContent className="space-y-2">
        {visible.map((seg) => {
          const config = SEGMENT_CONFIG[seg.type];
          return (
            <div key={seg.id} className="flex items-center gap-3 rounded-lg border p-2.5">
              <div className={cn('rounded-lg p-1.5 shrink-0', config.color)}>
                {config.icon}
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-1.5">
                  <span className="text-sm font-medium truncate">{seg.label}</span>
                  <Badge variant={config.badgeVariant} className="text-[10px] px-1.5 py-0">{seg.count}</Badge>
                </div>
                <p className="text-[10px] text-muted-foreground truncate">{seg.description}</p>
              </div>
              <Button size="sm" variant="ghost" className="h-7 text-xs shrink-0" asChild>
                <a href={seg.cta.href}>{seg.cta.label}</a>
              </Button>
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
