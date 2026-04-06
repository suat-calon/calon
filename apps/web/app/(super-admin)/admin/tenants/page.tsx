'use client';

import { useState } from 'react';
import { Building2, Search, MapPin, Calendar as CalendarIcon } from 'lucide-react';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetDescription } from '@/components/ui/sheet';
import { Separator } from '@/components/ui/separator';
import { useAdminTenants, useAdminTenantDetail, type AdminTenant } from '@/hooks/api/use-admin';
import { cn } from '@/lib/utils';

export default function AdminTenantsPage() {
  const [search, setSearch] = useState('');
  const [selected, setSelected] = useState<AdminTenant | null>(null);
  const { data: tenants, isLoading, error } = useAdminTenants();
  const { data: detail } = useAdminTenantDetail(selected?.id ?? null);

  const q = search.toLowerCase();
  const filtered = (tenants ?? []).filter(t =>
    t.name.toLowerCase().includes(q) || t.slug.toLowerCase().includes(q)
  );

  const statusCounts = {
    total: tenants?.length ?? 0,
    active: tenants?.filter(t => t.status === 'ACTIVE').length ?? 0,
    trial: tenants?.filter(t => t.status === 'TRIAL').length ?? 0,
  };

  return (
    <div className="space-y-4 max-w-6xl">
      {/* Page header */}
      <div className="flex items-center justify-between pb-1 border-b border-border/40">
        <div>
          <h1 className="text-xl font-semibold tracking-tight">Salonlar</h1>
          <p className="text-[11px] text-muted-foreground/70 mt-0.5">{statusCounts.total} salon · {statusCounts.active} aktif · {statusCounts.trial} deneme</p>
        </div>
      </div>

      {/* Filter bar */}
      <div className="flex items-center gap-3">
        <div className="relative flex-1 max-w-sm">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground/50" />
          <Input placeholder="Salon adı veya slug ara..." className="pl-9 h-8 text-[13px]" value={search} onChange={e => setSearch(e.target.value)} />
        </div>
        <span className="text-[11px] text-muted-foreground/60">{filtered.length} sonuç</span>
      </div>

      {/* List */}
      {error ? (
        <div className="flex items-center gap-2 text-destructive py-8 justify-center text-sm">
          <span>Veriler yüklenemedi.</span>
        </div>
      ) : isLoading ? (
        <div className="flex justify-center py-16">
          <div className="w-6 h-6 animate-spin rounded-full border-2 border-muted border-t-primary" />
        </div>
      ) : filtered.length === 0 ? (
        <div className="flex flex-col items-center py-14">
          <div className="w-10 h-10 rounded-full bg-muted flex items-center justify-center mb-2.5">
            <Building2 className="h-4 w-4 text-muted-foreground/50" />
          </div>
          <p className="text-[13px] text-muted-foreground font-medium">{search ? 'Arama sonucu yok' : 'Henüz salon yok'}</p>
          <p className="text-[11px] text-muted-foreground/60 mt-0.5">{search ? 'Farklı terimlerle deneyin.' : 'İlk salon kaydedildiğinde burada görünecek.'}</p>
        </div>
      ) : (
        <div className="bg-card rounded-lg border divide-y divide-border/60">
          {filtered.map(t => (
            <button key={t.id} type="button"
              className={cn(
                'w-full px-4 py-3 flex items-center gap-3 text-left transition-colors hover:bg-muted/50',
                selected?.id === t.id && 'bg-primary/5',
              )}
              onClick={() => setSelected(t)}
            >
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2">
                  <span className="text-sm font-medium truncate">{t.name}</span>
                  <Badge variant="outline" className="text-[9px] px-1.5 py-0 h-4">{t.plan}</Badge>
                  {t.status && (
                    <Badge
                      variant={t.status === 'ACTIVE' ? 'success' : t.status === 'TRIAL' ? 'info' : 'destructive'}
                      className="text-[9px] px-1.5 py-0 h-4"
                    >
                      {t.status}
                    </Badge>
                  )}
                </div>
                <p className="text-[11px] text-muted-foreground/60 mt-0.5 font-mono">{t.slug}</p>
              </div>
              <span className="text-[10px] text-muted-foreground/50 tabular-nums shrink-0">{new Date(t.createdAt).toLocaleDateString('tr-TR')}</span>
            </button>
          ))}
        </div>
      )}

      {/* Detail drawer */}
      <Sheet open={!!selected} onOpenChange={open => { if (!open) setSelected(null); }}>
        <SheetContent className="overflow-y-auto sm:max-w-md">
          {selected && (
            <>
              <SheetHeader>
                <SheetTitle className="text-base">{selected.name}</SheetTitle>
                <SheetDescription className="text-[11px] font-mono">{selected.slug} · #{selected.id.slice(0, 8)}</SheetDescription>
              </SheetHeader>

              <div className="mt-5 space-y-3">
                {/* Status badges */}
                <div className="flex items-center gap-1.5">
                  <Badge variant="outline" className="text-[10px]">{selected.plan}</Badge>
                  {selected.status && (
                    <Badge variant={selected.status === 'ACTIVE' ? 'success' : 'destructive'} className="text-[10px]">{selected.status}</Badge>
                  )}
                </div>

                {/* Info card */}
                <div className="rounded-lg border bg-muted/30 p-3 space-y-2">
                  <InfoRow label="Kayıt Tarihi" value={new Date(selected.createdAt).toLocaleDateString('tr-TR')} />
                  {detail && (
                    <>
                      <Separator className="opacity-50" />
                      <InfoRow label="Timezone" value={detail.timezone ?? 'N/A'} />
                      <InfoRow label="Para birimi" value={detail.currency ?? 'N/A'} />
                    </>
                  )}
                </div>

                {/* Locations */}
                {detail?.locations && detail.locations.length > 0 && (
                  <div>
                    <p className="text-[10px] font-semibold uppercase tracking-widest text-muted-foreground/60 mb-2">Lokasyonlar</p>
                    <div className="space-y-1.5">
                      {detail.locations.map((loc: { id: string; name: string; city?: string; phone?: string }) => (
                        <div key={loc.id} className="rounded-md border bg-muted/20 px-3 py-2">
                          <p className="text-[13px] font-medium flex items-center gap-1.5">
                            <MapPin className="h-3 w-3 text-muted-foreground/50" />
                            {loc.name}
                          </p>
                          {(loc.city || loc.phone) && (
                            <p className="text-[10px] text-muted-foreground/60 ml-[18px]">{[loc.city, loc.phone].filter(Boolean).join(' · ')}</p>
                          )}
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                <p className="text-[10px] text-muted-foreground/50 italic pt-2 border-t border-border/40">Read-only cockpit. Düzenleme bu fazda devre dışı.</p>
              </div>
            </>
          )}
        </SheetContent>
      </Sheet>
    </div>
  );
}

function InfoRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex justify-between text-[13px]">
      <span className="text-muted-foreground/70">{label}</span>
      <span className="font-medium">{value}</span>
    </div>
  );
}
