'use client';

import { useState, useMemo, useEffect } from 'react';
import { useSearchParams } from 'next/navigation';
import Link from 'next/link';
import {
  Search, Loader2, AlertCircle, Users, Phone, Mail, Calendar,
  ChevronRight, Clock, Star, ExternalLink, Plus, Copy, CalendarPlus,
  TrendingUp, AlertTriangle, FileText, Link2,
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
  const [newConsent, setNewConsent] = useState(false);

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
          <Button size="sm" onClick={() => { setNewFirst(''); setNewLast(''); setNewPhone(''); setNewEmail(''); setNewNotes(''); setNewConsent(false); setCreateOpen(true); }}>
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
            <label className="flex items-start gap-2 cursor-pointer py-1">
              <input
                type="checkbox"
                checked={newConsent}
                onChange={(e) => setNewConsent(e.target.checked)}
                className="mt-0.5 h-4 w-4 rounded border-gray-300 text-primary focus:ring-primary"
              />
              <span className="text-xs text-muted-foreground leading-tight">
                Müşterinin kişisel verilerinin işlenmesine ilişkin bilgilendirme yapıldı ve onayı alındı.
              </span>
            </label>
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
                      ...(newConsent ? { consentGiven: true } : {}),
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
          {!search && (
            <div className="mt-3 space-y-2">
              <p className="text-xs text-muted-foreground">Booking linkinizi paylaşarak ilk müşterinizi kazanın veya manuel ekleyin.</p>
              <div className="flex gap-2 justify-center">
                <Button size="sm" variant="outline" onClick={() => { setNewFirst(''); setNewLast(''); setNewPhone(''); setNewEmail(''); setNewNotes(''); setNewConsent(false); setCreateOpen(true); }}>
                  <Plus className="mr-1 h-3 w-3" /> Manuel Ekle
                </Button>
                <Button size="sm" variant="outline" asChild>
                  <Link href="/settings"><Link2 className="mr-1 h-3 w-3" /> Booking Link</Link>
                </Button>
              </div>
            </div>
          )}
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

  // ── Derived stats ───────────────────────────────────────────────────────
  const upcoming     = appts.filter((a) => new Date(a.startTime) >= now && a.status !== 'CANCELLED' && a.status !== 'NO_SHOW');
  const past         = appts.filter((a) => new Date(a.startTime) < now || a.status === 'COMPLETED' || a.status === 'CANCELLED' || a.status === 'NO_SHOW');
  const completedApts = appts.filter((a) => a.status === 'COMPLETED');
  const visitCount   = completedApts.length;
  const noShowCount  = appts.filter((a) => a.status === 'NO_SHOW').length;
  const cancelCount  = appts.filter((a) => a.status === 'CANCELLED').length;
  // Hizmet toplamı — appointment.totalPrice toplamı.
  // NOT: Bu gerçek tahsilat tutarı değil, hizmet değeri toplamıdır.
  // Checkout yapılmışsa totalPrice = tahsilat, yapılmamışsa = hizmet fiyatı.
  // Customer-level ledger aggregation olmadığından kesin tahsilat buradan türetilemez.
  const serviceTotal = completedApts.reduce((sum, a) => sum + Number(a.totalPrice ?? 0), 0);
  const lastVisit    = completedApts.length > 0
    ? completedApts.sort((a, b) => new Date(b.startTime).getTime() - new Date(a.startTime).getTime())[0]
    : null;
  // Hizmet tutarı girilmemiş completed randevular — dikkat sinyali.
  // NOT: Bu "ödenmemiş" değil, "tutar kaydedilmemiş" demektir.
  const missingPrice = completedApts.filter((a) => !a.totalPrice || Number(a.totalPrice) === 0);

  // ── Intelligence signals (deterministic, heuristic-based) ────────────
  const totalAppts   = appts.length;
  const avgTicket    = visitCount > 0 ? Math.round(serviceTotal / visitCount) : 0;
  const noShowRate   = totalAppts > 0 ? noShowCount / totalAppts : 0;
  const cancelRate   = totalAppts > 0 ? cancelCount / totalAppts : 0;
  const daysSinceLastVisit = lastVisit
    ? Math.floor((now.getTime() - new Date(lastVisit.startTime).getTime()) / (1000 * 60 * 60 * 24))
    : null;

  // ── Multi-signal model (bağımsız, override yok) ─────────────────────
  // Her sinyal bağımsız boolean — aynı müşteri VIP + Dormant + Risk olabilir.
  // Thresholds açık, deterministic, kodda okunur.
  const signals = {
    isNew:       visitCount === 0,                                              // Henüz tamamlanan randevusu yok
    isReturning: visitCount >= 1 && visitCount < 5,                             // 1-4 tamamlanan ziyaret
    isVip:       visitCount >= 5,                                               // 5+ tamamlanan ziyaret
    isDormant:   daysSinceLastVisit !== null && daysSinceLastVisit > 90,         // 90+ gün gelmedi
    isRisk:      noShowCount >= 2 || (totalAppts >= 4 && noShowRate > 0.3),     // 2+ no-show VEYA %30+ no-show oranı
    hasUpcoming: upcoming.length > 0,                                           // Yaklaşan randevusu var
  };

  // ── Cycle intelligence v3 — variance-aware confidence + absolute urgency ──
  //
  // Formula: ALWAYS median (outlier-resistant, stable)
  //
  // Confidence v3 = depth × stability:
  //   depth:     1 interval → base low, 2-3 → base medium, 4+ → base high
  //   stability: spread/median < 0.5 → stable, 0.5-1.0 → moderate, >1.0 → unstable
  //   unstable pattern → confidence drops one level
  //   Example: 5 visits [10,60,15,45] → depth=high but unstable → medium
  //
  // Urgency v3 = ratio × absolute:
  //   ratio = daysSinceLastVisit / typicalCycleDays
  //   overdueDays = daysSinceLastVisit - typicalCycleDays
  //   Both must meet minimum thresholds to trigger urgency level.
  //   Prevents short cycles from amplifying tiny delays.
  //
  type CycleConfidence = 'low' | 'medium' | 'high';
  type CycleUrgency = 'none' | 'dueSoon' | 'slightlyOverdue' | 'overdue' | 'critical' | 'insufficient';
  let typicalCycleDays: number | null = null;
  let cycleConfidence: CycleConfidence = 'low';
  let cycleUrgency: CycleUrgency = 'insufficient';
  let overdueDays = 0;

  if (visitCount >= 2) {
    const sortedDates = completedApts
      .map((a) => new Date(a.startTime).getTime())
      .sort((a, b) => a - b);

    const intervals: number[] = [];
    for (let i = 1; i < sortedDates.length; i++) {
      intervals.push(Math.round((sortedDates[i] - sortedDates[i - 1]) / (1000 * 60 * 60 * 24)));
    }

    if (intervals.length > 0) {
      // Median formula (stable, no hybrid)
      const sorted = [...intervals].sort((a, b) => a - b);
      typicalCycleDays = sorted[Math.floor(sorted.length / 2)];

      // ── Confidence v3: depth × stability ─────────────────────────
      // Depth score
      let depthLevel: CycleConfidence = 'low';
      if (intervals.length >= 4)      depthLevel = 'high';
      else if (intervals.length >= 2) depthLevel = 'medium';

      // Stability: spread / median (normalized)
      // Low spread = consistent pattern, high spread = erratic
      const spread = sorted[sorted.length - 1] - sorted[0]; // max - min
      const normalizedSpread = typicalCycleDays > 0 ? spread / typicalCycleDays : 0;
      const isStable   = normalizedSpread < 0.5;  // spread < 50% of median
      const isUnstable = normalizedSpread > 1.0;   // spread > 100% of median

      // Confidence = depth, penalized by instability
      cycleConfidence = depthLevel;
      if (isUnstable && depthLevel === 'high')    cycleConfidence = 'medium';
      if (isUnstable && depthLevel === 'medium')  cycleConfidence = 'low';
      // Stable pattern doesn't upgrade (keeps depth-based level)

      // ── Urgency v3: ratio × absolute ─────────────────────────────
      if (daysSinceLastVisit !== null && typicalCycleDays > 0) {
        const ratio = daysSinceLastVisit / typicalCycleDays;
        overdueDays = daysSinceLastVisit - typicalCycleDays;

        // Hybrid thresholds: ratio AND minimum absolute days
        // Prevents short cycles (7 days) from triggering critical at day 13
        if      (ratio >= 1.8 && overdueDays >= 14) cycleUrgency = 'critical';
        else if (ratio >= 1.3 && overdueDays >= 7)  cycleUrgency = 'overdue';
        else if (ratio >= 1.0 && overdueDays >= 3)  cycleUrgency = 'slightlyOverdue';
        else if (ratio >= 0.8)                      cycleUrgency = 'dueSoon';
        else                                        cycleUrgency = 'none';
      }
    }
  }

  // isDormant: cycle varsa urgency'e göre, yoksa sabit 90 gün fallback
  const effectiveDormant = typicalCycleDays !== null
    ? cycleUrgency === 'overdue' || cycleUrgency === 'critical'
    : (daysSinceLastVisit !== null && daysSinceLastVisit > 90);
  signals.isDormant = effectiveDormant;

  // Confidence-aware cycle label
  const cycleLabel = typicalCycleDays !== null
    ? cycleConfidence === 'low'
      ? `yaklaşık ${typicalCycleDays} gün`
      : `${typicalCycleDays} gün`
    : null;

  // Cycle badge — urgency-based, priority ordered
  const cycleBadge =
    cycleUrgency === 'critical'         ? { key: 'critical',  show: true, label: 'Acil',      color: 'text-red-800',    bg: 'bg-red-100 border-red-300' }
    : cycleUrgency === 'overdue'        ? { key: 'overdue',   show: true, label: 'Gecikmiş',  color: 'text-orange-700', bg: 'bg-orange-50 border-orange-200' }
    : cycleUrgency === 'slightlyOverdue'? { key: 'slight',    show: true, label: 'Geçiyor',   color: 'text-amber-700',  bg: 'bg-amber-50 border-amber-200' }
    : cycleUrgency === 'dueSoon'        ? { key: 'dueSoon',   show: true, label: 'Yakında',   color: 'text-blue-600',   bg: 'bg-blue-50 border-blue-200' }
    : null;

  // Badge config — multi-badge, en fazla 3 gösterilir
  const badgeConfig = [
    { key: 'isVip',       show: signals.isVip,       label: 'VIP',        color: 'text-purple-700',  bg: 'bg-purple-50 border-purple-200' },
    { key: 'isRisk',      show: signals.isRisk,      label: 'Dikkat',     color: 'text-red-700',     bg: 'bg-red-50 border-red-200' },
    { key: 'isDormant',   show: signals.isDormant,    label: 'Uzak',       color: 'text-gray-600',    bg: 'bg-gray-50 border-gray-200' },
    { key: 'isReturning', show: signals.isReturning,  label: 'Tekrar',     color: 'text-emerald-700', bg: 'bg-emerald-50 border-emerald-200' },
    { key: 'isNew',       show: signals.isNew,        label: 'Yeni',       color: 'text-blue-700',    bg: 'bg-blue-50 border-blue-200' },
    { key: 'hasUpcoming', show: signals.hasUpcoming,   label: 'Randevulu',  color: 'text-indigo-700',  bg: 'bg-indigo-50 border-indigo-200' },
    ...(cycleBadge ? [cycleBadge] : []),
  ].filter((b) => b.show).slice(0, 3);

  // ── Summary sentence v3 — confidence + urgency + business impact ───
  const confWord = cycleConfidence === 'low' ? 'Yaklaşık' : 'Genelde';
  const summaryParts: string[] = [];

  // Business impact prefix for VIP + overdue combinations
  const valuePrefix = signals.isVip ? 'Değerli müşteri' : null;

  if (cycleLabel && cycleUrgency === 'critical') {
    const base = `${confWord} ${cycleLabel}de bir gelir; ${daysSinceLastVisit} gün oldu (+${overdueDays} gün gecikme).`;
    summaryParts.push(valuePrefix ? `${valuePrefix} — ${base.charAt(0).toLowerCase() + base.slice(1)}` : base);
  } else if (cycleLabel && cycleUrgency === 'overdue') {
    summaryParts.push(`${valuePrefix ? valuePrefix + ', ' : ''}${confWord.toLowerCase()} ${cycleLabel}de bir gelir, ${overdueDays} gün gecikmiş.`);
  } else if (cycleLabel && cycleUrgency === 'slightlyOverdue') {
    summaryParts.push(`${confWord} ${cycleLabel}de bir gelir, ${daysSinceLastVisit} gün oldu.`);
  } else if (cycleLabel && cycleUrgency === 'dueSoon') {
    summaryParts.push(`${confWord} ${cycleLabel}de bir gelir, yakında tekrar zamanı.`);
  } else if (signals.isVip && signals.isDormant) {
    summaryParts.push(`Değerli müşteri (${visitCount} ziyaret), ${daysSinceLastVisit} gündür gelmedi.`);
  } else if (signals.isVip) {
    summaryParts.push(`Düzenli ve değerli müşteri — ${visitCount} tamamlanan ziyaret.`);
  } else if (signals.isDormant) {
    summaryParts.push(`${daysSinceLastVisit} gündür gelmedi.`);
  } else if (signals.isNew) {
    summaryParts.push('Yeni müşteri, henüz tamamlanan randevusu yok.');
  } else if (signals.isReturning && cycleLabel) {
    summaryParts.push(`${visitCount} ziyaret, ${confWord.toLowerCase()} ${cycleLabel}de bir geliyor.`);
  } else if (signals.isReturning) {
    summaryParts.push(`${visitCount} ziyaret tamamladı${daysSinceLastVisit !== null ? `, son ziyaret ${daysSinceLastVisit} gün önce` : ''}.`);
  }

  if (signals.isRisk) {
    summaryParts.push(`${noShowCount} kez gelmedi — dikkat gerektiriyor.`);
  }
  if (signals.hasUpcoming) {
    summaryParts.push('Yaklaşan randevusu var.');
  }
  const summaryLine = summaryParts.join(' ');

  // Favori hizmet
  const svcCounts: Record<string, { name: string; count: number }> = {};
  for (const a of completedApts) {
    const sname = a.service?.name ?? 'Bilinmiyor';
    if (!svcCounts[sname]) svcCounts[sname] = { name: sname, count: 0 };
    svcCounts[sname].count++;
  }
  const topService = Object.values(svcCounts).sort((a, b) => b.count - a.count)[0] ?? null;

  // Tercih edilen personel
  const staffCounts: Record<string, { name: string; count: number }> = {};
  for (const a of completedApts) {
    const sname = a.staff ? `${a.staff.firstName} ${a.staff.lastName}` : null;
    if (sname) {
      if (!staffCounts[sname]) staffCounts[sname] = { name: sname, count: 0 };
      staffCounts[sname].count++;
    }
  }
  const topStaff = Object.values(staffCounts).sort((a, b) => b.count - a.count)[0] ?? null;

  // ── Next best action v3 — urgency + confidence + business impact ────
  const valueSuffix = signals.isVip ? ' (değerli müşteri)' : '';
  let nextAction: { label: string; reason: string; href: string; icon: typeof CalendarPlus } | null = null;

  if (signals.hasUpcoming) {
    nextAction = {
      label: 'Yaklaşan randevuyu görüntüle',
      reason: `${fmtDate(upcoming[0].startTime)} tarihli randevusu var.`,
      href: `/calendar?date=${upcoming[0].startTime.split('T')[0]}`,
      icon: Calendar,
    };
  } else if (cycleUrgency === 'critical' && topService) {
    nextAction = {
      label: `${topService.name} için hemen randevu oluşturun`,
      reason: `+${overdueDays} gün gecikme${valueSuffix}. ${confWord} ${cycleLabel}de bir gelir.`,
      href: '/calendar',
      icon: CalendarPlus,
    };
  } else if (cycleUrgency === 'critical') {
    nextAction = {
      label: 'Acil tekrar randevu oluşturun',
      reason: `+${overdueDays} gün gecikme${valueSuffix}. Döngüyü ciddi aştı.`,
      href: '/calendar',
      icon: CalendarPlus,
    };
  } else if (cycleUrgency === 'overdue' && topService) {
    nextAction = {
      label: `${topService.name} için tekrar randevu zamanı`,
      reason: `+${overdueDays} gün gecikme${valueSuffix}.`,
      href: '/calendar',
      icon: CalendarPlus,
    };
  } else if (cycleUrgency === 'overdue' || cycleUrgency === 'slightlyOverdue') {
    nextAction = {
      label: 'Tekrar randevu zamanı geldi',
      reason: `Döngüsünü ${overdueDays} gün geçti${valueSuffix}.`,
      href: '/calendar',
      icon: CalendarPlus,
    };
  } else if (cycleUrgency === 'dueSoon' && topService) {
    nextAction = {
      label: `${topService.name} randevusunu planlayın`,
      reason: `${confWord} ${cycleLabel}de bir gelir — yakında tekrar zamanı.`,
      href: '/calendar',
      icon: CalendarPlus,
    };
  } else if (signals.isDormant && topService) {
    nextAction = {
      label: `${topService.name} için tekrar randevu oluştur`,
      reason: `Son ziyareti ${daysSinceLastVisit} gün önce${valueSuffix}.`,
      href: '/calendar',
      icon: CalendarPlus,
    };
  } else if (signals.isDormant) {
    nextAction = {
      label: 'Tekrar randevu oluştur',
      reason: `${daysSinceLastVisit} gündür gelmedi${valueSuffix}.`,
      href: '/calendar',
      icon: CalendarPlus,
    };
  } else if (signals.isNew) {
    nextAction = {
      label: 'İlk randevuyu oluştur',
      reason: 'Henüz tamamlanan randevusu yok.',
      href: '/calendar',
      icon: CalendarPlus,
    };
  } else if (visitCount > 0 && !signals.hasUpcoming) {
    nextAction = {
      label: 'Sonraki randevuyu planla',
      reason: cycleLabel
        ? `${confWord} ${cycleLabel}de bir geliyor — ${visitCount} ziyaret tamamladı.`
        : `${visitCount} ziyaret tamamladı — devam ettirin.`,
      href: '/calendar',
      icon: CalendarPlus,
    };
  }

  // Copy helper
  function copyToClipboard(text: string, label: string) {
    navigator.clipboard.writeText(text).then(() => {
      toast({ title: 'Kopyalandı', description: `${label} panoya kopyalandı.` });
    }).catch(() => {});
  }

  return (
    <>
      <SheetHeader>
        <div className="flex items-center gap-3">
          <div className="h-12 w-12 rounded-full bg-primary/10 flex items-center justify-center">
            <span className="text-lg font-bold text-primary">{c.firstName[0]}{c.lastName[0]}</span>
          </div>
          <div>
            <SheetTitle className="text-left flex items-center gap-1.5 flex-wrap">
              {c.firstName} {c.lastName}
              {badgeConfig.map((b) => (
                <span key={b.key} className={`text-[10px] px-1.5 py-0.5 rounded-full border font-medium ${b.bg} ${b.color}`}>
                  {b.label}
                </span>
              ))}
            </SheetTitle>
            <SheetDescription className="text-left">
              Müşteri #{c.id.slice(0, 8)} • Kayıt: {fmtDate(c.createdAt)}
            </SheetDescription>
          </div>
        </div>
      </SheetHeader>

      <div className="mt-5 space-y-5">

        {/* ── Summary sentence ──────────────────────────────────────────── */}
        {summaryLine && (
          <p className="text-xs text-muted-foreground leading-relaxed italic">{summaryLine}</p>
        )}

        {/* ── Attention Flags ───────────────────────────────────────────── */}
        {missingPrice.length > 0 && (
          <div className="flex items-center gap-2 bg-amber-50 border border-amber-200 rounded-lg p-2.5">
            <AlertTriangle className="h-4 w-4 text-amber-600 shrink-0" />
            <span className="text-xs text-amber-800 font-medium">
              {missingPrice.length} tamamlanmış randevuda hizmet tutarı girilmemiş
            </span>
          </div>
        )}
        {noShowCount >= 2 && (
          <div className="flex items-center gap-2 bg-red-50 border border-red-200 rounded-lg p-2.5">
            <AlertCircle className="h-4 w-4 text-red-500 shrink-0" />
            <span className="text-xs text-red-700 font-medium">
              {noShowCount} kez gelmedi (no-show)
            </span>
          </div>
        )}

        {/* ── Contact + Quick Actions ───────────────────────────────────── */}
        <section className="space-y-2">
          <h3 className="text-xs font-medium text-muted-foreground uppercase tracking-wider">İletişim</h3>
          <div className="space-y-1.5">
            {c.phone && (
              <div className="flex items-center gap-2 text-sm group">
                <Phone className="h-4 w-4 text-muted-foreground" />
                <span className="flex-1">{c.phone}</span>
                <button onClick={() => copyToClipboard(c.phone!, 'Telefon')} className="opacity-0 group-hover:opacity-100 transition-opacity">
                  <Copy className="h-3 w-3 text-muted-foreground hover:text-foreground" />
                </button>
              </div>
            )}
            {c.email && (
              <div className="flex items-center gap-2 text-sm group">
                <Mail className="h-4 w-4 text-muted-foreground" />
                <span className="flex-1 truncate">{c.email}</span>
                <button onClick={() => copyToClipboard(c.email!, 'E-posta')} className="opacity-0 group-hover:opacity-100 transition-opacity">
                  <Copy className="h-3 w-3 text-muted-foreground hover:text-foreground" />
                </button>
              </div>
            )}
            {!c.phone && !c.email && <p className="text-sm text-muted-foreground italic">İletişim bilgisi yok</p>}
          </div>
        </section>

        {/* ── Stats (5-grid) ───────────────────────────────────────────── */}
        <div className="grid grid-cols-5 gap-1.5">
          <div className="bg-muted/50 rounded-lg p-2 text-center">
            <p className="text-base font-bold">{visitCount}</p>
            <p className="text-[8px] text-muted-foreground mt-0.5">Ziyaret</p>
          </div>
          <div className="bg-muted/50 rounded-lg p-2 text-center">
            <p className="text-base font-bold">{serviceTotal > 0 ? serviceTotal.toLocaleString('tr-TR') : '0'}</p>
            <p className="text-[8px] text-muted-foreground mt-0.5">₺ Hizmet</p>
          </div>
          <div className="bg-muted/50 rounded-lg p-2 text-center">
            <p className="text-base font-bold">{avgTicket > 0 ? avgTicket.toLocaleString('tr-TR') : '—'}</p>
            <p className="text-[8px] text-muted-foreground mt-0.5">₺ Ort.</p>
          </div>
          <div className="bg-muted/50 rounded-lg p-2 text-center">
            <p className="text-base font-bold">{c.loyaltyPoints}</p>
            <p className="text-[8px] text-muted-foreground mt-0.5">Puan</p>
          </div>
          <div className="bg-muted/50 rounded-lg p-2 text-center flex flex-col items-center justify-center">
            <div className="flex items-center gap-0.5">
              <Star className="h-3 w-3 text-amber-500" />
              <p className="text-[9px] font-medium">{tierLabel[c.loyaltyTier] ?? c.loyaltyTier}</p>
            </div>
            <p className="text-[8px] text-muted-foreground mt-0.5">Seviye</p>
          </div>
        </div>

        {/* ── Insight Strip ────────────────────────────────────────────── */}
        <div className="text-xs text-muted-foreground space-y-1 bg-muted/30 rounded-lg p-2.5">
          {daysSinceLastVisit !== null && (
            <div className="flex items-center gap-1.5">
              <Clock className="h-3 w-3" />
              <span>Son ziyaret: {daysSinceLastVisit === 0 ? 'Bugün' : `${daysSinceLastVisit} gün önce`}</span>
            </div>
          )}
          {typicalCycleDays !== null && (
            <div className="flex items-center gap-1.5">
              <TrendingUp className="h-3 w-3" />
              <span>Döngü: {cycleLabel}
                {cycleUrgency === 'critical' ? ' 🔴 acil' :
                 cycleUrgency === 'overdue' ? ' ⚠ gecikmiş' :
                 cycleUrgency === 'slightlyOverdue' ? ' ⚡ geçiyor' :
                 cycleUrgency === 'dueSoon' ? ' ⏳ yakında' : ''}
                {cycleConfidence === 'low' ? ' (sınırlı veri)' : ''}
              </span>
            </div>
          )}
          {topService && (
            <div className="flex items-center gap-1.5">
              <TrendingUp className="h-3 w-3" />
              <span>En çok: {topService.name} ({topService.count}×)</span>
            </div>
          )}
          {topStaff && (
            <div className="flex items-center gap-1.5">
              <Users className="h-3 w-3" />
              <span>Tercih: {topStaff.name} ({topStaff.count}×)</span>
            </div>
          )}
          {cancelCount > 0 && (
            <div className="flex items-center gap-1.5">
              <AlertCircle className="h-3 w-3" />
              <span>{cancelCount} iptal ({Math.round(cancelRate * 100)}%)</span>
            </div>
          )}
          {noShowCount > 0 && noShowCount < 2 && (
            <div className="flex items-center gap-1.5">
              <AlertTriangle className="h-3 w-3" />
              <span>{noShowCount} no-show ({Math.round(noShowRate * 100)}%)</span>
            </div>
          )}
        </div>

        {/* ── Notes ────────────────────────────────────────────────────── */}
        {c.notes && (
          <section className="space-y-1.5">
            <h3 className="text-xs font-medium text-muted-foreground uppercase tracking-wider flex items-center gap-1">
              <FileText className="h-3 w-3" /> Not
            </h3>
            <p className="text-sm bg-amber-50/50 border border-amber-100 rounded-lg p-2.5 text-gray-700">
              {c.notes}
            </p>
          </section>
        )}

        {/* ── Next Best Action ──────────────────────────────────────────── */}
        {nextAction && (
          <Link href={nextAction.href}>
            <div className="bg-primary/5 border border-primary/10 rounded-lg px-3 py-2.5 hover:bg-primary/10 transition-colors cursor-pointer">
              <div className="flex items-center gap-2">
                <nextAction.icon className="h-4 w-4 text-primary shrink-0" />
                <span className="text-xs font-medium text-primary flex-1">{nextAction.label}</span>
                <ChevronRight className="h-3.5 w-3.5 text-primary/50" />
              </div>
              <p className="text-[10px] text-muted-foreground mt-1 ml-6">{nextAction.reason}</p>
            </div>
          </Link>
        )}

        {/* ── Quick Actions ────────────────────────────────────────────── */}
        <section className="space-y-2">
          <h3 className="text-xs font-medium text-muted-foreground uppercase tracking-wider">Hızlı İşlem</h3>
          <div className="flex gap-2">
            <Link href="/calendar" className="flex-1">
              <Button size="sm" variant="outline" className="w-full text-xs">
                <CalendarPlus className="mr-1 h-3 w-3" /> Randevu Oluştur
              </Button>
            </Link>
            {upcoming.length > 0 && (
              <Link href={`/calendar?date=${upcoming[0].startTime.split('T')[0]}`} className="flex-1">
                <Button size="sm" variant="outline" className="w-full text-xs">
                  <Calendar className="mr-1 h-3 w-3" /> Yaklaşan Randevu
                </Button>
              </Link>
            )}
          </div>
        </section>

        {/* ── Upcoming ─────────────────────────────────────────────────── */}
        <section className="space-y-2">
          <h3 className="text-xs font-medium text-muted-foreground uppercase tracking-wider">Yaklaşan ({upcoming.length})</h3>
          {upcoming.length === 0
            ? <p className="text-sm text-muted-foreground italic">Yaklaşan randevu yok</p>
            : upcoming.slice(0, 5).map((a) => <ApptRow key={a.id} a={a} />)
          }
        </section>

        {/* ── Past ─────────────────────────────────────────────────────── */}
        <section className="space-y-2">
          <h3 className="text-xs font-medium text-muted-foreground uppercase tracking-wider">Geçmiş ({past.length})</h3>
          {past.length === 0
            ? <p className="text-sm text-muted-foreground italic">Geçmiş randevu yok</p>
            : past.slice(0, 10).map((a) => <ApptRow key={a.id} a={a} />)
          }
        </section>

        {/* ── Meta ─────────────────────────────────────────────────────── */}
        <section className="pt-2 border-t text-xs text-muted-foreground space-y-1">
          {c.referralCode && <p>Referans kodu: {c.referralCode}</p>}
          {c.consentGiven && <p>KVKK onayı: ✅ {c.consentDate ? fmtDate(c.consentDate ?? '') : ''}</p>}
        </section>
      </div>
    </>
  );
}

