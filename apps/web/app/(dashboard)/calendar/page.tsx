'use client';

import { useState, useMemo } from 'react';
import { useRouter }   from 'next/navigation';
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
  NEXT_ACTIONS,
  type Appointment,
  type AppointmentStatus,
  type AppointmentSource,
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
  PENDING:    'bg-amber-50 border-amber-200 hover:bg-amber-100',
  CONFIRMED:  'bg-blue-50 border-blue-200 hover:bg-blue-100',
  CHECKED_IN: 'bg-indigo-50 border-indigo-200 hover:bg-indigo-100',
  IN_SERVICE: 'bg-purple-50 border-purple-200 hover:bg-purple-100',
  COMPLETED:  'bg-emerald-50 border-emerald-200 hover:bg-emerald-100',
  CANCELLED:  'bg-red-50 border-red-200 hover:bg-red-100',
  NO_SHOW:    'bg-gray-50 border-gray-200 hover:bg-gray-100',
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
  const [dialogOpen, setDialogOpen]     = useState(false);
  const [calPopoverOpen, setCalPopoverOpen] = useState(false);
  const [detailApt, setDetailApt]       = useState<Appointment | null>(null);
  const [staffFilter, setStaffFilter]   = useState<string>('all');
  const [statusFilter, setStatusFilter] = useState<string>('all');

  const { data: appointments, isLoading, error } = useAppointments();
  const { data: services }                       = useServices();
  const { data: customersData }                  = useCustomers();
  const { data: staffData }                      = useStaff();
  const { data: tenant }                         = useTenant();
  const createAppointment                        = useCreateAppointment();
  const updateStatus                             = useUpdateAppointmentStatus();

  const customers = customersData?.data ?? [];
  const staffList = staffData?.data ?? [];

  const weekDays = useMemo(() =>
    Array.from({ length: 7 }, (_, i) => addDays(weekStart, i)),
  [weekStart]);

  const hours = useMemo(() =>
    Array.from({ length: HOUR_END - HOUR_START }, (_, i) => HOUR_START + i),
  []);

  // Group appointments by day with filters
  const appointmentsByDay = useMemo(() => {
    const map = new Map<string, Appointment[]>();
    for (const day of weekDays) {
      const key = format(day, 'yyyy-MM-dd');
      map.set(key, []);
    }
    for (const apt of appointments ?? []) {
      try {
        if (staffFilter !== 'all' && apt.staffId !== staffFilter) continue;
        if (statusFilter !== 'all' && apt.status !== statusFilter) continue;
        const d = parseISO(apt.startTime);
        const key = format(d, 'yyyy-MM-dd');
        if (map.has(key)) {
          map.get(key)!.push(apt);
        }
      } catch { /* skip invalid */ }
    }
    return map;
  }, [appointments, weekDays, staffFilter, statusFilter]);

  function prevWeek() { setWeekStart(addDays(weekStart, -7)); }
  function nextWeek() { setWeekStart(addDays(weekStart, 7)); }
  function goToday()  { setWeekStart(startOfWeek(new Date(), { weekStartsOn: 1 })); }

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
      {/* ── Header ────────────────────────────────────────────────────────── */}
      <div className="flex items-center justify-between px-4 py-3 border-b bg-white shrink-0">
        <div className="flex items-center gap-3">
          <h1 className="text-lg font-semibold hidden sm:block">Randevular</h1>
          <div className="flex items-center gap-1">
            <Button variant="outline" size="icon" className="h-8 w-8" onClick={prevWeek}>
              <ChevronLeft className="h-4 w-4" />
            </Button>
            <Button variant="outline" size="sm" className="h-8 px-3 text-xs" onClick={goToday}>
              Bugün
            </Button>
            <Button variant="outline" size="icon" className="h-8 w-8" onClick={nextWeek}>
              <ChevronRight className="h-4 w-4" />
            </Button>
          </div>
          <span className="text-sm text-muted-foreground hidden md:inline">
            {format(weekDays[0], 'd MMM', { locale: tr })} — {format(weekDays[6], 'd MMM yyyy', { locale: tr })}
          </span>
        </div>
        <div className="flex items-center gap-2">
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
              <SelectItem value="COMPLETED">Tamamlandı</SelectItem>
              <SelectItem value="CANCELLED">İptal</SelectItem>
            </SelectContent>
          </Select>
          <Button size="sm" onClick={() => setDialogOpen(true)}>
            <Plus className="mr-1 h-4 w-4" />
            <span className="hidden sm:inline">Yeni Randevu</span>
          </Button>
        </div>
      </div>

      {/* ── Weekly Grid ───────────────────────────────────────────────────── */}
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
        <div className="flex-1 overflow-auto">
          <div className="min-w-[700px]">
            {/* Day headers */}
            <div className="grid grid-cols-[56px_repeat(7,1fr)] border-b bg-white sticky top-0 z-10">
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
                          <div className="text-[10px] font-semibold truncate">
                            {format(start, 'HH:mm')} {serviceName}
                          </div>
                          {height > 30 && (
                            <div className="text-[10px] text-muted-foreground truncate">
                              {customerName}
                            </div>
                          )}
                          {height > 48 && (
                            <div className="text-[9px] text-muted-foreground truncate">
                              {apt.staff ? `${apt.staff.firstName} ${apt.staff.lastName}` : ''}
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
          </div>
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
                <SheetTitle>Randevu Detayı</SheetTitle>
                <SheetDescription>
                  {format(parseISO(detailApt.startTime), 'd MMMM yyyy, EEEE', { locale: tr })}
                </SheetDescription>
              </SheetHeader>

              <div className="mt-6 space-y-4">
                <div className="flex items-center gap-2">
                  <span className="text-sm text-muted-foreground">Durum:</span>
                  <Badge variant={STATUS_VARIANT[detailApt.status]}>
                    {STATUS_LABEL[detailApt.status]}
                  </Badge>
                  {detailApt.source === 'ONLINE' && (
                    <Badge variant="outline" className="text-xs">Online Booking</Badge>
                  )}
                </div>

                <Separator />

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

                {detailApt.totalPrice && (
                  <div className="flex items-center justify-between bg-muted/50 rounded-lg p-3">
                    <span className="text-sm text-muted-foreground">Toplam</span>
                    <span className="text-lg font-semibold">{Number(detailApt.totalPrice).toLocaleString('tr-TR')} ₺</span>
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
