'use client';

import { useMemo }  from 'react';
import { format, isToday, parseISO } from 'date-fns';
import { tr }       from 'date-fns/locale';
import {
  CalendarDays,
  Clock,
  CheckCircle2,
  AlertCircle,
  TrendingUp,
} from 'lucide-react';

import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import { Badge }    from '@/components/ui/badge';
import { useTenant } from '@/hooks/api/use-auth';
import {
  useAppointments,
  type Appointment,
  type AppointmentStatus,
} from '@/hooks/api/use-appointments';

const STATUS_LABEL: Record<AppointmentStatus, string> = {
  PENDING:    'Bekliyor',
  CONFIRMED:  'Onaylandı',
  CHECKED_IN: 'Geldi',
  IN_SERVICE: 'Hizmette',
  COMPLETED:  'Tamamlandı',
  CANCELLED:  'İptal',
  NO_SHOW:    'Gelmedi',
};

const STATUS_VARIANT: Record<AppointmentStatus, 'default' | 'success' | 'info' | 'warning' | 'destructive' | 'secondary'> = {
  PENDING:    'warning',
  CONFIRMED:  'info',
  CHECKED_IN: 'info',
  IN_SERVICE: 'default',
  COMPLETED:  'success',
  CANCELLED:  'destructive',
  NO_SHOW:    'secondary',
};

export default function DashboardPage() {
  const { data: tenant }       = useTenant();
  const { data: appointments, isLoading, error } = useAppointments();

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
    const revenue   = todayAppts
      .filter((a) => a.status !== 'CANCELLED' && a.status !== 'NO_SHOW')
      .reduce((sum, a) => sum + (a.totalPrice ? Number(a.totalPrice) : 0), 0);
    return { total: todayAppts.length, pending, confirmed, completed, cancelled, revenue };
  }, [todayAppts]);

  return (
    <div className="space-y-6 max-w-6xl">
      {/* Greeting */}
      <div>
        <h1 className="text-2xl font-bold tracking-tight">
          {tenant?.name ?? 'Dashboard'}
        </h1>
        <p className="text-muted-foreground text-sm mt-1">
          {format(new Date(), 'd MMMM yyyy, EEEE', { locale: tr })}
        </p>
      </div>

      {/* Stat cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <StatCard
          icon={CalendarDays}
          label="Bugünkü Randevu"
          value={stats.total}
          loading={isLoading}
        />
        <StatCard
          icon={Clock}
          label="Bekleyen"
          value={stats.pending}
          loading={isLoading}
          highlight={stats.pending > 0}
        />
        <StatCard
          icon={CheckCircle2}
          label="Tamamlanan"
          value={stats.completed}
          loading={isLoading}
        />
        <StatCard
          icon={TrendingUp}
          label="Bugünkü Gelir"
          value={`${stats.revenue.toLocaleString('tr-TR')} \u20BA`}
          loading={isLoading}
        />
      </div>

      {/* Today's appointments */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base">Bugünkü Randevular</CardTitle>
        </CardHeader>
        <CardContent>
          {error ? (
            <div className="flex items-center gap-2 text-destructive text-sm py-4">
              <AlertCircle className="h-4 w-4" />
              Randevular yüklenemedi. Lütfen sayfayı yenileyin.
            </div>
          ) : isLoading ? (
            <div className="flex justify-center py-8">
              <div className="h-6 w-6 animate-spin rounded-full border-4 border-primary border-t-transparent" />
            </div>
          ) : todayAppts.length === 0 ? (
            <p className="text-muted-foreground text-sm py-4 text-center">
              Bugün için randevu bulunmuyor.
            </p>
          ) : (
            <div className="space-y-2">
              {todayAppts.slice(0, 8).map((apt) => (
                <AppointmentRow key={apt.id} appointment={apt} />
              ))}
              {todayAppts.length > 8 && (
                <p className="text-xs text-muted-foreground text-center pt-2">
                  +{todayAppts.length - 8} randevu daha
                </p>
              )}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

/* ── StatCard ──────────────────────────────────────────────────────────────── */

function StatCard({
  icon: Icon,
  label,
  value,
  loading,
  highlight,
}: {
  icon:       React.ComponentType<{ className?: string }>;
  label:      string;
  value:      string | number;
  loading?:   boolean;
  highlight?: boolean;
}) {
  return (
    <Card>
      <CardContent className="pt-5 pb-4 px-5">
        <div className="flex items-center gap-3">
          <div className={`p-2 rounded-lg ${highlight ? 'bg-warning/10' : 'bg-primary/10'}`}>
            <Icon className={`h-4 w-4 ${highlight ? 'text-orange-600' : 'text-primary'}`} />
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
  const end   = format(parseISO(apt.endTime),   'HH:mm');
  const customerName = apt.customer
    ? `${apt.customer.firstName} ${apt.customer.lastName}`
    : apt.customerId.slice(0, 8) + '...';
  const serviceName = apt.service?.name ?? apt.serviceId.slice(0, 8) + '...';
  const staffName   = apt.staff
    ? `${apt.staff.firstName} ${apt.staff.lastName}`
    : apt.staffId.slice(0, 8) + '...';

  return (
    <div className="flex items-center gap-3 p-3 rounded-lg border hover:border-primary/30 transition-colors">
      <div className="text-center min-w-[48px]">
        <span className="text-sm font-semibold">{start}</span>
        <span className="text-xs text-muted-foreground block">{end}</span>
      </div>
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 flex-wrap">
          <span className="text-sm font-medium truncate">{serviceName}</span>
          <Badge variant={STATUS_VARIANT[apt.status]} className="text-[10px]">
            {STATUS_LABEL[apt.status]}
          </Badge>
        </div>
        <p className="text-xs text-muted-foreground mt-0.5 truncate">
          {customerName} &middot; {staffName}
        </p>
      </div>
      {apt.totalPrice && (
        <span className="text-sm font-semibold shrink-0">
          {Number(apt.totalPrice).toLocaleString('tr-TR')} ₺
        </span>
      )}
    </div>
  );
}
