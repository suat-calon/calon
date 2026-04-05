'use client';

import { useState, useMemo } from 'react';
import { useRouter }   from 'next/navigation';
import Link            from 'next/link';
import { useForm }     from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z }           from 'zod';
import {
  format, parseISO, startOfWeek, addDays, isSameDay,
  getHours, getMinutes, differenceInMinutes,
} from 'date-fns';
import { tr } from 'date-fns/locale';
import {
  CalendarIcon, Plus, Loader2, Clock, User, Scissors, MapPin,
  ChevronLeft, ChevronRight, AlertCircle,
} from 'lucide-react';

import { Button }  from '@/components/ui/button';
import { Input }   from '@/components/ui/input';
import { Badge }   from '@/components/ui/badge';
import { Calendar } from '@/components/ui/calendar';
import {
  Popover, PopoverContent, PopoverTrigger,
} from '@/components/ui/popover';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription,
} from '@/components/ui/dialog';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select';
import {
  Form, FormControl, FormField, FormItem, FormLabel, FormMessage,
} from '@/components/ui/form';
import { toast } from '@/hooks/use-toast';

import {
  useAppointments,
  useCreateAppointment,
  useUpdateAppointmentStatus,
  useRescheduleAppointment,
  useCheckoutAppointment,
  useLedger,
  NEXT_ACTIONS,
  type Appointment,
  type AppointmentStatus,
  type AppointmentSource,
  type AppointmentFilters,
  type CheckoutPaymentMethod,
} from '@/hooks/api/use-appointments';
import {
  Sheet, SheetContent, SheetHeader, SheetTitle, SheetDescription,
} from '@/components/ui/sheet';
import { Separator } from '@/components/ui/separator';
import { useServices } from '@/hooks/api/use-services';
import { useCustomers } from '@/hooks/api/use-customers';
import { useStaff } from '@/hooks/api/use-staff';
import { useTenant } from '@/hooks/api/use-auth';
import { cn } from '@/lib/utils';

// ── Constants ──────────────────────────────────────────────────────────────────

const HOUR_START = 8;
const HOUR_END   = 20;
const HOUR_HEIGHT = 60; // px per hour

const STATUS_LABEL: Record<AppointmentStatus, string> = {
  PENDING: 'Bekliyor', CONFIRMED: 'Onaylandı', CHECKED_IN: 'Geldi',
  IN_SERVICE: 'Hizmette', COMPLETED: 'Tamamlandı', CANCELLED: 'İptal', NO_SHOW: 'Gelmedi',
};

const STATUS_VARIANT: Record<AppointmentStatus, 'default' | 'success' | 'info' | 'warning' | 'destructive' | 'secondary'> = {
  PENDING: 'warning', CONFIRMED: 'info', CHECKED_IN: 'info',
  IN_SERVICE: 'default', COMPLETED: 'success', CANCELLED: 'destructive', NO_SHOW: 'secondary',
};

const STATUS_BG: Record<AppointmentStatus, string> = {
  PENDING:    'bg-amber-50 dark:bg-amber-950/40 border-amber-200 dark:border-amber-800/50 hover:bg-amber-100 dark:hover:bg-amber-900/40',
  CONFIRMED:  'bg-blue-50 dark:bg-blue-950/40 border-blue-200 dark:border-blue-800/50 hover:bg-blue-100 dark:hover:bg-blue-900/40',
  CHECKED_IN: 'bg-indigo-50 dark:bg-indigo-950/40 border-indigo-200 dark:border-indigo-800/50 hover:bg-indigo-100 dark:hover:bg-indigo-900/40',
  IN_SERVICE: 'bg-purple-50 dark:bg-purple-950/40 border-purple-200 dark:border-purple-800/50 hover:bg-purple-100 dark:hover:bg-purple-900/40',
  COMPLETED:  'bg-emerald-50 dark:bg-emerald-950/40 border-emerald-200 dark:border-emerald-800/50 hover:bg-emerald-100 dark:hover:bg-emerald-900/40',
  CANCELLED:  'bg-red-50 dark:bg-red-950/40 border-red-200 dark:border-red-800/50 hover:bg-red-100 dark:hover:bg-red-900/40',
  NO_SHOW:    'bg-gray-50 dark:bg-gray-800/40 border-gray-200 dark:border-gray-700/50 hover:bg-gray-100 dark:hover:bg-gray-700/40',
};

const ACTION_LABEL: Record<AppointmentStatus, string> = {
  PENDING: 'Beklet', CONFIRMED: 'Onayla', CHECKED_IN: 'Geldi',
  IN_SERVICE: 'Hizmete Al', COMPLETED: 'Tamamla', CANCELLED: 'İptal Et', NO_SHOW: 'Gelmedi',
};

const ACTION_VARIANT: Record<AppointmentStatus, 'default' | 'destructive' | 'outline' | 'secondary'> = {
  PENDING: 'outline', CONFIRMED: 'default', CHECKED_IN: 'default',
  IN_SERVICE: 'default', COMPLETED: 'default', CANCELLED: 'destructive', NO_SHOW: 'secondary',
};

// ── Form Schema ────────────────────────────────────────────────────────────────

const appointmentSchema = z.object({
  customerId:  z.string().min(1, 'Müşteri seçin'),
  staffId:     z.string().min(1, 'Personel seçin'),
  serviceId:   z.string().min(1, 'Hizmet seçin'),
  locationId:  z.string().min(1, 'Lokasyon gerekli'),
  date:        z.string().min(1, 'Tarih seçin'),
  startTime:   z.string().regex(/^\d{2}:\d{2}$/, 'SS:DD formatında girin'),
  endTime:     z.string().regex(/^\d{2}:\d{2}$/, 'SS:DD formatında girin'),
  source:      z.string().optional(),
  notes:       z.string().max(1000).optional(),
  totalPrice:  z.coerce.number().min(0).optional(),
  depositPaid: z.coerce.number().min(0).optional(),
});

type AppointmentForm = z.infer<typeof appointmentSchema>;

// ── Main Component ─────────────────────────────────────────────────────────────

