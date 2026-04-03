'use client';

import { useState, useMemo, useEffect } from 'react';
import { useSearchParams } from 'next/navigation';
import Link from 'next/link';
import {
  Search, Loader2, AlertCircle, Users, Phone, Mail, Calendar,
  ChevronRight, Clock, Star, ExternalLink, Plus,
} from 'lucide-react';

import { Badge }   from '@/components/ui/badge';
import { Button }  from '@/components/ui/button';
import { Input }   from '@/components/ui/input';
import {
  Sheet, SheetContent, SheetHeader, SheetTitle, SheetDescription,
} from '@/components/ui/sheet';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription,
} from '@/components/ui/dialog';
import { toast } from '@/hooks/use-toast';

import { useCustomers, useCreateCustomer, type Customer } from '@/hooks/api/use-customers';
import { useAppointments, type Appointment } from '@/hooks/api/use-appointments';

// ── Helpers ────────────────────────────────────────────────────────────────────

function fmtDate(iso: string) {
  return new Date(iso).toLocaleDateString('tr-TR', { day: 'numeric', month: 'short', year: 'numeric' });
}
function fmtDateTime(iso: string) {
  return `${fmtDate(iso)} ${new Date(iso).toLocaleTimeString('tr-TR', { hour: '2-digit', minute: '2-digit' })}`;
}

const tierLabel: Record<string, string> = {
  BRONZE: 'Bronz', SILVER: 'Gümüş', GOLD: 'Altın', PLATINUM: 'Platin',
};

const statusLabel: Record<string, string> = {
  PENDING: 'Bekliyor', CONFIRMED: 'Onaylı', CHECKED_IN: 'Geldi',
  IN_SERVICE: 'İşlemde', COMPLETED: 'Tamamlandı', CANCELLED: 'İptal',
  NO_SHOW: 'Gelmedi',
};

const statusColor: Record<string, string> = {
  PENDING: 'bg-amber-100 text-amber-800', CONFIRMED: 'bg-blue-100 text-blue-800',
  CHECKED_IN: 'bg-indigo-100 text-indigo-800', IN_SERVICE: 'bg-purple-100 text-purple-800',
  COMPLETED: 'bg-emerald-100 text-emerald-800', CANCELLED: 'bg-red-100 text-red-800',
  NO_SHOW: 'bg-gray-100 text-gray-800',
};

// ── Main ───────────────────────────────────────────────────────────────────────

