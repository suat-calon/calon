/**
 * GrowthActionPanel — Rebook opportunities + growth actions
 * FAZ UI-12 TASK 3+4: Tekrar rezervasyon fırsatları + büyüme aksiyonları
 *
 * KURAL: Fake automation YASAK — backend yoksa "SMS gönder" yok
 * KURAL: Her kart tek CTA, spesifik, fiil içerir
 */

import { useState } from 'react';
import { cn } from '@/lib/utils';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  RotateCcw,
  ChevronRight,
  Calendar,
  UserX,
  Clock,
  User,
  TrendingUp,
} from 'lucide-react';
import type { RebookOpportunity, NoShowRecovery } from '@/lib/dashboard-mock';

const MAX_VISIBLE = 4;

// ── Rebook reasons ────────────────────────────────────────────────────────────

const REASON_CONFIG: Record<RebookOpportunity['reason'], {
  icon: React.ReactNode;
  color: string;
  label: string;
}> = {
  periodic:      { icon: <Calendar className="h-3.5 w-3.5" />, color: 'text-blue-600 bg-blue-50', label: 'Periyodik bakım' },
  dormant:       { icon: <Clock className="h-3.5 w-3.5" />, color: 'text-yellow-600 bg-yellow-50', label: 'Uzun süredir yok' },
  no_show_lost:  { icon: <UserX className="h-3.5 w-3.5" />, color: 'text-red-600 bg-red-50', label: 'No-show kaybı' },
  one_time:      { icon: <User className="h-3.5 w-3.5" />, color: 'text-muted-foreground bg-muted', label: 'Tek seferlik' },
};

// ── Growth Action Panel ───────────────────────────────────────────────────────

interface GrowthActionPanelProps {
  opportunities: RebookOpportunity[];
  noShowRecoveries: NoShowRecovery[];
  loading?: boolean;
  className?: string;
}

export function GrowthActionPanel({
  opportunities,
  noShowRecoveries,
  loading,
  className,
}: GrowthActionPanelProps) {
  const [showAll, setShowAll] = useState(false);
  const unrecoveredNoShows = noShowRecoveries.filter((n) => !n.hasRebooked);
  const visible = showAll ? opportunities : opportunities.slice(0, MAX_VISIBLE);
  const hiddenCount = opportunities.length - MAX_VISIBLE;

  if (loading) {
    return (
      <Card className={className}>
        <CardHeader className="pb-2"><CardTitle className="text-sm font-semibold">Büyüme Fırsatları</CardTitle></CardHeader>
        <CardContent className="space-y-2">
          {[1, 2, 3].map((i) => (
            <div key={i} className="flex items-center gap-3 p-2.5">
              <div className="w-7 h-7 rounded-lg bg-muted shimmer shrink-0" />
              <div className="flex-1 space-y-1">
                <div className="h-4 w-28 rounded bg-muted shimmer" />
                <div className="h-3 w-44 rounded bg-muted shimmer" />
              </div>
              <div className="h-7 w-20 rounded bg-muted shimmer shrink-0" />
            </div>
          ))}
        </CardContent>
      </Card>
    );
  }

  if (opportunities.length === 0 && unrecoveredNoShows.length === 0) {
    return (
      <Card className={className}>
        <CardHeader className="pb-2"><CardTitle className="text-sm font-semibold">Büyüme Fırsatları</CardTitle></CardHeader>
        <CardContent>
          <div className="flex flex-col items-center py-6 text-center">
            <div className="rounded-full bg-muted p-3 mb-3"><TrendingUp className="h-5 w-5 text-muted-foreground" /></div>
            <p className="text-sm font-medium text-muted-foreground">Şu anda öne çıkan geri kazanım fırsatı yok</p>
            <p className="text-xs text-muted-foreground mt-1">Müşteri verileri oluştukça fırsatlar burada belirecek.</p>
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className={className}>
      <CardHeader className="pb-2">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <TrendingUp className="h-4 w-4 text-primary" />
            <CardTitle className="text-sm font-semibold">Büyüme Fırsatları</CardTitle>
          </div>
          <Badge variant="outline" className="text-[10px]">
            {opportunities.length + unrecoveredNoShows.length} fırsat
          </Badge>
        </div>
      </CardHeader>
      <CardContent className="space-y-2">
        {/* No-show recovery block */}
        {unrecoveredNoShows.length > 0 && (
          <div className="rounded-lg border border-red-200 bg-red-50/40 p-3">
            <div className="flex items-center gap-2 mb-1.5">
              <UserX className="h-4 w-4 text-red-600" />
              <span className="text-sm font-semibold text-red-800">
                {unrecoveredNoShows.length} müşteri no-show sonrası geri dönmedi
              </span>
            </div>
            <div className="space-y-1">
              {unrecoveredNoShows.map((nsr) => (
                <div key={nsr.id} className="flex items-center justify-between text-xs">
                  <span className="text-red-700">
                    {nsr.customerName} — {nsr.serviceName}
                    {nsr.daysSinceNoShow > 0 && <span className="text-red-500"> · {nsr.daysSinceNoShow} gün önce</span>}
                  </span>
                </div>
              ))}
            </div>
            <Button size="sm" variant="outline" className="h-7 text-xs mt-2 border-red-200 text-red-700 hover:bg-red-100" asChild>
              <a href="/customers?segment=no_show_risk">Listeyi incele</a>
            </Button>
          </div>
        )}

        {/* Rebook opportunities */}
        {visible.map((opp) => {
          const config = REASON_CONFIG[opp.reason];
          return (
            <div key={opp.id} className="flex items-center gap-3 rounded-lg border p-2.5">
              <div className={cn('rounded-lg p-1.5 shrink-0', config.color)}>
                {config.icon}
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-1.5">
                  <span className="text-sm font-medium truncate">{opp.customerName}</span>
                  <Badge variant="outline" className="text-[10px] px-1.5 py-0 shrink-0">
                    {opp.lastVisitDaysAgo} gün
                  </Badge>
                </div>
                <p className="text-[10px] text-muted-foreground truncate">
                  {opp.suggestedAction}
                </p>
                <p className="text-[10px] text-muted-foreground/70">
                  Son: {opp.lastService} · {config.label}
                </p>
              </div>
              <Button size="sm" variant="ghost" className="h-7 text-xs shrink-0" asChild>
                <a href={opp.cta.href}>{opp.cta.label}</a>
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
