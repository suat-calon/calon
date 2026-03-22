/**
 * RevenueCard — Revenue overview with interpretive sub-text
 * TASK 1: Sadece sayı değil → yorumlayıcı alt metin
 */

import { cn } from '@/lib/utils';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { TrendingUp } from 'lucide-react';

export interface RevenueStats {
  today: number;
  yesterday: number;
  thisWeek: number;
  lastWeek: number;
  avgAppointmentValue: number;
  topServiceName: string;
  topServiceRevenue: number;
  topServicePct: number;
  currency: string;
  dailyTrend: number[];
}

function formatCurrency(amount: number, currency: string): string {
  return new Intl.NumberFormat('tr-TR', { style: 'currency', currency, maximumFractionDigits: 0 }).format(amount);
}

function pctChange(current: number, previous: number): { value: number; positive: boolean } | null {
  if (previous === 0) return null;
  const pct = Math.round(((current - previous) / previous) * 100);
  if (pct === 0) return null;
  return { value: Math.abs(pct), positive: pct > 0 };
}

// Minimal sparkline
function Sparkline({ data, className }: { data: number[]; className?: string }) {
  if (!data || data.length < 2) return null;
  const max = Math.max(...data);
  const min = Math.min(...data);
  const range = max - min || 1;
  const h = 28; const w = 80;
  const step = w / (data.length - 1);
  const points = data.map((v, i) => `${i * step},${h - ((v - min) / range) * (h - 4) - 2}`).join(' ');
  return (
    <svg viewBox={`0 0 ${w} ${h}`} className={className} preserveAspectRatio="none">
      <polyline points={points} fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

interface RevenueCardProps {
  data: RevenueStats | null;
  loading?: boolean;
  className?: string;
}

export function RevenueCard({ data, loading, className }: RevenueCardProps) {
  if (loading) {
    return (
      <Card className={className}>
        <CardHeader className="pb-2"><CardTitle className="text-sm font-semibold">Gelir Akışı</CardTitle></CardHeader>
        <CardContent>
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2"><div className="h-3 w-12 rounded bg-muted shimmer" /><div className="h-7 w-24 rounded bg-muted shimmer" /><div className="h-3 w-32 rounded bg-muted shimmer" /></div>
            <div className="space-y-2"><div className="h-3 w-14 rounded bg-muted shimmer" /><div className="h-7 w-28 rounded bg-muted shimmer" /><div className="h-3 w-24 rounded bg-muted shimmer" /></div>
          </div>
        </CardContent>
      </Card>
    );
  }

  if (!data) {
    return (
      <Card className={className}>
        <CardHeader className="pb-2"><CardTitle className="text-sm font-semibold">Gelir Akışı</CardTitle></CardHeader>
        <CardContent>
          <div className="flex flex-col items-center py-6 text-center">
            <div className="rounded-full bg-muted p-3 mb-3"><TrendingUp className="h-5 w-5 text-muted-foreground" /></div>
            <p className="text-sm font-medium text-muted-foreground">Henüz gelir verisi oluşmadı</p>
            <p className="text-xs text-muted-foreground mt-1">Randevular tamamlandıkça burada görünecek.</p>
          </div>
        </CardContent>
      </Card>
    );
  }

  const todayChange = pctChange(data.today, data.yesterday);
  const weekChange = pctChange(data.thisWeek, data.lastWeek);

  return (
    <Card className={className}>
      <CardHeader className="pb-2">
        <div className="flex items-center justify-between">
          <CardTitle className="text-sm font-semibold">Gelir Akışı</CardTitle>
          <Sparkline data={data.dailyTrend} className="w-16 h-6 text-primary/50" />
        </div>
      </CardHeader>
      <CardContent>
        <div className="grid grid-cols-2 gap-4 mb-3">
          {/* Today */}
          <div>
            <p className="text-xs text-muted-foreground mb-0.5">Bugün</p>
            <p className="text-xl font-bold">{formatCurrency(data.today, data.currency)}</p>
            {todayChange && (
              <p className={cn('text-xs font-medium', todayChange.positive ? 'text-green-600' : 'text-red-600')}>
                {todayChange.positive ? '↑' : '↓'} Düne göre %{todayChange.value} {todayChange.positive ? 'artış' : 'düşüş'}
              </p>
            )}
          </div>
          {/* This week */}
          <div>
            <p className="text-xs text-muted-foreground mb-0.5">Bu hafta</p>
            <p className="text-xl font-bold">{formatCurrency(data.thisWeek, data.currency)}</p>
            {weekChange && (
              <p className={cn('text-xs font-medium', weekChange.positive ? 'text-green-600' : 'text-red-600')}>
                {weekChange.positive ? '↑' : '↓'} Geçen haftaya göre %{weekChange.value}
              </p>
            )}
          </div>
        </div>

        {/* Interpretive insights — not just numbers */}
        <div className="space-y-1.5 pt-2 border-t">
          <div className="flex items-center justify-between text-xs">
            <span className="text-muted-foreground">Ortalama randevu değeri</span>
            <span className="font-medium">{formatCurrency(data.avgAppointmentValue, data.currency)}</span>
          </div>
          <div className="flex items-center justify-between text-xs">
            <span className="text-muted-foreground">En yüksek gelir</span>
            <span className="font-medium">
              {data.topServiceName}
              <span className="text-muted-foreground font-normal"> · %{data.topServicePct}</span>
            </span>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
