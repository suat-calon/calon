'use client';

import { useMemo, useState, useCallback } from 'react';
import Link from 'next/link';
import { format, isToday, parseISO, isAfter } from 'date-fns';
import { tr } from 'date-fns/locale';
import {
  CalendarDays, Clock, CheckCircle2, AlertCircle,
  XCircle, ArrowRight, Plus, Users, Scissors,
  AlertTriangle, Link2, Copy, ExternalLink, Check,
  Settings, UserPlus, Sparkles, Circle, ChevronRight,
} from 'lucide-react';

import { Badge }  from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { useTenant } from '@/hooks/api/use-auth';
import { useServices } from '@/hooks/api/use-services';
import { useStaff } from '@/hooks/api/use-staff';
import { useCustomers } from '@/hooks/api/use-customers';
import {
  useAppointments,
  type Appointment,
  type AppointmentStatus,
} from '@/hooks/api/use-appointments';

const STATUS_LABEL: Record<AppointmentStatus, string> = {
  PENDING: 'Bekliyor', CONFIRMED: 'Onaylandı', CHECKED_IN: 'Geldi',
  IN_SERVICE: 'Hizmette', COMPLETED: 'Tamamlandı', CANCELLED: 'İptal', NO_SHOW: 'Gelmedi',
};

const STATUS_VARIANT: Record<AppointmentStatus, 'default' | 'success' | 'info' | 'warning' | 'destructive' | 'secondary'> = {
  PENDING: 'warning', CONFIRMED: 'info', CHECKED_IN: 'info',
  IN_SERVICE: 'default', COMPLETED: 'success', CANCELLED: 'destructive', NO_SHOW: 'secondary',
};