export default function CalendarPage() {
  const router = useRouter();
  const [weekStart, setWeekStart] = useState(() => startOfWeek(new Date(), { weekStartsOn: 1 }));
  const [viewMode, setViewMode] = useState<'week' | 'day'>('week');
  const [selectedDay, setSelectedDay] = useState(() => new Date());
  const [dialogOpen, setDialogOpen]     = useState(false);
  const [calPopoverOpen, setCalPopoverOpen] = useState(false);
  const [detailApt, setDetailApt]       = useState<Appointment | null>(null);
  const [staffFilter, setStaffFilter]   = useState<string>('all');
  const [statusFilter, setStatusFilter] = useState<string>('all');
  const [rescheduleOpen, setRescheduleOpen] = useState(false);
  const [rescheduleDate, setRescheduleDate] = useState('');
  const [rescheduleStart, setRescheduleStart] = useState('09:00');
  const [rescheduleEnd, setRescheduleEnd]     = useState('10:00');
  const [rescheduleReason, setRescheduleReason] = useState('');

  // Server-side filtering — haftalık pencere + opsiyonel staff/status
  const filters = useMemo<AppointmentFilters>(() => {
    const f: AppointmentFilters = {
      startDate: format(weekStart, "yyyy-MM-dd'T'00:00:00.000'Z'"),
      endDate:   format(addDays(weekStart, 6), "yyyy-MM-dd'T'23:59:59.999'Z'"),
    };
    if (staffFilter !== 'all')  f.staffId = staffFilter;
    if (statusFilter !== 'all') f.status  = statusFilter as AppointmentStatus;
    return f;
  }, [weekStart, staffFilter, statusFilter]);

  const { data: appointments, isLoading, error } = useAppointments(filters);
  const { data: services }                       = useServices();
  const { data: customersData }                  = useCustomers();
  const { data: staffData }                      = useStaff();
  const { data: tenant }                         = useTenant();
  const createAppointment                        = useCreateAppointment();
  const updateStatus                             = useUpdateAppointmentStatus();
  const rescheduleAppointment                    = useRescheduleAppointment();
  const checkoutAppointment                      = useCheckoutAppointment();
  const { data: ledgerData }                     = useLedger(detailApt?.id ?? null);

  // Checkout form state
  const [checkoutOpen, setCheckoutOpen]         = useState(false);
  const [checkoutMethod, setCheckoutMethod]     = useState<CheckoutPaymentMethod>('PAYMENT_CASH');
  const [checkoutRef, setCheckoutRef]           = useState('');
  // Revenue engine: extra checkout items (upsell / product / manual)
  const [extraItems, setExtraItems] = useState<{ name: string; price: number }[]>([]);
  const [newItemName, setNewItemName] = useState('');
  const [newItemPrice, setNewItemPrice] = useState('');

  const customers = customersData?.data ?? [];
  const staffList = staffData?.data ?? [];

  const weekDays = useMemo(() =>
    Array.from({ length: 7 }, (_, i) => addDays(weekStart, i)),
  [weekStart]);

  const hours = useMemo(() =>
    Array.from({ length: HOUR_END - HOUR_START }, (_, i) => HOUR_START + i),
  []);

  // Group appointments by day — filtering is now server-side
  const appointmentsByDay = useMemo(() => {
    const map = new Map<string, Appointment[]>();
    for (const day of weekDays) {
      const key = format(day, 'yyyy-MM-dd');
      map.set(key, []);
    }
    for (const apt of appointments ?? []) {
      try {
        const d = parseISO(apt.startTime);
        const key = format(d, 'yyyy-MM-dd');
        if (map.has(key)) {
          map.get(key)!.push(apt);
        }
      } catch { /* skip invalid */ }
    }
    return map;
  }, [appointments, weekDays]);

  function prevPeriod() {
    if (viewMode === 'week') setWeekStart(addDays(weekStart, -7));
    else setSelectedDay(addDays(selectedDay, -1));
  }
  function nextPeriod() {
    if (viewMode === 'week') setWeekStart(addDays(weekStart, 7));
    else setSelectedDay(addDays(selectedDay, 1));
  }
  function goToday() {
    setWeekStart(startOfWeek(new Date(), { weekStartsOn: 1 }));
    setSelectedDay(new Date());
  }

  // ── Create form ──────────────────────────────────────────────────────────────
  const form = useForm<AppointmentForm>({
    resolver: zodResolver(appointmentSchema),
    defaultValues: {
      customerId: '', staffId: '', serviceId: '', locationId: '',
      date: format(new Date(), 'yyyy-MM-dd'), startTime: '09:00', endTime: '10:00',
      source: 'RECEPTIONIST', notes: '', totalPrice: 0, depositPaid: 0,
    },
  });

  async function onSubmit(values: AppointmentForm) {
    try {
      const startDT = new Date(`${values.date}T${values.startTime}:00`);
      const endDT   = new Date(`${values.date}T${values.endTime}:00`);
      if (endDT <= startDT) {
        toast({ variant: 'destructive', title: 'Geçersiz saat', description: 'Bitiş saati başlangıçtan sonra olmalı.' });
        return;
      }
      await createAppointment.mutateAsync({
        customerId: values.customerId, staffId: values.staffId,
        serviceId: values.serviceId, locationId: values.locationId,
        startTime: startDT.toISOString(), endTime: endDT.toISOString(),
        source: (values.source as AppointmentSource) || 'RECEPTIONIST',
        notes: values.notes || undefined,
        totalPrice: values.totalPrice || undefined,
        depositPaid: values.depositPaid || undefined,
      });
      toast({ title: 'Randevu oluşturuldu', description: `${values.date} ${values.startTime} için randevu kaydedildi.` });
      form.reset();
      setDialogOpen(false);
    } catch {
      toast({ variant: 'destructive', title: 'Hata', description: 'Randevu oluşturulamadı.' });
    }
  }

  return (
    <div className="flex flex-col h-[calc(100vh-4rem)] overflow-hidden">
      {/* ── Toolbar — Untitled-inspired grouped sections ──────────────────── */}
      <div className="border-b border-border bg-card shrink-0">
        {/* Primary row: title + navigation + date */}
        <div className="flex items-center justify-between px-4 pt-3 pb-2">
          <div className="flex items-center gap-3">
            <h1 className="text-lg font-semibold hidden sm:block">Randevular</h1>
            <div className="h-5 w-px bg-border hidden sm:block" />
            <div className="flex items-center gap-1">
              <Button variant="outline" size="icon" className="h-8 w-8" onClick={prevPeriod}>
                <ChevronLeft className="h-4 w-4" />
              </Button>
              <Button variant="outline" size="sm" className="h-8 px-3 text-xs font-medium" onClick={goToday}>
                Bugün
              </Button>
              <Button variant="outline" size="icon" className="h-8 w-8" onClick={nextPeriod}>
                <ChevronRight className="h-4 w-4" />
              </Button>
            </div>
            <span className="text-sm text-muted-foreground hidden md:inline">
              {viewMode === 'week'
                ? `${format(weekDays[0], 'd MMM', { locale: tr })} — ${format(weekDays[6], 'd MMM yyyy', { locale: tr })}`
                : format(selectedDay, 'd MMMM yyyy, EEEE', { locale: tr })
              }
            </span>
          </div>
          <Button size="sm" onClick={() => setDialogOpen(true)}>
            <Plus className="mr-1 h-4 w-4" />
            <span className="hidden sm:inline">Yeni Randevu</span>
          </Button>
        </div>
        {/* Secondary row: filters + view toggle + today summary */}
        <div className="flex items-center justify-between px-4 pb-2.5 gap-3">
          <div className="flex items-center gap-2">
            {/* View mode toggle */}
            <div className="flex items-center rounded-lg border bg-muted/40 p-0.5 hidden sm:flex">
              <button
                type="button"
                className={cn('px-2.5 py-1 text-xs rounded-md font-medium transition-all', viewMode === 'day' ? 'bg-card text-foreground shadow-sm' : 'text-muted-foreground hover:text-foreground')}
                onClick={() => { setViewMode('day'); setSelectedDay(new Date()); }}
              >
                Gün
              </button>
              <button
                type="button"
                className={cn('px-2.5 py-1 text-xs rounded-md font-medium transition-all', viewMode === 'week' ? 'bg-card text-foreground shadow-sm' : 'text-muted-foreground hover:text-foreground')}
                onClick={() => setViewMode('week')}
              >
                Hafta
              </button>
            </div>
            <div className="h-5 w-px bg-border hidden sm:block" />
            {/* Staff filter */}
            <Select value={staffFilter} onValueChange={setStaffFilter}>
              <SelectTrigger className="h-8 w-[140px] text-xs hidden md:flex">
                <SelectValue placeholder="Personel" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Tüm Personel</SelectItem>
                {staffList.map((s) => <SelectItem key={s.id} value={s.id}>{s.firstName} {s.lastName}</SelectItem>)}
              </SelectContent>
            </Select>
            {/* Status filter */}
            <Select value={statusFilter} onValueChange={setStatusFilter}>
              <SelectTrigger className="h-8 w-[120px] text-xs hidden md:flex">
                <SelectValue placeholder="Durum" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Tüm Durum</SelectItem>
                <SelectItem value="PENDING">Bekliyor</SelectItem>
                <SelectItem value="CONFIRMED">Onaylı</SelectItem>
                <SelectItem value="CHECKED_IN">Geldi</SelectItem>
                <SelectItem value="IN_SERVICE">Hizmette</SelectItem>
                <SelectItem value="COMPLETED">Tamamlandı</SelectItem>
                <SelectItem value="CANCELLED">İptal</SelectItem>
                <SelectItem value="NO_SHOW">Gelmedi</SelectItem>
              </SelectContent>
            </Select>
          </div>
          {/* Today summary */}
          {(() => {
            const todayKey = format(new Date(), 'yyyy-MM-dd');
            const todayApts = appointmentsByDay.get(todayKey) ?? [];
            const pending = todayApts.filter(a => a.status === 'PENDING' || a.status === 'CONFIRMED').length;
            const active = todayApts.filter(a => a.status === 'CHECKED_IN' || a.status === 'IN_SERVICE').length;
            if (todayApts.length === 0) return null;
            return (
              <div className="hidden lg:flex items-center gap-2 text-xs">
                <span className="text-muted-foreground">Bugün:</span>
                <span className="font-medium">{todayApts.length}</span>
                {pending > 0 && <span className="inline-flex items-center rounded-full bg-amber-50 dark:bg-amber-950/50 px-2 py-0.5 text-amber-700 dark:text-amber-400 ring-1 ring-inset ring-amber-600/20">{pending} bekleyen</span>}
                {active > 0 && <span className="inline-flex items-center rounded-full bg-purple-50 dark:bg-purple-950/50 px-2 py-0.5 text-purple-700 dark:text-purple-400 ring-1 ring-inset ring-purple-600/20">{active} aktif</span>}
              </div>
            );
          })()}
        </div>
      </div>

      {/* ── Calendar Grid ─────────────────────────────────────────────────── */}
      {error ? (
        <div className="flex items-center justify-center flex-1 gap-2 text-destructive">
          <AlertCircle className="h-5 w-5" />
          <span>Randevular yüklenemedi. Lütfen sayfayı yenileyin.</span>
        </div>
      ) : isLoading ? (
        <div className="flex items-center justify-center flex-1">
          <Loader2 className="h-8 w-8 animate-spin text-primary" />
        </div>
      ) : (
        <div className="flex-1 overflow-auto relative">
          {/* Activation-aware empty state overlay */}
          {(appointments ?? []).length === 0 && (
            <div className="absolute inset-0 z-20 flex items-center justify-center bg-background/80 backdrop-blur-sm">
              <div className="text-center max-w-sm mx-auto p-6">
                {!(services ?? []).some(s => !s.isDeleted) ? (
                  <>
                    <div className="p-3 rounded-xl bg-amber-50 dark:bg-amber-950/40 inline-block mb-3"><Scissors className="h-6 w-6 text-amber-500" /></div>
                    <p className="text-sm font-medium">Önce hizmet ekleyin</p>
                    <p className="text-xs text-muted-foreground mt-1">Randevu oluşturabilmek için en az bir hizmet gerekli.</p>
                    <Button size="sm" className="mt-3" asChild><Link href="/services">Hizmet Ekle</Link></Button>
                  </>
                ) : !(staffList.length > 0) ? (
                  <>
                    <div className="p-3 rounded-xl bg-amber-50 dark:bg-amber-950/40 inline-block mb-3"><User className="h-6 w-6 text-amber-500" /></div>
                    <p className="text-sm font-medium">Personel ekleyin</p>
                    <p className="text-xs text-muted-foreground mt-1">Randevu oluşturabilmek için en az bir personel gerekli.</p>
                    <Button size="sm" className="mt-3" asChild><Link href="/staff">Personel Ekle</Link></Button>
                  </>
                ) : (
                  <>
                    <div className="p-3 rounded-xl bg-primary/10 inline-block mb-3"><CalendarIcon className="h-6 w-6 text-primary" /></div>
                    <p className="text-sm font-medium">Takvim hazır, ilk randevunuzu oluşturun</p>
                    <p className="text-xs text-muted-foreground mt-1">Yeni Randevu butonuna tıklayın veya booking linkinizi paylaşın.</p>
                    <div className="flex gap-2 justify-center mt-3">
                      <Button size="sm" onClick={() => setDialogOpen(true)}>
                        <Plus className="mr-1 h-3 w-3" /> Randevu Oluştur
                      </Button>
                    </div>
                  </>
                )}
              </div>
            </div>
          )}
          {/* ── DAY VIEW ──────────────────────────────────────────────── */}
          {viewMode === 'day' && (() => {
            const dayKey = format(selectedDay, 'yyyy-MM-dd');
            const dayApts = (appointments ?? []).filter(a => {
              try { return format(parseISO(a.startTime), 'yyyy-MM-dd') === dayKey; } catch { return false; }
            }).sort((a, b) => new Date(a.startTime).getTime() - new Date(b.startTime).getTime());

            return (
              <div className="min-w-[300px]">
                {/* Day header */}
                <div className="border-b border-border bg-card sticky top-0 z-10 px-4 py-3">
                  <div className="flex items-center justify-between">
                    <h2 className="text-base font-semibold">{format(selectedDay, 'd MMMM yyyy, EEEE', { locale: tr })}</h2>
                    <span className="text-sm text-muted-foreground">{dayApts.length} randevu</span>
                  </div>
                </div>
                {/* Day appointment list — agenda style for speed */}
                <div className="divide-y">
                  {dayApts.length === 0 ? (
                    <div className="flex flex-col items-center justify-center py-16 text-center">
                      <CalendarIcon className="h-8 w-8 text-muted-foreground/30 mb-2" />
                      <p className="text-sm text-muted-foreground">Bu gün için randevu yok</p>
                    </div>
                  ) : dayApts.map((apt) => {
                    const servicePrice = Number(apt.service?.price ?? apt.totalPrice ?? 0);
                    const depositPaid = Number(apt.depositPaid ?? 0);
                    const isPaid = apt.status === 'COMPLETED';
                    const hasPendingBalance = servicePrice > 0 && depositPaid < servicePrice && !isPaid;

                    return (
                      <button
                        key={apt.id}
                        type="button"
                        className={cn(
                          'w-full text-left px-4 py-3 flex items-center gap-3 hover:bg-muted/50 transition-colors',
                          apt.status === 'CANCELLED' && 'opacity-50',
                          apt.status === 'NO_SHOW' && 'opacity-50',
                        )}
                        onClick={() => setDetailApt(apt)}
                      >
                        {/* Time block */}
                        <div className="w-16 shrink-0 text-center">
                          <div className="text-sm font-semibold">{format(parseISO(apt.startTime), 'HH:mm')}</div>
                          <div className="text-[10px] text-muted-foreground">{format(parseISO(apt.endTime), 'HH:mm')}</div>
                        </div>
                        {/* Staff color dot */}
                        {(apt.staff as { colorHex?: string } | undefined)?.colorHex && (
                          <div className="w-1 h-8 rounded-full shrink-0" style={{ backgroundColor: (apt.staff as { colorHex?: string }).colorHex }} />
                        )}
                        {/* Main content */}
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2">
                            <span className="text-sm font-medium truncate">
                              {apt.customer ? `${apt.customer.firstName} ${apt.customer.lastName}` : '—'}
                            </span>
                            <Badge variant={STATUS_VARIANT[apt.status]} className="text-[10px] h-5 shrink-0">
                              {STATUS_LABEL[apt.status]}
                            </Badge>
                          </div>
                          <div className="flex items-center gap-2 text-xs text-muted-foreground mt-0.5">
                            <span className="truncate">{apt.service?.name ?? ''}</span>
                            {apt.staff && <span>· {apt.staff.firstName}</span>}
                            {apt.notes && <span title={apt.notes}>📝</span>}
                          </div>
                        </div>
                        {/* Payment signal */}
                        <div className="shrink-0 text-right">
                          {servicePrice > 0 && (
                            <div className="text-sm font-medium">{servicePrice}₺</div>
                          )}
                          {isPaid && <div className="text-[10px] text-emerald-600">✓ Ödendi</div>}
                          {hasPendingBalance && <div className="text-[10px] text-amber-600">{(servicePrice - depositPaid)}₺ kalan</div>}
                        </div>
                      </button>
                    );
                  })}
                </div>
              </div>
            );
          })()}

          {/* ── WEEK VIEW ─────────────────────────────────────────────── */}
          {viewMode === 'week' && <div className="min-w-[700px]">
            {/* Day headers */}
            <div className="grid grid-cols-[56px_repeat(7,1fr)] border-b border-border bg-card sticky top-0 z-10">
              <div className="border-r" />
              {weekDays.map((day) => {
                const isToday = isSameDay(day, new Date());
                return (
                  <div
                    key={day.toISOString()}
                    className={cn(
                      'text-center py-2 border-r text-xs',
                      isToday && 'bg-primary/5',
                    )}
                  >
                    <div className="text-muted-foreground">
                      {format(day, 'EEE', { locale: tr })}
                    </div>
                    <div className={cn(
                      'text-lg font-semibold',
                      isToday && 'text-primary',
                    )}>
                      {format(day, 'd')}
                    </div>
                  </div>
                );
              })}
            </div>

            {/* Time grid */}
            <div className="grid grid-cols-[56px_repeat(7,1fr)] relative">
              {/* Hour labels */}
              <div className="border-r">
                {hours.map((h) => (
                  <div
                    key={h}
                    className="border-b text-right pr-2 text-[10px] text-muted-foreground"
                    style={{ height: HOUR_HEIGHT }}
                  >
                    <span className="relative -top-2">{String(h).padStart(2, '0')}:00</span>
                  </div>
                ))}
              </div>

              {/* Day columns */}
              {weekDays.map((day) => {
                const dayKey = format(day, 'yyyy-MM-dd');
                const dayApts = appointmentsByDay.get(dayKey) ?? [];
                const isToday = isSameDay(day, new Date());

                return (
                  <div
                    key={dayKey}
                    className={cn('border-r relative', isToday && 'bg-primary/[0.02]')}
                    style={{ height: hours.length * HOUR_HEIGHT }}
                  >
                    {/* Hour lines */}
                    {hours.map((h) => (
                      <div
                        key={h}
                        className="border-b absolute w-full"
                        style={{ top: (h - HOUR_START) * HOUR_HEIGHT }}
                      />
                    ))}

                    {/* Appointment blocks */}
                    {dayApts.map((apt) => {
                      const start = parseISO(apt.startTime);
                      const end   = parseISO(apt.endTime);
                      const startH = getHours(start) + getMinutes(start) / 60;
                      const durationMin = differenceInMinutes(end, start);
                      const top    = (startH - HOUR_START) * HOUR_HEIGHT;
                      const height = Math.max((durationMin / 60) * HOUR_HEIGHT, 20);
                      const customerName = apt.customer
                        ? `${apt.customer.firstName} ${apt.customer.lastName}`
                        : '';
                      const serviceName = apt.service?.name ?? '';

                      // Payment indicator: quick glance for front-desk
                      const servicePrice = Number(apt.service?.price ?? apt.totalPrice ?? 0);
                      const depositPaid  = Number(apt.depositPaid ?? 0);
                      const isPaid = apt.status === 'COMPLETED';
                      const hasPendingBalance = servicePrice > 0 && depositPaid < servicePrice && !isPaid;
                      const hasNotes = !!apt.notes;

                      return (
                        <div
                          key={apt.id}
                          className={cn(
                            'absolute left-0.5 right-0.5 rounded border px-1.5 py-0.5 cursor-pointer transition-colors overflow-hidden z-[1]',
                            STATUS_BG[apt.status],
                          )}
                          style={{ top, height }}
                          onClick={() => setDetailApt(apt)}
                        >
                          <div className="flex items-center gap-1 text-[10px] font-semibold truncate">
                            <span className="truncate">{format(start, 'HH:mm')} {serviceName}</span>
                            {/* Payment indicator */}
                            {isPaid && <span className="shrink-0 text-emerald-600" title="Ödendi">✓</span>}
                            {hasPendingBalance && <span className="shrink-0 text-amber-600" title="Bakiye var">₺</span>}
                            {hasNotes && <span className="shrink-0 text-blue-400" title="Not var">📝</span>}
                          </div>
                          {height > 30 && (
                            <div className="text-[10px] text-muted-foreground truncate">
                              {customerName}
                            </div>
                          )}
                          {height > 48 && (
                            <div className="flex items-center gap-1 text-[9px] text-muted-foreground truncate">
                              <span className="truncate">{apt.staff ? `${apt.staff.firstName} ${apt.staff.lastName}` : ''}</span>
                              {servicePrice > 0 && height > 55 && (
                                <span className="shrink-0 font-medium">{servicePrice}₺</span>
                              )}
                            </div>
                          )}
                        </div>
                      );
                    })}

                    {/* Now indicator */}
                    {isToday && (() => {
                      const now = new Date();
                      const nowH = getHours(now) + getMinutes(now) / 60;
                      if (nowH < HOUR_START || nowH > HOUR_END) return null;
                      return (
                        <div
                          className="absolute left-0 right-0 border-t-2 border-red-500 z-[2] pointer-events-none"
                          style={{ top: (nowH - HOUR_START) * HOUR_HEIGHT }}
                        >
                          <div className="w-2 h-2 rounded-full bg-red-500 -mt-1 -ml-1" />
                        </div>
                      );
                    })()}
                  </div>
                );
              })}
            </div>
          </div>}
        </div>
      )}

      {/* ── CREATE DIALOG ─────────────────────────────────────────────────── */}
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Yeni Randevu Oluştur</DialogTitle>
            <DialogDescription>
              Müşteri, personel ve hizmeti listeden seçin.
            </DialogDescription>
          </DialogHeader>

          <Form {...form}>
            <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
              <FormField control={form.control} name="date"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Tarih</FormLabel>
                    <Popover open={calPopoverOpen} onOpenChange={setCalPopoverOpen}>
                      <PopoverTrigger asChild>
                        <FormControl>
                          <Button variant="outline" className={cn('w-full justify-start font-normal', !field.value && 'text-muted-foreground')}>
                            <CalendarIcon className="mr-2 h-4 w-4" />
                            {field.value ? format(new Date(field.value), 'd MMMM yyyy', { locale: tr }) : 'Tarih seçin'}
                          </Button>
                        </FormControl>
                      </PopoverTrigger>
                      <PopoverContent className="w-auto p-0" align="start">
                        <Calendar mode="single" locale={tr}
                          selected={field.value ? new Date(field.value) : undefined}
                          onSelect={(d) => { if (d) { field.onChange(format(d, 'yyyy-MM-dd')); setCalPopoverOpen(false); } }}
                        />
                      </PopoverContent>
                    </Popover>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <div className="grid grid-cols-2 gap-4">
                <FormField control={form.control} name="startTime" render={({ field }) => (
                  <FormItem><FormLabel>Başlangıç</FormLabel><FormControl><Input type="time" {...field} /></FormControl><FormMessage /></FormItem>
                )} />
                <FormField control={form.control} name="endTime" render={({ field }) => (
                  <FormItem><FormLabel>Bitiş</FormLabel><FormControl><Input type="time" {...field} /></FormControl><FormMessage /></FormItem>
                )} />
              </div>
              <FormField control={form.control} name="serviceId" render={({ field }) => (
                <FormItem><FormLabel>Hizmet</FormLabel>
                  <Select onValueChange={(val) => { field.onChange(val); const svc = (services ?? []).find((s) => s.id === val); if (svc) { form.setValue('totalPrice', Number(svc.price)); const st = form.getValues('startTime'); if (st) { const [h, m] = st.split(':').map(Number); const endMin = h * 60 + m + svc.durationMin; form.setValue('endTime', `${String(Math.floor(endMin / 60)).padStart(2, '0')}:${String(endMin % 60).padStart(2, '0')}`); } } }} value={field.value}>
                    <FormControl><SelectTrigger><SelectValue placeholder="Hizmet seçin" /></SelectTrigger></FormControl>
                    <SelectContent>{!services || services.length === 0 ? <SelectItem value="_none" disabled>Yükleniyor...</SelectItem> : services.filter((s) => !s.isDeleted).map((s) => <SelectItem key={s.id} value={s.id}>{s.name} ({s.durationMin} dk — {Number(s.price).toLocaleString('tr-TR')} ₺)</SelectItem>)}</SelectContent>
                  </Select><FormMessage />
                </FormItem>
              )} />
              <FormField control={form.control} name="customerId" render={({ field }) => (
                <FormItem><FormLabel>Müşteri</FormLabel>
                  <Select onValueChange={field.onChange} value={field.value}>
                    <FormControl><SelectTrigger><SelectValue placeholder="Müşteri seçin" /></SelectTrigger></FormControl>
                    <SelectContent>{customers.length === 0
                      ? <SelectItem value="_none" disabled>Müşteri yok</SelectItem>
                      : customers.map((c) => <SelectItem key={c.id} value={c.id}>{c.firstName} {c.lastName}{c.phone ? ` — ${c.phone}` : ''}</SelectItem>)
                    }</SelectContent>
                  </Select><FormMessage />
                </FormItem>
              )} />
              <FormField control={form.control} name="staffId" render={({ field }) => (
                <FormItem><FormLabel>Personel</FormLabel>
                  <Select onValueChange={(val) => { field.onChange(val); const s = staffList.find((st) => st.id === val); if (s?.locationId) form.setValue('locationId', s.locationId); }} value={field.value}>
                    <FormControl><SelectTrigger><SelectValue placeholder="Personel seçin" /></SelectTrigger></FormControl>
                    <SelectContent>{staffList.length === 0
                      ? <SelectItem value="_none" disabled>Personel yok</SelectItem>
                      : staffList.map((st) => <SelectItem key={st.id} value={st.id}>{st.firstName} {st.lastName}{st.title ? ` — ${st.title}` : ''}</SelectItem>)
                    }</SelectContent>
                  </Select><FormMessage />
                </FormItem>
              )} />
              <FormField control={form.control} name="source" render={({ field }) => (
                <FormItem><FormLabel>Kaynak</FormLabel>
                  <Select onValueChange={field.onChange} defaultValue={field.value}><FormControl><SelectTrigger><SelectValue placeholder="Kaynak" /></SelectTrigger></FormControl>
                    <SelectContent>
                      <SelectItem value="RECEPTIONIST">Resepsiyonist</SelectItem><SelectItem value="PHONE">Telefon</SelectItem>
                      <SelectItem value="WHATSAPP">WhatsApp</SelectItem><SelectItem value="ONLINE">Online</SelectItem>
                      <SelectItem value="WALK_IN">Kapıdan</SelectItem><SelectItem value="AI_ASSISTANT">AI</SelectItem>
                    </SelectContent>
                  </Select><FormMessage />
                </FormItem>
              )} />
              <div className="grid grid-cols-2 gap-4">
                <FormField control={form.control} name="totalPrice" render={({ field }) => (
                  <FormItem><FormLabel>Fiyat</FormLabel><FormControl><Input type="number" min={0} step="0.01" {...field} /></FormControl><FormMessage /></FormItem>
                )} />
                <FormField control={form.control} name="depositPaid" render={({ field }) => (
                  <FormItem><FormLabel>Kaparo</FormLabel><FormControl><Input type="number" min={0} step="0.01" {...field} /></FormControl><FormMessage /></FormItem>
                )} />
              </div>
              <FormField control={form.control} name="notes" render={({ field }) => (
                <FormItem><FormLabel>Not (opsiyonel)</FormLabel><FormControl><Input placeholder="Not..." {...field} /></FormControl><FormMessage /></FormItem>
              )} />
              <Button type="submit" className="w-full" disabled={createAppointment.isPending}>
                {createAppointment.isPending ? <><Loader2 className="mr-2 h-4 w-4 animate-spin" />Kaydediliyor...</> : 'Randevu Oluştur'}
              </Button>
            </form>
          </Form>
        </DialogContent>
      </Dialog>

      {/* ── DETAIL SHEET ──────────────────────────────────────────────────── */}
      <Sheet open={!!detailApt} onOpenChange={(open) => !open && setDetailApt(null)}>
        <SheetContent className="overflow-y-auto sm:max-w-md">
          {detailApt && (
            <>
              <SheetHeader>
                <SheetTitle>
                  {detailApt.customer
                    ? `${detailApt.customer.firstName} ${detailApt.customer.lastName}`
                    : 'Randevu Detayı'}
                  {detailApt.service?.name && (
                    <span className="text-sm font-normal text-muted-foreground ml-2">— {detailApt.service.name}</span>
                  )}
                </SheetTitle>
                <SheetDescription>
                  {format(parseISO(detailApt.startTime), 'd MMMM yyyy, EEEE', { locale: tr })}
                  {' · '}
                  {format(parseISO(detailApt.startTime), 'HH:mm')}–{format(parseISO(detailApt.endTime), 'HH:mm')}
                </SheetDescription>
              </SheetHeader>

              <div className="mt-5 space-y-3">
                {/* ── Status bar — Untitled-inspired pill row ── */}
                <div className="flex items-center gap-1.5 flex-wrap">
                  <Badge variant={STATUS_VARIANT[detailApt.status]}>
                    {STATUS_LABEL[detailApt.status]}
                  </Badge>
                  {detailApt.source === 'ONLINE' && (
                    <Badge variant="outline" className="text-xs">Online</Badge>
                  )}
                  {/* Payment quick indicator */}
                  {(() => {
                    const sp = Number(detailApt.service?.price ?? detailApt.totalPrice ?? 0);
                    const dp = Number(detailApt.depositPaid ?? 0);
                    if (detailApt.status === 'COMPLETED') {
                      return <Badge variant="success" className="text-xs bg-emerald-100 text-emerald-700 border-emerald-200">Ödendi</Badge>;
                    }
                    if (dp > 0 && sp > dp) {
                      return <Badge variant="outline" className="text-xs bg-amber-50 dark:bg-amber-950/50 text-amber-700 dark:text-amber-400 border-amber-200 dark:border-amber-800/50">{(sp - dp).toLocaleString('tr-TR')}₺ kalan</Badge>;
                    }
                    if (dp > 0) {
                      return <Badge variant="outline" className="text-xs bg-emerald-50 dark:bg-emerald-950/50 text-emerald-700 dark:text-emerald-400 border-emerald-200 dark:border-emerald-800/50">Depozito: {dp.toLocaleString('tr-TR')}₺</Badge>;
                    }
                    if (sp > 0 && detailApt.status !== 'CANCELLED' && detailApt.status !== 'NO_SHOW') {
                      return <Badge variant="outline" className="text-xs bg-gray-50 text-gray-600">{sp.toLocaleString('tr-TR')}₺</Badge>;
                    }
                    return null;
                  })()}
                </div>

                {/* ── Appointment details card ── */}
                <div className="rounded-lg border bg-muted/30 p-3 space-y-3">
                <div className="flex items-center gap-3">
                  <Clock className="h-4 w-4 text-muted-foreground" />
                  <span className="text-sm">
                    {format(parseISO(detailApt.startTime), 'HH:mm')} - {format(parseISO(detailApt.endTime), 'HH:mm')}
                  </span>
                </div>

                <div className="flex items-center gap-3">
                  <Scissors className="h-4 w-4 text-muted-foreground" />
                  <div>
                    <span className="text-sm font-medium">
                      {detailApt.service?.name ?? detailApt.serviceId.slice(0, 8) + '...'}
                    </span>
                    {detailApt.service?.durationMin && (
                      <span className="text-xs text-muted-foreground ml-2">({detailApt.service.durationMin} dk)</span>
                    )}
                  </div>
                </div>

                <button
                  type="button"
                  className="flex items-center gap-3 w-full text-left rounded-lg px-2 py-1.5 -mx-2 hover:bg-primary/5 transition-colors group/cust"
                  onClick={() => {
                    if (detailApt.customer) {
                      setDetailApt(null);
                      router.push(`/customers?highlight=${detailApt.customer.id}`);
                    }
                  }}
                >
                  <User className="h-4 w-4 text-muted-foreground" />
                  <div className="flex-1 min-w-0">
                    <span className="text-sm font-medium group-hover/cust:text-primary transition-colors">
                      {detailApt.customer ? `${detailApt.customer.firstName} ${detailApt.customer.lastName}` : detailApt.customerId.slice(0, 8) + '...'}
                    </span>
                    {detailApt.customer?.phone && (
                      <span className="text-xs text-muted-foreground ml-2">{detailApt.customer.phone}</span>
                    )}
                  </div>
                  {detailApt.customer && (
                    <ChevronRight className="h-3.5 w-3.5 text-muted-foreground/40 group-hover/cust:text-primary transition-colors" />
                  )}
                </button>

                <div className="flex items-center gap-3">
                  <MapPin className="h-4 w-4 text-muted-foreground" />
                  <span className="text-sm">
                    {detailApt.staff ? `${detailApt.staff.firstName} ${detailApt.staff.lastName}` : detailApt.staffId.slice(0, 8) + '...'}
                  </span>
                </div>
                </div>{/* close details card */}

                {/* ── Ekonomik Özet ──────────────────────────────── */}
                {(() => {
                  const servicePrice = Number(detailApt.service?.price ?? detailApt.totalPrice ?? 0);
                  const deposit      = Number(detailApt.depositPaid ?? 0);
                  const remaining    = Math.max(servicePrice - deposit, 0);
                  const hasDeposit   = deposit > 0;

                  return (servicePrice > 0 || hasDeposit) ? (
                    <div className="bg-muted/50 rounded-lg p-3 space-y-1.5">
                      {servicePrice > 0 && (
                        <div className="flex items-center justify-between">
                          <span className="text-sm text-muted-foreground">Hizmet Tutarı</span>
                          <span className="text-lg font-semibold">{servicePrice.toLocaleString('tr-TR')} ₺</span>
                        </div>
                      )}
                      {hasDeposit && (
                        <div className="flex items-center justify-between">
                          <span className="text-xs text-muted-foreground">Alınan Depozito</span>
                          <span className="text-sm text-emerald-600 font-medium">−{deposit.toLocaleString('tr-TR')} ₺</span>
                        </div>
                      )}
                      {hasDeposit && servicePrice > 0 && (
                        <div className="flex items-center justify-between border-t border-border/50 pt-1">
                          <span className="text-sm font-medium">Kalan</span>
                          <span className="text-lg font-bold">{remaining.toLocaleString('tr-TR')} ₺</span>
                        </div>
                      )}
                      {/* Ledger kayıtları */}
                      {ledgerData && ledgerData.length > 0 && (
                        <div className="border-t border-border/50 pt-1 mt-1">
                          {ledgerData.map((entry) => (
                            <div key={entry.id} className="flex items-center justify-between text-xs">
                              <span className="text-muted-foreground">
                                {entry.type === 'PAYMENT_CASH' ? '💵 Nakit' :
                                 entry.type === 'PAYMENT_CARD' ? '💳 Kart' :
                                 entry.type === 'PAYMENT_ONLINE' ? '🌐 Online' :
                                 entry.type === 'DEPOSIT' ? '📋 Depozito' :
                                 entry.type === 'ADJUSTMENT' ? '📊 Kayıt' : entry.type}
                              </span>
                              <span className="font-medium">{Number(entry.amount).toLocaleString('tr-TR')} ₺</span>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  ) : null;
                })()}

                {/* ── Checkout / Tahsilat — sadece IN_SERVICE ── */}
                {detailApt.status === 'IN_SERVICE' && (() => {
                  const checkoutServicePrice = Number(detailApt.service?.price ?? detailApt.totalPrice ?? 0);
                  const checkoutDeposit      = Number(detailApt.depositPaid ?? 0);
                  const extrasTotal          = extraItems.reduce((s, i) => s + i.price, 0);
                  const checkoutGross        = checkoutServicePrice + extrasTotal;
                  const checkoutRemaining    = Math.max(checkoutGross - checkoutDeposit, 0);

                  return (
                    <div className="space-y-2">
                      <span className="text-xs text-muted-foreground font-medium">Tahsilat</span>
                      {!checkoutOpen ? (
                        <Button
                          size="sm"
                          className="w-full bg-emerald-600 hover:bg-emerald-700"
                          onClick={() => {
                            setCheckoutMethod('PAYMENT_CASH');
                            setCheckoutRef('');
                            setExtraItems([]);
                            setNewItemName('');
                            setNewItemPrice('');
                            setCheckoutOpen(true);
                          }}
                        >
                          💰 Tahsilatı Kapat
                        </Button>
                      ) : (
                        <div className="space-y-2.5 bg-emerald-50 dark:bg-emerald-950/30 rounded-lg p-3 border border-emerald-200 dark:border-emerald-800/50">
                          {/* ── Order summary ── */}
                          <div className="text-xs space-y-0.5">
                            <div className="flex justify-between text-emerald-800">
                              <span>{detailApt.service?.name ?? 'Hizmet'}</span>
                              <span>{checkoutServicePrice.toLocaleString('tr-TR')} ₺</span>
                            </div>
                            {extraItems.map((item, idx) => (
                              <div key={idx} className="flex justify-between text-emerald-700">
                                <span className="flex items-center gap-1">
                                  <button
                                    className="text-red-400 hover:text-red-600 text-[10px]"
                                    onClick={() => setExtraItems(extraItems.filter((_, i) => i !== idx))}
                                  >✕</button>
                                  {item.name}
                                </span>
                                <span>{item.price.toLocaleString('tr-TR')} ₺</span>
                              </div>
                            ))}
                            {checkoutDeposit > 0 && (
                              <div className="flex justify-between text-emerald-600">
                                <span>Alınan depozito</span>
                                <span>−{checkoutDeposit.toLocaleString('tr-TR')} ₺</span>
                              </div>
                            )}
                          </div>

                          {/* ── Add extra item ── */}
                          <div className="flex gap-1.5">
                            <Input
                              placeholder="Ek kalem (ör: bakım ürünü)"
                              value={newItemName}
                              onChange={(e) => setNewItemName(e.target.value)}
                              className="h-7 text-[11px] flex-1"
                            />
                            <Input
                              type="number"
                              placeholder="₺"
                              value={newItemPrice}
                              onChange={(e) => setNewItemPrice(e.target.value)}
                              className="h-7 text-[11px] w-16"
                              min={0}
                              step="0.01"
                            />
                            <Button
                              size="sm"
                              variant="outline"
                              className="h-7 px-2 text-[10px]"
                              disabled={!newItemName.trim() || !newItemPrice || Number(newItemPrice) <= 0}
                              onClick={() => {
                                setExtraItems([...extraItems, { name: newItemName.trim(), price: Number(newItemPrice) }]);
                                setNewItemName('');
                                setNewItemPrice('');
                              }}
                            >
                              <Plus className="h-3 w-3" />
                            </Button>
                          </div>

                          {/* ── Total ── */}
                          <div className="flex items-center justify-between border-t border-emerald-200 pt-1.5">
                            <span className="text-sm font-semibold text-emerald-900">Tahsil Edilecek</span>
                            <span className="text-lg font-bold text-emerald-900">
                              {checkoutRemaining.toLocaleString('tr-TR')} ₺
                            </span>
                          </div>

                          {/* ── Payment method ── */}
                          <div>
                            <label className="text-xs text-emerald-700">Ödeme Yöntemi</label>
                            <select
                              value={checkoutMethod}
                              onChange={(e) => setCheckoutMethod(e.target.value as CheckoutPaymentMethod)}
                              className="w-full h-8 text-sm rounded border border-emerald-300 dark:border-emerald-800 bg-card px-2 mt-0.5"
                            >
                              <option value="PAYMENT_CASH">Nakit</option>
                              <option value="PAYMENT_CARD">Kart</option>
                              <option value="PAYMENT_ONLINE">Online</option>
                            </select>
                          </div>
                          <Input
                            placeholder="Referans (opsiyonel)"
                            value={checkoutRef}
                            onChange={(e) => setCheckoutRef(e.target.value)}
                            className="h-8 text-xs"
                          />
                          <div className="flex gap-2">
                            <Button size="sm" variant="outline" className="flex-1" onClick={() => { setCheckoutOpen(false); setExtraItems([]); }}>
                              Vazgeç
                            </Button>
                            <Button
                              size="sm"
                              className="flex-1 bg-emerald-600 hover:bg-emerald-700"
                              disabled={checkoutAppointment.isPending}
                              onClick={async () => {
                                try {
                                  // Build structured line items for ledger details
                                  const allItems = [
                                    { type: 'service', label: detailApt.service?.name ?? 'Hizmet', amount: checkoutServicePrice },
                                    ...extraItems.map(i => ({ type: 'extra' as const, label: i.name, amount: i.price })),
                                  ];
                                  // Human-readable notes (secondary, for description field)
                                  const breakdown = allItems.map(i => `${i.label}: ${i.amount}₺`).join(' | ');
                                  const updated = await checkoutAppointment.mutateAsync({
                                    appointmentId: detailApt.id,
                                    amount: checkoutRemaining,
                                    paymentMethod: checkoutMethod,
                                    ...(checkoutRef ? { reference: checkoutRef } : {}),
                                    notes: extraItems.length > 0 ? breakdown : undefined,
                                    lineItems: allItems,
                                  });
                                  setDetailApt({ ...detailApt, status: updated.status, totalPrice: updated.totalPrice, updatedAt: updated.updatedAt });
                                  setCheckoutOpen(false);
                                  setExtraItems([]);
                                  toast({ title: 'Tahsilat tamamlandı', description: `${checkoutRemaining.toLocaleString('tr-TR')} ₺ — ${checkoutMethod === 'PAYMENT_CASH' ? 'Nakit' : checkoutMethod === 'PAYMENT_CARD' ? 'Kart' : 'Online'}` });
                                } catch (err: unknown) {
                                  const msg = err && typeof err === 'object' && 'response' in err
                                    ? (err as { response?: { data?: { message?: string } } }).response?.data?.message
                                    : 'Tahsilat başarısız.';
                                  toast({ variant: 'destructive', title: 'Hata', description: msg ?? 'Tahsilat başarısız.' });
                                }
                              }}
                            >
                              {checkoutAppointment.isPending ? <Loader2 className="mr-1 h-3 w-3 animate-spin" /> : null}
                              Onayla
                            </Button>
                          </div>
                        </div>
                      )}
                    </div>
                  );
                })()}

                {/* ── Completed + Paid göstergesi ── */}
                {detailApt.status === 'COMPLETED' && ledgerData && ledgerData.some(e => e.type.startsWith('PAYMENT_')) && (
                  <div className="flex items-center gap-2 bg-emerald-50 rounded-lg p-2 border border-emerald-200">
                    <span className="text-emerald-700 text-xs font-medium">✅ Tahsilat tamamlandı</span>
                  </div>
                )}

                {/* ── Completed ama ödenmemiş uyarısı ── */}
                {detailApt.status === 'COMPLETED' && ledgerData && !ledgerData.some(e => e.type.startsWith('PAYMENT_')) && (
                  <div className="flex items-center gap-2 bg-amber-50 rounded-lg p-2 border border-amber-200">
                    <span className="text-amber-700 text-xs font-medium">⚠ Tahsilat bekliyor</span>
                  </div>
                )}

                {detailApt.notes && (
                  <div className="bg-muted/30 rounded-lg p-3">
                    <span className="text-xs text-muted-foreground">Not:</span>
                    <p className="text-sm mt-1">{detailApt.notes}</p>
                  </div>
                )}

                {detailApt.cancellationReason && (
                  <div className="bg-destructive/10 rounded-lg p-3">
                    <span className="text-xs text-destructive">İptal sebebi:</span>
                    <p className="text-sm mt-1">{detailApt.cancellationReason}</p>
                  </div>
                )}

                <Separator />

                {/* Reschedule — sadece PENDING ve CONFIRMED */}
                {(detailApt.status === 'PENDING' || detailApt.status === 'CONFIRMED') && (
                  <div className="space-y-2">
                    <span className="text-xs text-muted-foreground font-medium">Yeniden Planla</span>
                    {/* Quick move buttons — 1-click reschedule */}
                    {!rescheduleOpen && (
                      <div className="flex flex-wrap gap-1.5">
                        {[
                          { label: '+30dk', addMin: 30 },
                          { label: '+1sa', addMin: 60 },
                          { label: 'Yarın', addDays: 1, addMin: 0 },
                        ].map((move) => (
                          <Button
                            key={move.label}
                            size="sm"
                            variant="outline"
                            className="text-xs h-7 px-2"
                            disabled={rescheduleAppointment.isPending}
                            onClick={async () => {
                              try {
                                const origStart = parseISO(detailApt.startTime);
                                const origEnd = parseISO(detailApt.endTime);
                                const durationMs = origEnd.getTime() - origStart.getTime();
                                let newStart: Date;
                                if (move.addDays) {
                                  newStart = addDays(origStart, move.addDays);
                                } else {
                                  newStart = new Date(origStart.getTime() + (move.addMin ?? 0) * 60000);
                                }
                                const newEnd = new Date(newStart.getTime() + durationMs);
                                const updated = await rescheduleAppointment.mutateAsync({
                                  appointmentId: detailApt.id,
                                  newStartTime: newStart.toISOString(),
                                  newEndTime: newEnd.toISOString(),
                                  reason: `Hızlı kaydırma: ${move.label}`,
                                });
                                setDetailApt({ ...detailApt, startTime: updated.startTime, endTime: updated.endTime, updatedAt: updated.updatedAt });
                                toast({ title: 'Kaydırıldı', description: `${move.label} ileri alındı` });
                              } catch (err: unknown) {
                                const msg = err && typeof err === 'object' && 'response' in err
                                  ? (err as { response?: { data?: { message?: string } } }).response?.data?.message
                                  : 'Kaydırma başarısız.';
                                toast({ variant: 'destructive', title: 'Hata', description: msg ?? 'Kaydırma başarısız.' });
                              }
                            }}
                          >
                            {move.label}
                          </Button>
                        ))}
                        <Button
                          size="sm"
                          variant="outline"
                          className="text-xs h-7 px-2"
                          onClick={() => {
                            setRescheduleDate(format(parseISO(detailApt.startTime), 'yyyy-MM-dd'));
                            setRescheduleStart(format(parseISO(detailApt.startTime), 'HH:mm'));
                            setRescheduleEnd(format(parseISO(detailApt.endTime), 'HH:mm'));
                            setRescheduleReason('');
                            setRescheduleOpen(true);
                          }}
                        >
                          <Clock className="mr-1 h-3 w-3" /> Özel
                        </Button>
                      </div>
                    )}
                    {rescheduleOpen && (
                      <div className="space-y-2 bg-muted/50 rounded-lg p-3 mt-2">
                        <div className="grid grid-cols-3 gap-2">
                          <div>
                            <label className="text-xs text-muted-foreground">Tarih</label>
                            <Input
                              type="date"
                              value={rescheduleDate}
                              onChange={(e) => setRescheduleDate(e.target.value)}
                              className="h-8 text-xs"
                            />
                          </div>
                          <div>
                            <label className="text-xs text-muted-foreground">Başlangıç</label>
                            <Input
                              type="time"
                              value={rescheduleStart}
                              onChange={(e) => setRescheduleStart(e.target.value)}
                              className="h-8 text-xs"
                            />
                          </div>
                          <div>
                            <label className="text-xs text-muted-foreground">Bitiş</label>
                            <Input
                              type="time"
                              value={rescheduleEnd}
                              onChange={(e) => setRescheduleEnd(e.target.value)}
                              className="h-8 text-xs"
                            />
                          </div>
                        </div>
                        <Input
                          placeholder="Neden (opsiyonel)"
                          value={rescheduleReason}
                          onChange={(e) => setRescheduleReason(e.target.value)}
                          className="h-8 text-xs"
                        />
                        <div className="flex gap-2">
                          <Button
                            size="sm"
                            variant="outline"
                            className="flex-1"
                            onClick={() => setRescheduleOpen(false)}
                          >
                            Vazgeç
                          </Button>
                          <Button
                            size="sm"
                            className="flex-1"
                            disabled={rescheduleAppointment.isPending || !rescheduleDate || !rescheduleStart || !rescheduleEnd}
                            onClick={async () => {
                              try {
                                const newStart = `${rescheduleDate}T${rescheduleStart}:00.000Z`;
                                const newEnd   = `${rescheduleDate}T${rescheduleEnd}:00.000Z`;
                                const updated = await rescheduleAppointment.mutateAsync({
                                  appointmentId: detailApt.id,
                                  newStartTime: newStart,
                                  newEndTime: newEnd,
                                  ...(rescheduleReason ? { reason: rescheduleReason } : {}),
                                });
                                setDetailApt({ ...detailApt, startTime: updated.startTime, endTime: updated.endTime, updatedAt: updated.updatedAt });
                                setRescheduleOpen(false);
                                toast({ title: 'Randevu kaydırıldı', description: `Yeni saat: ${rescheduleStart} - ${rescheduleEnd}` });
                              } catch (err: unknown) {
                                const msg = err && typeof err === 'object' && 'response' in err
                                  ? (err as { response?: { data?: { message?: string } } }).response?.data?.message
                                  : 'Kaydırma başarısız.';
                                toast({ variant: 'destructive', title: 'Hata', description: msg ?? 'Kaydırma başarısız.' });
                              }
                            }}
                          >
                            {rescheduleAppointment.isPending ? <Loader2 className="mr-1 h-3 w-3 animate-spin" /> : null}
                            Kaydet
                          </Button>
                        </div>
                      </div>
                    )}
                  </div>
                )}

                <Separator />

                {NEXT_ACTIONS[detailApt.status].length > 0 ? (
                  <div className="space-y-2">
                    <span className="text-xs text-muted-foreground font-medium">İşlemler</span>
                    <div className="flex flex-wrap gap-2">
                      {NEXT_ACTIONS[detailApt.status].map((nextStatus) => (
                        <Button
                          key={nextStatus}
                          size="sm"
                          variant={ACTION_VARIANT[nextStatus]}
                          disabled={updateStatus.isPending}
                          onClick={async () => {
                            try {
                              const updated = await updateStatus.mutateAsync({
                                appointmentId: detailApt.id,
                                status: nextStatus,
                              });
                              setDetailApt({
                                ...detailApt,
                                status: updated.status,
                                updatedAt: updated.updatedAt,
                                cancelledAt: updated.cancelledAt ?? detailApt.cancelledAt,
                                cancellationReason: updated.cancellationReason ?? detailApt.cancellationReason,
                              });
                              toast({ title: 'Durum güncellendi', description: `${STATUS_LABEL[nextStatus]} olarak değiştirildi.` });
                            } catch (err: unknown) {
                              const msg = err && typeof err === 'object' && 'response' in err
                                ? (err as { response?: { data?: { message?: string } } }).response?.data?.message
                                : 'Durum güncellenemedi.';
                              toast({ variant: 'destructive', title: 'Hata', description: msg ?? 'Durum güncellenemedi.' });
                            }
                          }}
                        >
                          {updateStatus.isPending ? <Loader2 className="mr-1 h-3 w-3 animate-spin" /> : null}
                          {ACTION_LABEL[nextStatus]}
                        </Button>
                      ))}
                    </div>
                  </div>
                ) : (
                  <p className="text-xs text-muted-foreground text-center py-2">
                    Bu randevu için başka işlem yapılamaz.
                  </p>
                )}
              </div>
            </>
          )}
        </SheetContent>
      </Sheet>
    </div>
  );
}
