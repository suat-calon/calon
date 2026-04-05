'use client';

import { useState, useMemo } from 'react';
import { CreditCard, TrendingUp, AlertTriangle, CheckCircle2, Search, Calendar as CalendarIcon } from 'lucide-react';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetDescription } from '@/components/ui/sheet';
import { Separator } from '@/components/ui/separator';
import { useBillingTenants, useBillingMetrics, useAdminTenants, type BillingTenant } from '@/hooks/api/use-admin';
import { cn } from '@/lib/utils';

const STATUS_FILTERS = ['ALL', 'ACTIVE', 'TRIAL', 'PAST_DUE', 'SUSPENDED'] as const;
type StatusFilter = (typeof STATUS_FILTERS)[number];

export default function AdminBillingPage() {
  const [filter, setFilter] = useState<StatusFilter>('ALL');
  const [search, setSearch] = useState('');
  const [selected, setSelected] = useState<BillingTenant | null>(null);

  const { data: tenants, isLoading: tLoading, error: tError } = useBillingTenants();
  const { data: metrics, isLoading: mLoading, error: mError } = useBillingMetrics();
  const { data: adminTenants } = useAdminTenants();

  const loading = tLoading || mLoading;
  const error = tError || mError;

  // Build tenant name lookup
  const tenantNameMap = useMemo(() => {
    const map = new Map<string, string>();
    adminTenants?.forEach(t => map.set(t.id, t.name));
    return map;
  }, [adminTenants]);

  // Filter + search
  const filtered = useMemo(() => {
    let list = tenants ?? [];
    if (filter !== 'ALL') list = list.filter(t => t.status === filter);
    if (search) {
      const q = search.toLowerCase();
      list = list.filter(t => {
        const name = tenantNameMap.get(t.tenantId) ?? '';
        return name.toLowerCase().includes(q) || t.tenantId.toLowerCase().includes(q) || t.plan.toLowerCase().includes(q);
      });
    }
    return list;
  }, [tenants, filter, search, tenantNameMap]);

  const statusCounts = useMemo(() => {
    const list = tenants ?? [];
    return {
      total: list.length,
      active: list.filter(t => t.status === 'ACTIVE').length,
      trial: list.filter(t => t.status === 'TRIAL').length,
      pastDue: list.filter(t => t.status === 'PAST_DUE').length,
    };
  }, [tenants]);

  const selectedName = selected ? (tenantNameMap.get(selected.tenantId) ?? null) : null;

  return (
    <div className="space-y-4 max-w-6xl">
      {/* Page header */}
      <div className="flex items-center justify-between pb-1 border-b border-border/40">
        <div>
          <h1 className="text-lg font-semibold tracking-tight">Faturalama</h1>
          <p className="text-[11px] text-muted-foreground/70 mt-0.5">
            {statusCounts.total} abonelik · {statusCounts.active} aktif · {statusCounts.trial} deneme
            {statusCounts.pastDue > 0 && <span className="text-amber-600 dark:text-amber-400"> · {statusCounts.pastDue} gecikmiş</span>}
          </p>
        </div>
      </div>

      {error ? (
        <div className="flex items-center gap-2 text-destructive py-8 justify-center text-sm">
          <span>Veriler yüklenemedi.</span>
        </div>
      ) : loading ? (
        <div className="flex justify-center py-16">
          <div className="w-6 h-6 animate-spin rounded-full border-2 border-muted border-t-primary" />
        </div>
      ) : (
        <>
          {/* Metrics */}
          {metrics && (
            <div>
              <p className="text-[10px] font-semibold uppercase tracking-widest text-muted-foreground/60 mb-2.5">Billing Metrikleri</p>
              <div className="grid grid-cols-3 gap-2.5">
                <BillingStatCard icon={CheckCircle2} label="Aktif Abonelik" value={String(metrics.totalActive)} accentClass="bg-primary/10" iconClass="text-primary" />
                <BillingStatCard icon={TrendingUp} label="Toplam Gelir" value={typeof metrics.totalRevenue === 'number' ? `₺${metrics.totalRevenue.toLocaleString('tr-TR')}` : String(metrics.totalRevenue)} accentClass="bg-emerald-100 dark:bg-emerald-950/40" iconClass="text-emerald-600 dark:text-emerald-400" />
                <BillingStatCard icon={AlertTriangle} label="Gecikmiş" value={String(metrics.pastDue)} accentClass="bg-amber-100 dark:bg-amber-950/40" iconClass="text-amber-600 dark:text-amber-400" />
              </div>
            </div>
          )}

          {/* Filter bar */}
          <div className="flex items-center gap-3 flex-wrap">
            <div className="relative flex-1 max-w-sm">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground/50" />
              <Input placeholder="Salon adı, ID veya plan ara..." className="pl-9 h-8 text-[13px]" value={search} onChange={e => setSearch(e.target.value)} />
            </div>
            <div className="flex items-center gap-1">
              {STATUS_FILTERS.map(s => (
                <button
                  key={s}
                  type="button"
                  onClick={() => setFilter(s)}
                  className={cn(
                    'px-2.5 py-1 rounded-md text-[11px] font-medium transition-colors',
                    filter === s
                      ? 'bg-primary text-primary-foreground'
                      : 'text-muted-foreground hover:bg-muted hover:text-foreground',
                  )}
                >
                  {s === 'ALL' ? 'Tümü' : s === 'PAST_DUE' ? 'Gecikmiş' : s}
                </button>
              ))}
            </div>
            <span className="text-[11px] text-muted-foreground/60">{filtered.length} sonuç</span>
          </div>

          {/* Subscriptions list */}
          <div>
            <p className="text-[10px] font-semibold uppercase tracking-widest text-muted-foreground/60 mb-2.5">Abonelikler</p>
            {filtered.length > 0 ? (
              <div className="bg-card rounded-lg border divide-y divide-border/60">
                {filtered.map(t => {
                  const name = tenantNameMap.get(t.tenantId);
                  return (
                    <button
                      key={t.id}
                      type="button"
                      className={cn(
                        'w-full px-4 py-2.5 flex items-center gap-3 text-left transition-colors hover:bg-muted/50',
                        selected?.id === t.id && 'bg-primary/5',
                      )}
                      onClick={() => setSelected(t)}
                    >
                      <CreditCard className="h-3.5 w-3.5 text-muted-foreground/50 shrink-0" />
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2">
                          <span className="text-[13px] font-medium truncate">{name ?? t.tenantId.slice(0, 12) + '...'}</span>
                          <Badge variant="outline" className="text-[9px] px-1.5 py-0 h-4">{t.plan}</Badge>
                          <Badge
                            variant={t.status === 'ACTIVE' ? 'success' : t.status === 'TRIAL' ? 'info' : t.status === 'PAST_DUE' ? 'warning' : 'destructive'}
                            className="text-[9px] px-1.5 py-0 h-4"
                          >
                            {t.status}
                          </Badge>
                        </div>
                        <p className="text-[10px] text-muted-foreground/50 mt-0.5 font-mono">{t.cycle}{t.nextBillingAt ? ` · Sonraki: ${new Date(t.nextBillingAt).toLocaleDateString('tr-TR')}` : ''}</p>
                      </div>
                    </button>
                  );
                })}
              </div>
            ) : (
              <div className="flex flex-col items-center py-14">
                <div className="w-10 h-10 rounded-full bg-muted flex items-center justify-center mb-2.5">
                  <CreditCard className="h-4 w-4 text-muted-foreground/50" />
                </div>
                <p className="text-[13px] text-muted-foreground font-medium">{search || filter !== 'ALL' ? 'Filtre sonucu yok' : 'Billing verisi yok'}</p>
                <p className="text-[11px] text-muted-foreground/60 mt-0.5">{search || filter !== 'ALL' ? 'Farklı filtre deneyin.' : 'İlk abonelik oluşturulduğunda burada görünecek.'}</p>
              </div>
            )}
          </div>
        </>
      )}

      {/* Detail drawer */}
      <Sheet open={!!selected} onOpenChange={open => { if (!open) setSelected(null); }}>
        <SheetContent className="overflow-y-auto sm:max-w-md">
          {selected && (
            <>
              <SheetHeader>
                <SheetTitle className="text-base">{selectedName ?? 'Abonelik Detayı'}</SheetTitle>
                <SheetDescription className="text-[11px] font-mono">#{selected.id.slice(0, 8)}</SheetDescription>
              </SheetHeader>

              <div className="mt-5 space-y-3">
                {/* Status badges */}
                <div className="flex items-center gap-1.5">
                  <Badge variant="outline" className="text-[10px]">{selected.plan}</Badge>
                  <Badge variant={selected.status === 'ACTIVE' ? 'success' : selected.status === 'TRIAL' ? 'info' : selected.status === 'PAST_DUE' ? 'warning' : 'destructive'} className="text-[10px]">{selected.status}</Badge>
                  <Badge variant="secondary" className="text-[10px]">{selected.cycle}</Badge>
                </div>

                {/* Info card */}
                <div className="rounded-lg border bg-muted/30 p-3 space-y-2">
                  <InfoRow label="Tenant ID" value={selected.tenantId} mono />
                  {selectedName && (
                    <>
                      <Separator className="opacity-50" />
                      <InfoRow label="Salon Adı" value={selectedName} />
                    </>
                  )}
                  <Separator className="opacity-50" />
                  <InfoRow label="Plan" value={selected.plan} />
                  <InfoRow label="Dönem" value={selected.cycle} />
                  {selected.trialEndsAt && (
                    <InfoRow label="Deneme Bitiş" value={new Date(selected.trialEndsAt).toLocaleDateString('tr-TR')} />
                  )}
                  {selected.nextBillingAt && (
                    <InfoRow label="Sonraki Fatura" value={new Date(selected.nextBillingAt).toLocaleDateString('tr-TR')} />
                  )}
                </div>

                <p className="text-[10px] text-muted-foreground/50 italic pt-2 border-t border-border/40">Read-only cockpit. Düzenleme bu fazda devre dışı.</p>
              </div>
            </>
          )}
        </SheetContent>
      </Sheet>
    </div>
  );
}

function BillingStatCard({ icon: Icon, label, value, accentClass, iconClass }: {
  icon: React.ComponentType<{ className?: string }>;
  label: string;
  value: string;
  accentClass: string;
  iconClass: string;
}) {
  return (
    <div className="bg-card rounded-lg border p-3.5">
      <div className="flex items-center gap-3">
        <div className={`p-1.5 rounded-md ${accentClass}`}>
          <Icon className={`h-3.5 w-3.5 ${iconClass}`} />
        </div>
        <div>
          <p className="text-lg font-semibold leading-none">{value}</p>
          <p className="text-[11px] text-muted-foreground mt-0.5">{label}</p>
        </div>
      </div>
    </div>
  );
}

function InfoRow({ label, value, mono }: { label: string; value: string; mono?: boolean }) {
  return (
    <div className="flex justify-between text-[13px]">
      <span className="text-muted-foreground/70">{label}</span>
      <span className={cn('font-medium', mono && 'font-mono text-[11px]')}>{value}</span>
    </div>
  );
}