function ApptRow({ a }: { a: Appointment }) {
  const apptDate = a.startTime.split('T')[0];
  // Hizmet tutarı — totalPrice > 0 ise göster. Bu "ödendi" değil, "tutar kaydedilmiş" demektir.
  const hasAmount = a.status === 'COMPLETED' && a.totalPrice && Number(a.totalPrice) > 0;
  return (
    <Link href={`/calendar?date=${apptDate}`} className="block">
      <div className="flex items-center gap-2.5 bg-white border rounded-lg px-3 py-2 hover:bg-muted/30 transition-colors cursor-pointer group">
        <Clock className="h-3.5 w-3.5 text-muted-foreground flex-shrink-0" />
        <div className="flex-1 min-w-0">
          <p className="text-xs font-medium truncate">{a.service?.name ?? 'Hizmet'} — {a.staff?.firstName ?? ''}</p>
          <p className="text-[10px] text-muted-foreground">{fmtDateTime(a.startTime)}</p>
        </div>
        {hasAmount && (
          <span className="text-[9px] px-1 py-0.5 rounded bg-gray-100 text-gray-600 font-medium flex items-center gap-0.5">
            {Number(a.totalPrice).toLocaleString('tr-TR')}₺
          </span>
        )}
        <span className={`text-[9px] px-1.5 py-0.5 rounded-full font-medium ${statusColor[a.status] ?? 'bg-gray-100 text-gray-800'}`}>
          {statusLabel[a.status] ?? a.status}
        </span>
        <ExternalLink className="h-3 w-3 text-muted-foreground/30 group-hover:text-muted-foreground transition-colors" />
      </div>
    </Link>
  );
}
