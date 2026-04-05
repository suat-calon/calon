'use client';

import { useState } from 'react';
import { Loader2, AlertCircle, Building2, Search } from 'lucide-react';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetDescription } from '@/components/ui/sheet';
import { useAdminTenants, useAdminTenantDetail, type AdminTenant } from '@/hooks/api/use-admin';

export default function AdminTenantsPage() {
  const [search, setSearch] = useState('');
  const [selected, setSelected] = useState<AdminTenant | null>(null);
  const { data: tenants, isLoading, error } = useAdminTenants();
  const { data: detail } = useAdminTenantDetail(selected?.id ?? null);

  const q = search.toLowerCase();
  const filtered = (tenants ?? []).filter(t =>
    t.name.toLowerCase().includes(q) || t.slug.toLowerCase().includes(q)
  );

  return (
    <div className="space-y-5 max-w-6xl">
      <h1 className="text-lg font-semibold tracking-tight">Salonlar</h1>
      <div className="relative max-w-sm">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
        <Input placeholder="Salon ara..." className="pl-9 h-9" value={search} onChange={e => setSearch(e.target.value)} />
      </div>

      {error ? (
        <div className="flex items-center gap-2 text-destructive py-8 justify-center">
          <AlertCircle className="h-5 w-5" /><span>{error.message.includes('401') ? 'Geçersiz API anahtarı.' : 'Yüklenemedi.'}</span>
        </div>
      ) : isLoading ? (
        <div className="flex justify-center py-12"><Loader2 className="h-6 w-6 animate-spin text-primary" /></div>
      ) : filtered.length === 0 ? (
        <div className="flex flex-col items-center py-16">
          <Building2 className="h-8 w-8 text-muted-foreground/30 mb-2" />
          <p className="text-sm text-muted-foreground">{search ? 'Sonuç yok.' : 'Henüz salon yok.'}</p>
        </div>
      ) : (
        <div className="space-y-2">
          {filtered.map(t => (
            <button key={t.id} type="button" className="w-full bg-card rounded-lg border shadow-sm px-4 py-3 flex items-center gap-4 hover:shadow-md transition-shadow text-left"
              onClick={() => setSelected(t)}>
              <div className="p-2 rounded-lg bg-muted"><Building2 className="h-4 w-4 text-muted-foreground" /></div>
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2">
                  <span className="text-sm font-semibold truncate">{t.name}</span>
                  <Badge variant="secondary" className="text-[9px]">{t.plan}</Badge>
                  {t.status && <Badge variant={t.status === 'ACTIVE' ? 'success' : 'destructive'} className="text-[9px]">{t.status}</Badge>}
                </div>
                <p className="text-xs text-muted-foreground">{t.slug}</p>
              </div>
              <span className="text-xs text-muted-foreground">{new Date(t.createdAt).toLocaleDateString('tr-TR')}</span>
            </button>
          ))}
        </div>
      )}

      <Sheet open={!!selected} onOpenChange={open => { if (!open) setSelected(null); }}>
        <SheetContent className="overflow-y-auto sm:max-w-lg">
          {selected && (
            <>
              <SheetHeader>
                <SheetTitle>{selected.name}</SheetTitle>
                <SheetDescription>Tenant #{selected.id.slice(0, 8)} · {selected.slug}</SheetDescription>
              </SheetHeader>
              <div className="mt-6 space-y-4">
                <InfoRow label="Plan" value={selected.plan} />
                <InfoRow label="Durum" value={selected.status ?? 'N/A'} />
                <InfoRow label="Kayıt" value={new Date(selected.createdAt).toLocaleDateString('tr-TR')} />
                {detail && (
                  <>
                    <InfoRow label="Timezone" value={detail.timezone ?? 'N/A'} />
                    <InfoRow label="Para birimi" value={detail.currency ?? 'N/A'} />
                    {detail.locations?.map(loc => (
                      <div key={loc.id} className="bg-muted/50 rounded-lg p-3">
                        <p className="text-xs font-medium">{loc.name}</p>
                        <p className="text-[10px] text-muted-foreground">{loc.city} · {loc.phone}</p>
                      </div>
                    ))}
                  </>
                )}
                <p className="text-[10px] text-muted-foreground italic pt-2 border-t">Read-only görünüm. Düzenleme bu fazda devre dışı.</p>
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
    <div className="flex justify-between text-sm">
      <span className="text-muted-foreground">{label}</span>
      <span className="font-medium">{value}</span>
    </div>
  );
}
