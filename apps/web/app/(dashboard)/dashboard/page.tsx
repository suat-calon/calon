'use client';

import { useMemo } from 'react';
import Link from 'next/link';
import { format, isToday, parseISO, isBefore, isAfter } from 'date-fns';
import { tr } from 'date-fns/locale';
import {
  CalendarDays, Clock, CheckCircle2, AlertCircle,
  XCircle, ArrowRight, Plus, Users, Scissors,
  AlertTriangle,
} from 'lucide-react';

import {
  Card, CardContent, CardHeader, CardTitle,
} from '@/components/ui/card';
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

  // Upcoming: next 5 appointments from now (today + future, not cancelled/completed)
  const upcoming = useMemo(() => {
    if (!appointments) return [];
    return appointments
      .filter((a) => {
        try {
          const start = parseISO(a.startTime);
          return isAfter(start, now) && !['CANCELLED', 'NO_SHOW', 'COMPLETED'].includes(a.status);
        } catch { return false; }
      })
      .sort((a, b) => a.startTime.localeCompare(b.startTime))
      .slice(0, 5);
  }, [appointments, now]);

  return (
    <div className="space-y-6 max-w-5xl">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">
            {tenant?.name ?? 'Özet'}
          </h1>
          <p className="text-muted-foreground text-sm mt-1">
            {format(now, 'd MMMM yyyy, EEEE', { locale: tr })}
          </p>
        </div>
        <Button asChild>
          <Link href="/calendar">
            <CalendarDays className="mr-2 h-4 w-4" />
            Takvime Git
          </Link>
        </Button>
      </div>

      {/* Pending alert */}
      {stats.pending > 0 && (
        <div className="flex items-center gap-3 bg-amber-50 border border-amber-200 rounded-lg p-3">
          <AlertTriangle className="h-5 w-5 text-amber-600 shrink-0" />
          <div className="flex-1">
            <span className="text-sm font-medium text-amber-900">
              {stats.pending} randevu onay bekliyor
            </span>
            <span className="text-xs text-amber-700 ml-2">
              Takvimden onaylayabilirsiniz.
            </span>
          </div>
          <Button variant="outline" size="sm" asChild className="shrink-0">
            <Link href="/calendar">Takvime Git</Link>
          </Button>
        </div>
      )}

      {/* Stat cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <StatCard icon={CalendarDays} label="Bugün Toplam" value={stats.total} loading={isLoading} />
        <StatCard icon={Clock} label="Bekleyen" value={stats.pending} loading={isLoading} highlight={stats.pending > 0} />
        <StatCard icon={CheckCircle2} label="Tamamlanan" value={stats.completed} loading={isLoading} />
        <StatCard icon={XCircle} label="İptal / Gelmedi" value={stats.cancelled} loading={isLoading} />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Upcoming appointments */}
        <Card>
          <CardHeader className="pb-3">
            <div className="flex items-center justify-between">
              <CardTitle className="text-base">Yaklaşan Randevular</CardTitle>
              <Button variant="ghost" size="sm" asChild className="text-xs">
                <Link href="/calendar">
                  Tümü <ArrowRight className="ml-1 h-3 w-3" />
                </Link>
              </Button>
            </div>
          </CardHeader>
          <CardContent>
            {error ? (
              <div className="flex items-center gap-2 text-destructive text-sm py-4">
                <AlertCircle className="h-4 w-4" />
                Yüklenemedi.
              </div>
            ) : isLoading ? (
              <div className="flex justify-center py-6">
                <div className="h-5 w-5 animate-spin rounded-full border-4 border-primary border-t-transparent" />
              </div>
            ) : upcoming.length === 0 ? (
              <p className="text-muted-foreground text-sm py-4 text-center">
                Yaklaşan randevu bulunmuyor.
              </p>
            ) : (
              <div className="space-y-2">
                {upcoming.map((apt) => (
                  <AppointmentRow key={apt.id} appointment={apt} />
                ))}
              </div>
            )}
          </CardContent>
        </Card>

        {/* Quick actions */}
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base">Hızlı İşlemler</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-2 gap-3">
              <QuickAction href="/calendar" icon={CalendarDays} label="Takvim" description="Haftalık takvimi aç" />
              <QuickAction href="/customers" icon={Users} label="Müşteriler" description="Müşteri listesi" />
              <QuickAction href="/services" icon={Scissors} label="Hizmetler" description="Hizmet yönetimi" />
              <QuickAction href="/catalog" icon={Plus} label="Katalog" description="Hizmet & ürün ekle" />
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Today's appointments compact */}
      {todayAppts.length > 0 && (
        <Card>
          <CardHeader className="pb-3">
            <div className="flex items-center justify-between">
              <CardTitle className="text-base">Bugünkü Randevular</CardTitle>
              <span className="text-xs text-muted-foreground">{todayAppts.length} randevu</span>
            </div>
          </CardHeader>
          <CardContent>
            <div className="space-y-2">
              {todayAppts.slice(0, 6).map((apt) => (
                <AppointmentRow key={apt.id} appointment={apt} />
              ))}
              {todayAppts.length > 6 && (
                <Button variant="ghost" size="sm" asChild className="w-full text-xs">
                  <Link href="/calendar">
                    +{todayAppts.length - 6} randevu daha — Takvimde gör
                  </Link>
                </Button>
              )}
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}

/* ── StatCard ──────────────────────────────────────────────────────────────── */

function StatCard({
  icon: Icon, label, value, loading, highlight,
}: {
  icon: React.ComponentType<{ className?: string }>;
  label: string; value: string | number; loading?: boolean; highlight?: boolean;
}) {
  return (
    <Card>
      <CardContent className="pt-5 pb-4 px-5">
        <div className="flex items-center gap-3">
          <div className={`p-2 rounded-lg ${highlight ? 'bg-amber-100' : 'bg-primary/10'}`}>
            <Icon className={`h-4 w-4 ${highlight ? 'text-amber-600' : 'text-primary'}`} />
          </div>
          <div className="min-w-0">
            <p className="text-xs text-muted-foreground truncate">{label}</p>
            {loading ? (
              <div className="h-5 w-12 bg-muted animate-pulse rounded mt-1" />
            ) : (
              <p className="text-lg font-semibold">{value}</p>
            )}
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

/* ── AppointmentRow ────────────────────────────────────────────────────────── */

function AppointmentRow({ appointment: apt }: { appointment: Appointment }) {
  const start = format(parseISO(apt.startTime), 'HH:mm');
  const end   = format(parseISO(apt.endTime), 'HH:mm');
  const day   = isToday(parseISO(apt.startTime))
    ? 'Bugün'
    : format(parseISO(apt.startTime), 'd MMM', { locale: tr });
  const customerName = apt.customer
    ? `${apt.customer.firstName} ${apt.customer.lastName}`
    : '';
  const serviceName = apt.service?.name ?? '';

  return (
    <div className="flex items-center gap-3 p-2.5 rounded-lg border hover:border-primary/30 transition-colors">
      <div className="text-center min-w-[52px]">
        <span className="text-xs text-muted-foreground block">{day}</span>
        <span className="text-sm font-semibold">{start}</span>
      </div>
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 flex-wrap">
          <span className="text-sm font-medium truncate">{serviceName}</span>
          <Badge variant={STATUS_VARIANT[apt.status]} className="text-[10px]">
            {STATUS_LABEL[apt.status]}
          </Badge>
        </div>
        {customerName && (
          <p className="text-xs text-muted-foreground mt-0.5 truncate">{customerName}</p>
        )}
      </div>
      {apt.totalPrice && (
        <span className="text-sm font-semibold shrink-0">
          {Number(apt.totalPrice).toLocaleString('tr-TR')} ₺
        </span>
      )}
    </div>
  );
}

/* ── QuickAction ───────────────────────────────────────────────────────────── */

function QuickAction({
  href, icon: Icon, label, description,
}: {
  href: string; icon: React.ComponentType<{ className?: string }>; label: string; description: string;
}) {
  return (
    <Link
      href={href}
      className="flex items-center gap-3 p-3 rounded-lg border hover:border-primary/30 hover:bg-primary/5 transition-colors"
    >
      <div className="p-2 rounded-lg bg-primary/10">
        <Icon className="h-4 w-4 text-primary" />
      </div>
      <div className="min-w-0">
        <p className="text-sm font-medium">{label}</p>
        <p className="text-xs text-muted-foreground">{description}</p>
      </div>
    </Link>
  );
}