export default function CustomersPage() {
  const searchParams = useSearchParams();
  const highlightId  = searchParams.get('highlight');

  const [search, setSearch]           = useState('');
  const [debouncedSearch, setDebSearch] = useState('');
  const [selectedCustomer, setSelectedCustomer] = useState<Customer | null>(null);
  const [createOpen, setCreateOpen] = useState(false);
  const [newFirst, setNewFirst]     = useState('');
  const [newLast, setNewLast]       = useState('');
  const [newPhone, setNewPhone]     = useState('');
  const [newEmail, setNewEmail]     = useState('');
  const [newNotes, setNewNotes]     = useState('');

  // Debounce
  const [timer, setTimer] = useState<ReturnType<typeof setTimeout> | null>(null);
  function onSearchChange(val: string) {
    setSearch(val);
    if (timer) clearTimeout(timer);
    const t = setTimeout(() => setDebSearch(val), 300);
    setTimer(t);
  }

  const { data, isLoading, error } = useCustomers(debouncedSearch || undefined);
  const { data: appointments } = useAppointments();
  const createCustomer = useCreateCustomer();

  const customers = useMemo(() =>
    (data?.data ?? []).filter((c) => !c.isDeleted),
  [data]);

  // Auto-open profile when navigated from calendar with ?highlight=<id>
  useEffect(() => {
    if (highlightId && customers.length > 0 && !selectedCustomer) {
      const target = customers.find((c) => c.id === highlightId);
      if (target) setSelectedCustomer(target);
    }
  }, [highlightId, customers, selectedCustomer]);

  // Customer → appointments map
  const customerAppointments = useMemo(() => {
    if (!appointments) return {};
    const map: Record<string, Appointment[]> = {};
    for (const a of appointments) {
      if (!a.customer) continue;
      if (!map[a.customer.id]) map[a.customer.id] = [];
      map[a.customer.id].push(a);
    }
    for (const id of Object.keys(map)) {
      map[id].sort((a, b) => new Date(b.startTime).getTime() - new Date(a.startTime).getTime());
    }
    return map;
  }, [appointments]);

  function getNextAppointment(cid: string): Appointment | null {
    const now = new Date();
    return (customerAppointments[cid] ?? []).find((a) => new Date(a.startTime) >= now && a.status !== 'CANCELLED') ?? null;
  }

  function getTotalVisits(cid: string): number {
    return (customerAppointments[cid] ?? []).filter((a) => a.status === 'COMPLETED').length;
  }

  return (
    <div className="space-y-5 max-w-5xl">
      {/* Header */}
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold tracking-tight">Müşteriler</h1>
        <div className="flex items-center gap-3">
          <span className="text-sm text-muted-foreground">{data ? `${data.total} müşteri` : ''}</span>
          <Button size="sm" onClick={() => { setNewFirst(''); setNewLast(''); setNewPhone(''); setNewEmail(''); setNewNotes(''); setCreateOpen(true); }}>
            <Plus className="mr-1 h-4 w-4" /> Yeni Müşteri
          </Button>
        </div>
      </div>

      {/* Create Customer Dialog */}
      <Dialog open={createOpen} onOpenChange={setCreateOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Yeni Müşteri</DialogTitle>
            <DialogDescription>Panelden yeni müşteri kaydı oluşturun.</DialogDescription>
          </DialogHeader>
          <div className="space-y-3 mt-2">
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="text-xs font-medium text-muted-foreground">Ad *</label>
                <Input value={newFirst} onChange={(e) => setNewFirst(e.target.value)} placeholder="Ad" className="h-9" />
              </div>
              <div>
                <label className="text-xs font-medium text-muted-foreground">Soyad *</label>
                <Input value={newLast} onChange={(e) => setNewLast(e.target.value)} placeholder="Soyad" className="h-9" />
              </div>
            </div>
            <div>
              <label className="text-xs font-medium text-muted-foreground">Telefon</label>
              <Input value={newPhone} onChange={(e) => setNewPhone(e.target.value)} placeholder="+90 5XX XXX XX XX" className="h-9" />
            </div>
            <div>
              <label className="text-xs font-medium text-muted-foreground">E-posta</label>
              <Input type="email" value={newEmail} onChange={(e) => setNewEmail(e.target.value)} placeholder="ornek@mail.com" className="h-9" />
            </div>
            <div>
              <label className="text-xs font-medium text-muted-foreground">Not</label>
              <Input value={newNotes} onChange={(e) => setNewNotes(e.target.value)} placeholder="Opsiyonel not..." className="h-9" />
            </div>
            <div className="flex justify-end gap-2 pt-2">
              <Button variant="outline" size="sm" onClick={() => setCreateOpen(false)}>Vazgeç</Button>
              <Button
                size="sm"
                disabled={createCustomer.isPending || !newFirst.trim() || !newLast.trim()}
                onClick={async () => {
                  try {
                    await createCustomer.mutateAsync({
                      firstName: newFirst.trim(),
                      lastName: newLast.trim(),
                      ...(newPhone.trim() ? { phone: newPhone.trim() } : {}),
                      ...(newEmail.trim() ? { email: newEmail.trim() } : {}),
                      ...(newNotes.trim() ? { notes: newNotes.trim() } : {}),
                      consentGiven: true,
                    });
                    setCreateOpen(false);
                    toast({ title: 'Müşteri oluşturuldu', description: `${newFirst} ${newLast} başarıyla eklendi.` });
                  } catch (err: unknown) {
                    const msg = err && typeof err === 'object' && 'response' in err
                      ? (err as { response?: { data?: { message?: string } } }).response?.data?.message
                      : 'Müşteri oluşturulamadı.';
                    toast({ variant: 'destructive', title: 'Hata', description: typeof msg === 'string' ? msg : 'Müşteri oluşturulamadı.' });
                  }
                }}
              >
                {createCustomer.isPending ? <Loader2 className="mr-1 h-3 w-3 animate-spin" /> : null}
                Oluştur
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* Search */}
      <div className="relative max-w-sm">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
        <Input placeholder="İsim, telefon veya e-posta ara..." className="pl-9 h-9" value={search} onChange={(e) => onSearchChange(e.target.value)} />
      </div>

      {/* List */}
      {error ? (
        <div className="flex items-center gap-2 text-destructive py-8 justify-center">
          <AlertCircle className="h-5 w-5" /><span>Yüklenemedi. Lütfen sayfayı yenileyin.</span>
        </div>
      ) : isLoading ? (
        <div className="flex justify-center py-12"><Loader2 className="h-6 w-6 animate-spin text-primary" /></div>
      ) : customers.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-16 text-center">
          <div className="p-3 rounded-xl bg-muted mb-3"><Users className="h-6 w-6 text-muted-foreground/50" /></div>
          <p className="text-sm text-muted-foreground">{search ? 'Arama sonucu bulunamadı.' : 'Henüz müşteri kaydı yok.'}</p>
          {!search && <p className="text-xs text-muted-foreground mt-1">Booking üzerinden randevu alındığında müşteriler otomatik oluşturulur.</p>}
        </div>
      ) : (
        <div className="space-y-2">
          {customers.map((c) => {
            const nextAppt = getNextAppointment(c.id);
            const visits   = getTotalVisits(c.id);
            return (
              <button key={c.id} type="button" className="w-full bg-white rounded-xl border shadow-sm px-4 py-3 flex items-center gap-4 hover:shadow-md transition-shadow text-left group"
                onClick={() => setSelectedCustomer(c)}
              >
                <div className="h-10 w-10 rounded-full bg-primary/10 flex items-center justify-center flex-shrink-0">
                  <span className="text-sm font-semibold text-primary">{c.firstName[0]}{c.lastName[0]}</span>
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="text-sm font-semibold truncate">{c.firstName} {c.lastName}</span>
                    {visits > 0 && <Badge variant="secondary" className="text-[9px] px-1.5 py-0">{visits} ziyaret</Badge>}
                  </div>
                  <div className="flex items-center gap-3 text-xs text-muted-foreground mt-0.5">
                    {c.phone && <span className="flex items-center gap-1"><Phone className="h-3 w-3" />{c.phone}</span>}
                    {c.email && <span className="flex items-center gap-1"><Mail className="h-3 w-3" />{c.email}</span>}
                  </div>
                </div>
                {nextAppt && (
                  <div className="hidden sm:flex items-center gap-1.5 text-xs text-muted-foreground">
                    <Calendar className="h-3.5 w-3.5 text-primary" /><span>{fmtDate(nextAppt.startTime)}</span>
                  </div>
                )}
                <ChevronRight className="h-4 w-4 text-muted-foreground/40 group-hover:text-muted-foreground transition-colors" />
              </button>
            );
          })}
        </div>
      )}

      {/* Profile Sheet */}
      <Sheet open={!!selectedCustomer} onOpenChange={(open) => { if (!open) setSelectedCustomer(null); }}>
        <SheetContent className="overflow-y-auto sm:max-w-md">
          {selectedCustomer && (
            <CustomerProfile customer={selectedCustomer} appointments={customerAppointments[selectedCustomer.id] ?? []} />
          )}
        </SheetContent>
      </Sheet>
    </div>
  );
}

