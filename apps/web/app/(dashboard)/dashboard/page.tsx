'use client';

import { useMemo } from 'react';
import Link from 'next/link';
import { format, isToday, parseISO, isAfter } from 'date-fns';
import { tr } from 'date-fns/locale';
import {
  CalendarDays, Clock, CheckCircle2, AlertCircle,
  XCircle, ArrowRight, Plus, Users, Scissors,
  AlertTriangle,
} from 'lucide-react';

import { Badge }  from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { useTenant } from '@/hooks/api/use-auth';
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

  const now = useMemo(() => new Date(), []);

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