export default function DashboardPage() {
  const { data: tenant } = useTenant();
  const { data: appointments, isLoading, error } = useAppointments();
  const { data: services } = useServices();
  const { data: staffData } = useStaff();
  const { data: customersData } = useCustomers();

  const [copied, setCopied] = useState(false);
  const bookingUrl = tenant?.slug
    ? `${process.env.NEXT_PUBLIC_BOOKING_URL ?? 'https://book.calon.com.tr'}/${tenant.slug}`
    : null;

  // ── Activation state — derived from real domain data ────────────────────
  const activation = useMemo(() => {
    const hasServices    = (services ?? []).length > 0;
    const hasStaff       = (staffData?.data ?? []).length > 0;
    const hasBookingLink = !!tenant?.slug;
    const hasAppointment = (appointments ?? []).length > 0;
    const steps = [
      { id: 'service',  label: 'Hizmet ekle',             done: hasServices,    href: '/services',  icon: Scissors },
      { id: 'staff',    label: 'Personel ekle',            done: hasStaff,       href: '/staff',     icon: UserPlus },
      { id: 'link',     label: 'Booking link\'i kontrol et', done: hasBookingLink, href: '/settings',  icon: Link2 },
      { id: 'first',    label: 'İlk randevuyu oluştur',    done: hasAppointment, href: '/calendar',  icon: CalendarDays },
    ];
    const completedCount = steps.filter((s) => s.done).length;
    const allDone = completedCount === steps.length;
    return { steps, completedCount, allDone };
  }, [services, staffData, tenant, appointments]);

  const now = useMemo(() => new Date(), []);

  // ── Impact Engine v1.1 — decision tree, no additive scoring ─────────────
  //
  // NO sortKey addition. NO tierBase + modifier. NO value-tier matrix.
  //
  // Decision tree:
  //   1. SUPPRESS: hasUpcoming, isNew, none, dueSoon (always — no gate piercing)
  //   2. URGENCY CLASS: critical > overdue > dormant > slight
  //   3. RELATIONSHIP CONTINUITY: strong (3+) / weak (1-2) — NOT value proxy
  //   4. CONFIDENCE CHECK: sufficient (medium/high) / insufficient (low/no cycle)
  //   5. IMPACT CLASS from decision branches (see tree below)
  //   6. SORT: urgency class order → overdueDays desc → visitCount desc (tie-break)
  //
  type ImpactLevel = 'veryHigh' | 'high' | 'monitor';
  interface PriorityCustomer {
    id: string;
    name: string;
    urgencyOrder: number; // sort: urgency class (3=critical, 2=overdue/dormant, 1=slight)
    overdueDays: number;  // sort: depth within class
    visitCount: number;   // sort: tie-break
    level: ImpactLevel;
    reason: string;
    actionLabel: string;
    actionHref: string;
  }

  const priorityCustomers = useMemo<PriorityCustomer[]>(() => {
    const customers = (customersData?.data ?? []).filter((c) => !c.isDeleted);
    if (!customers.length || !appointments) return [];

    const custAppts: Record<string, Appointment[]> = {};
    for (const a of appointments) {
      if (!a.customer) continue;
      if (!custAppts[a.customer.id]) custAppts[a.customer.id] = [];
      custAppts[a.customer.id].push(a);
    }

    const nowMs = now.getTime();
    const DAY = 1000 * 60 * 60 * 24;
    const ranked: PriorityCustomer[] = [];

    for (const c of customers) {
      const appts = custAppts[c.id] ?? [];
      const completed = appts.filter((a) => a.status === 'COMPLETED');
      const visitCount = completed.length;
      const noShowCount = appts.filter((a) => a.status === 'NO_SHOW').length;
      const hasUpcoming = appts.some((a) => new Date(a.startTime).getTime() >= nowMs && a.status !== 'CANCELLED' && a.status !== 'NO_SHOW');

      // ── SUPPRESS ──────────────────────────────────────────────────
      if (hasUpcoming) continue;
      if (visitCount === 0) continue;

      const lastVisitMs = Math.max(...completed.map((a) => new Date(a.startTime).getTime()));
      const daysSince = Math.floor((nowMs - lastVisitMs) / DAY);

      // Top service (for contextual CTA only, not ranking)
      const svcMap: Record<string, { n: string; c: number }> = {};
      for (const a of completed) { const s = a.service?.name; if (s) { if (!svcMap[s]) svcMap[s] = { n: s, c: 0 }; svcMap[s].c++; } }
      const topSvc = Object.values(svcMap).sort((a, b) => b.c - a.c)[0]?.n ?? null;

      // Cycle + confidence (median, variance-aware)
      let cycleDays: number | null = null;
      let confidence: 'low' | 'medium' | 'high' = 'low';
      let overdueDays = 0;
      type UC = 'critical' | 'overdue' | 'slight' | 'dormant';
      let urgency: UC | 'dueSoon' | 'none' = 'none';

      if (visitCount >= 2) {
        const sorted = completed.map((a) => new Date(a.startTime).getTime()).sort((a, b) => a - b);
        const intervals: number[] = [];
        for (let i = 1; i < sorted.length; i++) intervals.push(Math.round((sorted[i] - sorted[i - 1]) / DAY));
        if (intervals.length > 0) {
          const si = [...intervals].sort((a, b) => a - b);
          cycleDays = si[Math.floor(si.length / 2)];
          const spread = si[si.length - 1] - si[0];
          const norm = cycleDays > 0 ? spread / cycleDays : 0;
          if (intervals.length >= 4)      confidence = norm > 1.0 ? 'medium' : 'high';
          else if (intervals.length >= 2) confidence = norm > 1.0 ? 'low' : 'medium';
        }
      }

      // ── URGENCY CLASS ─────────────────────────────────────────────
      if (cycleDays && cycleDays > 0) {
        const ratio = daysSince / cycleDays;
        overdueDays = Math.max(daysSince - cycleDays, 0);
        if      (ratio >= 1.8 && overdueDays >= 14) urgency = 'critical';
        else if (ratio >= 1.3 && overdueDays >= 7)  urgency = 'overdue';
        else if (ratio >= 1.0 && overdueDays >= 3)  urgency = 'slight';
        else if (ratio >= 0.8)                      urgency = 'dueSoon';
        else                                        urgency = 'none';
      } else if (daysSince > 90) {
        urgency = 'dormant';
        overdueDays = daysSince;
      } else if (daysSince > 60) {
        urgency = 'dueSoon';
      }

      // ── SUPPRESS: dueSoon always excluded (no gate piercing) ──────
      if (urgency === 'none' || urgency === 'dueSoon') continue;

      // ── RELATIONSHIP CONTINUITY (not value proxy) ─────────────────
      const relationship: 'strong' | 'weak' = visitCount >= 3 ? 'strong' : 'weak';
      const sufficientConf = confidence === 'medium' || confidence === 'high';

      // ── IMPACT CLASS — decision branches (no additive scoring) ────
      let level: ImpactLevel;
      let urgencyOrder: number; // for sorting: 3=critical, 2=overdue/dormant, 1=slight

      if (urgency === 'critical') {
        urgencyOrder = 3;
        if (relationship === 'strong' && sufficientConf) level = 'veryHigh';
        else if (relationship === 'strong')              level = 'high'; // insufficient conf → lower claim
        else                                             level = 'high'; // weak relationship
      } else if (urgency === 'overdue') {
        urgencyOrder = 2;
        if (relationship === 'strong' && sufficientConf) level = 'high';
        else                                             level = 'monitor'; // weak or low conf
      } else if (urgency === 'dormant') {
        urgencyOrder = 2;
        if (relationship === 'strong')                   level = 'high';
        else                                             level = 'monitor';
      } else { // slight
        urgencyOrder = 1;
        if (relationship === 'strong' && sufficientConf) level = 'monitor';
        else                                             continue; // not actionable
      }

      // ── REASON — dürüst, modelin bildiği şeylerle sınırlı ────────
      const parts: string[] = [];
      if (urgency === 'critical') {
        parts.push(`tekrar ritminin ciddi dışına çıktı (+${overdueDays} gün)`);
      } else if (urgency === 'overdue') {
        parts.push(`gelme ritmini geçti (+${overdueDays} gün)`);
      } else if (urgency === 'dormant') {
        parts.push(`${daysSince} gündür görünmüyor`);
      } else {
        parts.push(`ritminin kıyısında (${overdueDays} gün)`);
      }
      if (relationship === 'strong') parts.push('düzenli gelme örüntüsü var');
      if (!sufficientConf && cycleDays) parts.push('sinyal var ama güven sınırlı');
      if (noShowCount >= 2) parts.push('no-show geçmişi var');

      // ── ACTION — urgency-driven, not value-driven ─────────────────
      let actionLabel: string;
      if (level === 'veryHigh') {
        actionLabel = topSvc ? `${topSvc} planla` : 'Randevu planla';
      } else if (level === 'high') {
        actionLabel = 'Randevu oluştur';
      } else {
        actionLabel = 'İncele';
      }

      ranked.push({
        id: c.id,
        name: `${c.firstName} ${c.lastName}`,
        urgencyOrder,
        overdueDays,
        visitCount,
        level,
        reason: parts.join(' · '),
        actionLabel,
        actionHref: `/customers?highlight=${c.id}`,
      });
    }

    // Sort: urgency class desc → overdueDays desc → visitCount desc (tie-break only)
    return ranked.sort((a, b) =>
      b.urgencyOrder - a.urgencyOrder ||
      b.overdueDays - a.overdueDays ||
      b.visitCount - a.visitCount
    ).slice(0, 5);
  }, [customersData, appointments, now]);

  const todayAppts = useMemo(() => {
    if (!appointments) return [];
    return appointments
      .filter((a) => { try { return isToday(parseISO(a.startTime)); } catch { return false; } })
      .sort((a, b) => a.startTime.localeCompare(b.startTime));
  }, [appointments]);

  const stats = useMemo(() => {
    const pending   = todayAppts.filter((a) => a.status === 'PENDING').length;
    const confirmed = todayAppts.filter((a) => ['CONFIRMED', 'CHECKED_IN', 'IN_SERVICE'].includes(a.status)).length;
    const completed = todayAppts.filter((a) => a.status === 'COMPLETED').length;
    const cancelled = todayAppts.filter((a) => ['CANCELLED', 'NO_SHOW'].includes(a.status)).length;
    return { total: todayAppts.length, pending, confirmed, completed, cancelled };
  }, [todayAppts]);

  const upcoming = useMemo(() => {
    if (!appointments) return [];
    return appointments
      .filter((a) => {
        try {
          return isAfter(parseISO(a.startTime), now) && !['CANCELLED', 'NO_SHOW', 'COMPLETED'].includes(a.status);
        } catch { return false; }
      })
      .sort((a, b) => a.startTime.localeCompare(b.startTime))
      .slice(0, 5);
  }, [appointments, now]);

  return (
    <div className="space-y-6 max-w-5xl">
      {/* ── Header ────────────────────────────────────────────────────────── */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">
            {tenant?.name ?? 'Özet'}
          </h1>
          <p className="text-muted-foreground text-sm mt-1">
            {format(now, 'd MMMM yyyy, EEEE', { locale: tr })}
          </p>
        </div>
        <Button asChild size="sm" className="shadow-sm">
          <Link href="/calendar">
            <CalendarDays className="mr-2 h-4 w-4" />
            Takvime Git
          </Link>
        </Button>
      </div>

      {/* ── Activation Checklist / Ready Card ────────────────────────────── */}
      {!activation.allDone ? (
        <div className="bg-gradient-to-br from-primary/5 via-primary/3 to-transparent border border-primary/10 rounded-xl p-4 shadow-sm">
          <div className="flex items-center justify-between mb-3">
            <div className="flex items-center gap-2">
              <Sparkles className="h-4 w-4 text-primary" />
              <h2 className="text-sm font-semibold">Salonunuzu hazırlayın</h2>
            </div>
            <span className="text-xs text-muted-foreground">
              {activation.completedCount}/{activation.steps.length} tamamlandı
            </span>
          </div>
          <div className="space-y-1.5">
            {activation.steps.map((step) => (
              <Link
                key={step.id}
                href={step.href}
                className={`flex items-center gap-3 rounded-lg px-3 py-2 transition-colors text-sm ${
                  step.done
                    ? 'bg-emerald-50/50 text-emerald-700'
                    : 'bg-white hover:bg-muted/50 text-foreground shadow-sm border border-border/50'
                }`}
              >
                {step.done ? (
                  <CheckCircle2 className="h-4 w-4 text-emerald-500 shrink-0" />
                ) : (
                  <Circle className="h-4 w-4 text-muted-foreground/40 shrink-0" />
                )}
                <step.icon className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
                <span className={`flex-1 ${step.done ? 'line-through opacity-60' : 'font-medium'}`}>
                  {step.label}
                </span>
                {!step.done && <ArrowRight className="h-3.5 w-3.5 text-muted-foreground/50" />}
              </Link>
            ))}
          </div>
        </div>
      ) : (appointments ?? []).length <= 3 ? (
        /* Ready card — shown briefly after activation, fades when real usage starts */
        <div className="bg-emerald-50/50 border border-emerald-200/50 rounded-xl p-4 shadow-sm">
          <div className="flex items-center gap-2 mb-3">
            <CheckCircle2 className="h-4 w-4 text-emerald-600" />
            <h2 className="text-sm font-semibold text-emerald-900">Salonunuz hazır</h2>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
            {bookingUrl && (
              <button
                onClick={() => { navigator.clipboard.writeText(bookingUrl); setCopied(true); setTimeout(() => setCopied(false), 2000); }}
                className="flex items-center gap-2 bg-white rounded-lg px-3 py-2 text-xs font-medium border hover:bg-muted/50 transition-colors"
              >
                {copied ? <Check className="h-3.5 w-3.5 text-emerald-500" /> : <Copy className="h-3.5 w-3.5 text-muted-foreground" />}
                Booking Link Kopyala
              </button>
            )}
            <Link href="/calendar" className="flex items-center gap-2 bg-white rounded-lg px-3 py-2 text-xs font-medium border hover:bg-muted/50 transition-colors">
              <Plus className="h-3.5 w-3.5 text-muted-foreground" />
              Randevu Oluştur
            </Link>
            <Link href="/customers" className="flex items-center gap-2 bg-white rounded-lg px-3 py-2 text-xs font-medium border hover:bg-muted/50 transition-colors">
              <Users className="h-3.5 w-3.5 text-muted-foreground" />
              Müşterileri Gör
            </Link>
          </div>
        </div>
      ) : null}

      {/* ── Pending Alert ─────────────────────────────────────────────────── */}
      {stats.pending > 0 && (
        <div className="flex items-center gap-3 bg-amber-50/80 border border-amber-200/60 rounded-xl px-4 py-3 shadow-sm">
          <div className="p-1.5 rounded-lg bg-amber-100">
            <AlertTriangle className="h-4 w-4 text-amber-600" />
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-sm font-medium text-amber-900">
              {stats.pending} randevu onay bekliyor
            </p>
            <p className="text-xs text-amber-700/80 mt-0.5">
              Takvimden detaya girip onaylayabilirsiniz.
            </p>
          </div>
          <Button variant="outline" size="sm" asChild className="shrink-0 border-amber-300 text-amber-800 hover:bg-amber-100">
            <Link href="/calendar">Onayla</Link>
          </Button>
        </div>
      )}

      {/* ── Priority Customers ──────────────────────────────────────────── */}
      {priorityCustomers.length > 0 && (
        <div className="bg-white border rounded-xl p-4 shadow-sm">
          <div className="flex items-center justify-between mb-3">
            <h2 className="text-sm font-semibold flex items-center gap-1.5">
              <Users className="h-4 w-4 text-primary" />
              Dikkat Gereken Müşteriler
            </h2>
            <Link href="/customers" className="text-xs text-muted-foreground hover:text-foreground transition-colors">
              Tümü →
            </Link>
          </div>
          <div className="space-y-1.5">
            {priorityCustomers.map((pc) => (
              <div key={pc.id} className="flex items-center gap-2 rounded-lg px-2.5 py-2 hover:bg-muted/50 transition-colors group">
                <Link href={pc.actionHref} className="flex items-center gap-2.5 flex-1 min-w-0">
                  <div className="h-7 w-7 rounded-full bg-primary/10 flex items-center justify-center shrink-0">
                    <span className="text-[10px] font-semibold text-primary">{pc.name.split(' ').map(w => w[0]).join('')}</span>
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-1.5">
                      <span className="text-xs font-medium truncate">{pc.name}</span>
                      <span className={`text-[9px] px-1 py-0 rounded-full border font-medium shrink-0 ${
                        pc.level === 'veryHigh' ? 'bg-red-50 border-red-200 text-red-700' :
                        pc.level === 'high'     ? 'bg-orange-50 border-orange-200 text-orange-700' :
                                                  'bg-blue-50 border-blue-200 text-blue-600'
                      }`}>
                        {pc.level === 'veryHigh' ? 'Çok Kritik' : pc.level === 'high' ? 'Kritik' : 'İzle'}
                      </span>
                    </div>
                    <p className="text-[10px] text-muted-foreground truncate mt-0.5">{pc.reason}</p>
                  </div>
                </Link>
                <Link href="/calendar" className="shrink-0">
                  <Button size="sm" variant="ghost" className="h-6 px-2 text-[10px] text-primary hover:text-primary">
                    {pc.actionLabel}
                  </Button>
                </Link>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* ── Stat Cards ────────────────────────────────────────────────────── */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <StatCard
          icon={CalendarDays}
          label="Bugün Toplam"
          value={stats.total}
          subtitle="randevu"
          loading={isLoading}
          tone="default"
        />
        <StatCard
          icon={Clock}
          label="Bekleyen"
          value={stats.pending}
          subtitle="onay bekliyor"
          loading={isLoading}
          tone={stats.pending > 0 ? 'warning' : 'default'}
        />
        <StatCard
          icon={CheckCircle2}
          label="Tamamlanan"
          value={stats.completed}
          subtitle="gün sonu"
          loading={isLoading}
          tone={stats.completed > 0 ? 'success' : 'default'}
        />
        <StatCard
          icon={XCircle}
          label="İptal / Gelmedi"
          value={stats.cancelled}
          subtitle="kayıp"
          loading={isLoading}
          tone={stats.cancelled > 0 ? 'destructive' : 'default'}
        />
      </div>

      {/* ── Booking Link ───────────────────────────────────────────────────── */}
      {tenant?.slug && <BookingLinkCard slug={tenant.slug} />}

      {/* ── Two-Column: Upcoming + Quick Actions ──────────────────────────── */}
      <div className="grid grid-cols-1 lg:grid-cols-[1fr_280px] gap-5">
        {/* Upcoming */}
        <div className="bg-white rounded-xl border shadow-sm">
          <div className="flex items-center justify-between px-5 pt-5 pb-3">
            <div>
              <h2 className="text-sm font-semibold">Yaklaşan Randevular</h2>
              <p className="text-xs text-muted-foreground mt-0.5">Sıradaki {upcoming.length} randevu</p>
            </div>
            <Button variant="ghost" size="sm" asChild className="text-xs text-muted-foreground hover:text-foreground">
              <Link href="/calendar">
                Takvim <ArrowRight className="ml-1 h-3 w-3" />
              </Link>
            </Button>
          </div>
          <div className="px-5 pb-5">
            {error ? (
              <div className="flex items-center gap-2 text-destructive text-sm py-6">
                <AlertCircle className="h-4 w-4" />
                Yüklenemedi.
              </div>
            ) : isLoading ? (
              <div className="flex justify-center py-8">
                <div className="h-5 w-5 animate-spin rounded-full border-[3px] border-primary border-t-transparent" />
              </div>
            ) : upcoming.length === 0 ? (
              <div className="text-center py-8">
                <CalendarDays className="h-8 w-8 text-muted-foreground/30 mx-auto mb-2" />
                <p className="text-sm text-muted-foreground">Yaklaşan randevu yok</p>
              </div>
            ) : (
              <div className="space-y-1.5">
                {upcoming.map((apt) => (
                  <AppointmentRow key={apt.id} appointment={apt} />
                ))}
              </div>
            )}
          </div>
        </div>

        {/* Quick Actions */}
        <div className="space-y-3">
          <h2 className="text-sm font-semibold px-1">Hızlı İşlemler</h2>
          <QuickAction href="/calendar" icon={CalendarDays} label="Takvim" description="Haftalık takvim" primary />
          <QuickAction href="/customers" icon={Users} label="Müşteriler" description="Müşteri listesi" />
          <QuickAction href="/services" icon={Scissors} label="Hizmetler" description="Hizmet yönetimi" />
          <QuickAction href="/catalog" icon={Plus} label="Katalog" description="Hizmet & ürün ekle" />
          <QuickAction href="/settings" icon={Settings} label="Ayarlar" description="Salon profili" />
        </div>
      </div>

      {/* ── Today's Appointments ──────────────────────────────────────────── */}
      {todayAppts.length > 0 && (
        <div className="bg-white rounded-xl border shadow-sm">
          <div className="flex items-center justify-between px-5 pt-5 pb-3">
            <div>
              <h2 className="text-sm font-semibold">Bugünkü Randevular</h2>
              <p className="text-xs text-muted-foreground mt-0.5">{todayAppts.length} randevu</p>
            </div>
          </div>
          <div className="px-5 pb-5 space-y-1.5">
            {todayAppts.slice(0, 6).map((apt) => (
              <AppointmentRow key={apt.id} appointment={apt} />
            ))}
            {todayAppts.length > 6 && (
              <Button variant="ghost" size="sm" asChild className="w-full text-xs text-muted-foreground mt-2">
                <Link href="/calendar">
                  +{todayAppts.length - 6} randevu daha
                </Link>
              </Button>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

/* ── StatCard ──────────────────────────────────────────────────────────────── */

type StatTone = 'default' | 'warning' | 'success' | 'destructive';

const TONE_STYLES: Record<StatTone, { bg: string; icon: string; ring: string }> = {
  default:     { bg: 'bg-primary/8',    icon: 'text-primary',      ring: '' },
  warning:     { bg: 'bg-amber-100/80', icon: 'text-amber-600',    ring: 'ring-1 ring-amber-200/50' },
  success:     { bg: 'bg-emerald-100/80', icon: 'text-emerald-600', ring: '' },
  destructive: { bg: 'bg-red-100/60',   icon: 'text-red-500',      ring: '' },
};

function StatCard({
  icon: Icon, label, value, subtitle, loading, tone = 'default',
}: {
  icon: React.ComponentType<{ className?: string }>;
  label: string;
  value: string | number;
  subtitle: string;
  loading?: boolean;
  tone?: StatTone;
}) {
  const t = TONE_STYLES[tone];
  return (
    <div className={`bg-white rounded-xl border shadow-sm p-4 transition-shadow hover:shadow-md ${t.ring}`}>
      <div className="flex items-start justify-between">
        <div className={`p-2 rounded-lg ${t.bg}`}>
          <Icon className={`h-4 w-4 ${t.icon}`} />
        </div>
      </div>
      <div className="mt-3">
        {loading ? (
          <div className="h-7 w-14 bg-muted animate-pulse rounded" />
        ) : (
          <p className="text-2xl font-bold tracking-tight">{value}</p>
        )}
        <p className="text-xs text-muted-foreground mt-0.5">{label}</p>
        {!loading && (
          <p className="text-[10px] text-muted-foreground/60 mt-0.5">{subtitle}</p>
        )}
      </div>
    </div>
  );
}

/* ── AppointmentRow ────────────────────────────────────────────────────────── */

function AppointmentRow({ appointment: apt }: { appointment: Appointment }) {
  const start = format(parseISO(apt.startTime), 'HH:mm');
  const day   = isToday(parseISO(apt.startTime))
    ? 'Bugün'
    : format(parseISO(apt.startTime), 'd MMM', { locale: tr });
  const customerName = apt.customer
    ? `${apt.customer.firstName} ${apt.customer.lastName}`
    : '';
  const serviceName = apt.service?.name ?? '';

  return (
    <div className="flex items-center gap-3 px-3 py-2.5 rounded-lg hover:bg-muted/50 transition-colors group">
      {/* Time pill */}
      <div className="flex flex-col items-center min-w-[44px]">
        <span className="text-[10px] text-muted-foreground/70 leading-none">{day}</span>
        <span className="text-sm font-semibold tabular-nums">{start}</span>
      </div>

      {/* Divider dot */}
      <div className="w-1.5 h-1.5 rounded-full bg-border shrink-0" />

      {/* Content */}
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-1.5">
          <span className="text-sm font-medium truncate">{serviceName}</span>
          <Badge variant={STATUS_VARIANT[apt.status]} className="text-[9px] px-1.5 py-0">
            {STATUS_LABEL[apt.status]}
          </Badge>
        </div>
        {customerName && (
          <p className="text-[11px] text-muted-foreground mt-0.5 truncate">{customerName}</p>
        )}
      </div>

      {/* Price */}
      {apt.totalPrice && (
        <span className="text-sm font-semibold tabular-nums text-foreground/80 shrink-0">
          {Number(apt.totalPrice).toLocaleString('tr-TR')} ₺
        </span>
      )}
    </div>
  );
}

/* ── BookingLinkCard ───────────────────────────────────────────────────────── */

function BookingLinkCard({ slug }: { slug: string }) {
  const [copied, setCopied] = useState(false);
  const bookingUrl = `${process.env.NEXT_PUBLIC_BOOKING_URL ?? 'https://book.calon.com.tr'}/${slug}`;

  const handleCopy = useCallback(async () => {
    try {
      await navigator.clipboard.writeText(bookingUrl);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch { /* clipboard API might fail in non-HTTPS */ }
  }, [bookingUrl]);

  return (
    <div className="bg-gradient-to-r from-primary/5 to-primary/10 rounded-xl border border-primary/20 shadow-sm p-4">
      <div className="flex items-start gap-3">
        <div className="p-2 rounded-lg bg-primary/15 shrink-0">
          <Link2 className="h-4 w-4 text-primary" />
        </div>
        <div className="flex-1 min-w-0">
          <p className="text-sm font-semibold">Online Randevu Linki</p>
          <p className="text-xs text-muted-foreground mt-0.5">Bu linki müşterilerinizle paylaşarak online randevu almalarını sağlayın.</p>
          <div className="flex items-center gap-2 mt-2.5">
            <code className="flex-1 text-xs bg-white/80 border rounded-md px-3 py-1.5 truncate font-mono text-foreground/80">
              {bookingUrl}
            </code>
            <Button variant="outline" size="sm" className="shrink-0 h-8 px-2.5 border-primary/30 text-primary hover:bg-primary/10" onClick={handleCopy}>
              {copied ? <Check className="h-3.5 w-3.5" /> : <Copy className="h-3.5 w-3.5" />}
            </Button>
            <Button variant="outline" size="sm" className="shrink-0 h-8 px-2.5" asChild>
              <a href={bookingUrl} target="_blank" rel="noopener noreferrer">
                <ExternalLink className="h-3.5 w-3.5" />
              </a>
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}

/* ── QuickAction ───────────────────────────────────────────────────────────── */

function QuickAction({
  href, icon: Icon, label, description, primary,
}: {
  href: string;
  icon: React.ComponentType<{ className?: string }>;
  label: string;
  description: string;
  primary?: boolean;
}) {
  return (
    <Link
      href={href}
      className={`flex items-center gap-3 px-4 py-3 rounded-xl border transition-all group ${
        primary
          ? 'bg-primary/5 border-primary/20 hover:bg-primary/10 hover:border-primary/30 shadow-sm'
          : 'bg-white hover:bg-muted/50 hover:border-muted-foreground/20 shadow-sm'
      }`}
    >
      <div className={`p-2 rounded-lg ${primary ? 'bg-primary/15' : 'bg-muted'}`}>
        <Icon className={`h-4 w-4 ${primary ? 'text-primary' : 'text-muted-foreground group-hover:text-foreground'} transition-colors`} />
      </div>
      <div className="min-w-0">
        <p className={`text-sm font-medium ${primary ? 'text-primary' : ''}`}>{label}</p>
        <p className="text-[11px] text-muted-foreground">{description}</p>
      </div>
      <ArrowRight className={`h-3.5 w-3.5 ml-auto opacity-0 group-hover:opacity-60 transition-opacity shrink-0 ${primary ? 'text-primary' : 'text-muted-foreground'}`} />
    </Link>
  );
}