// ── Customer Profile ────────────────────────────────────────────────────────

function CustomerProfile({ customer: c, appointments: appts }: { customer: Customer; appointments: Appointment[] }) {
  const now = new Date();
  const upcoming  = appts.filter((a) => new Date(a.startTime) >= now && a.status !== 'CANCELLED');
  const past      = appts.filter((a) => new Date(a.startTime) < now || a.status === 'COMPLETED' || a.status === 'CANCELLED');
  const completed = appts.filter((a) => a.status === 'COMPLETED').length;

  return (
    <>
      <SheetHeader>
        <div className="flex items-center gap-3">
          <div className="h-12 w-12 rounded-full bg-primary/10 flex items-center justify-center">
            <span className="text-lg font-bold text-primary">{c.firstName[0]}{c.lastName[0]}</span>
          </div>
          <div>
            <SheetTitle className="text-left">{c.firstName} {c.lastName}</SheetTitle>
            <SheetDescription className="text-left">Müşteri #{c.id.slice(0, 8)}</SheetDescription>
          </div>
        </div>
      </SheetHeader>

      <div className="mt-6 space-y-6">
        {/* Contact */}
        <section className="space-y-2">
          <h3 className="text-xs font-medium text-muted-foreground uppercase tracking-wider">İletişim</h3>
          <div className="space-y-1.5">
            {c.phone && <div className="flex items-center gap-2 text-sm"><Phone className="h-4 w-4 text-muted-foreground" /><span>{c.phone}</span></div>}
            {c.email && <div className="flex items-center gap-2 text-sm"><Mail className="h-4 w-4 text-muted-foreground" /><span>{c.email}</span></div>}
            {!c.phone && !c.email && <p className="text-sm text-muted-foreground italic">İletişim bilgisi yok</p>}
          </div>
        </section>

        {/* Stats */}
        <div className="grid grid-cols-3 gap-3">
          <div className="bg-muted/50 rounded-lg p-3 text-center">
            <p className="text-lg font-bold">{completed}</p>
            <p className="text-[10px] text-muted-foreground mt-0.5">Ziyaret</p>
          </div>
          <div className="bg-muted/50 rounded-lg p-3 text-center">
            <p className="text-lg font-bold">{c.loyaltyPoints}</p>
            <p className="text-[10px] text-muted-foreground mt-0.5">Puan</p>
          </div>
          <div className="bg-muted/50 rounded-lg p-3 text-center flex flex-col items-center justify-center">
            <div className="flex items-center gap-1">
              <Star className="h-3.5 w-3.5 text-amber-500" />
              <p className="text-xs font-medium">{tierLabel[c.loyaltyTier] ?? c.loyaltyTier}</p>
            </div>
            <p className="text-[10px] text-muted-foreground mt-0.5">Seviye</p>
          </div>
        </div>

        {/* Upcoming */}
        <section className="space-y-2">
          <h3 className="text-xs font-medium text-muted-foreground uppercase tracking-wider">Yaklaşan ({upcoming.length})</h3>
          {upcoming.length === 0
            ? <p className="text-sm text-muted-foreground italic">Yaklaşan randevu yok</p>
            : upcoming.slice(0, 5).map((a) => <ApptRow key={a.id} a={a} />)
          }
        </section>

        {/* Past */}
        <section className="space-y-2">
          <h3 className="text-xs font-medium text-muted-foreground uppercase tracking-wider">Geçmiş ({past.length})</h3>
          {past.length === 0
            ? <p className="text-sm text-muted-foreground italic">Geçmiş randevu yok</p>
            : past.slice(0, 10).map((a) => <ApptRow key={a.id} a={a} />)
          }
        </section>

        {/* Meta */}
        <section className="pt-2 border-t text-xs text-muted-foreground space-y-1">
          <p>Kayıt: {fmtDate(c.createdAt)}</p>
          {c.referralCode && <p>Referans: {c.referralCode}</p>}
        </section>
      </div>
    </>
  );
}

function ApptRow({ a }: { a: Appointment }) {
  // Navigate to calendar week containing this appointment
  const apptDate = a.startTime.split('T')[0];
  return (
    <Link href={`/calendar?date=${apptDate}`} className="block">
      <div className="flex items-center gap-3 bg-white border rounded-lg px-3 py-2 hover:bg-muted/30 transition-colors cursor-pointer group">
        <Clock className="h-3.5 w-3.5 text-muted-foreground flex-shrink-0" />
        <div className="flex-1 min-w-0">
          <p className="text-xs font-medium truncate">{a.service?.name ?? 'Hizmet'} — {a.staff?.firstName ?? ''}</p>
          <p className="text-[10px] text-muted-foreground">{fmtDateTime(a.startTime)}</p>
        </div>
        <span className={`text-[9px] px-1.5 py-0.5 rounded-full font-medium ${statusColor[a.status] ?? 'bg-gray-100 text-gray-800'}`}>
          {statusLabel[a.status] ?? a.status}
        </span>
        <ExternalLink className="h-3 w-3 text-muted-foreground/30 group-hover:text-muted-foreground transition-colors" />
      </div>
    </Link>
  );
}
