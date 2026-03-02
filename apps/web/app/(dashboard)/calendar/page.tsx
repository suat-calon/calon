'use client';

import { useState }    from 'react';
import { useForm }     from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z }           from 'zod';
import { format, isSameDay, parseISO } from 'date-fns';
import { tr }          from 'date-fns/locale';
import { CalendarIcon, Plus, Loader2, Clock } from 'lucide-react';

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
  type AppointmentStatus,
  type AppointmentSource,
} from '@/hooks/api/use-appointments';
import { useServices } from '@/hooks/api/use-services';
import { cn }          from '@/lib/utils';

// ── Yardımcılar ───────────────────────────────────────────────────────────────

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

// ── Randevu formu şeması ──────────────────────────────────────────────────────

const appointmentSchema = z.object({
  customerId:  z.string().uuid('Geçerli bir Müşteri UUID girin'),
  staffId:     z.string().uuid('Geçerli bir Personel UUID girin'),
  serviceId:   z.string().uuid('Hizmet seçin'),
  locationId:  z.string().uuid('Geçerli bir Lokasyon UUID girin'),
  date:        z.string().min(1, 'Tarih seçin'),
  startTime:   z.string().regex(/^\d{2}:\d{2}$/, 'SS:DD formatında girin'),
  endTime:     z.string().regex(/^\d{2}:\d{2}$/, 'SS:DD formatında girin'),
  source:      z.string().optional(),
  notes:       z.string().max(1000).optional(),
  totalPrice:  z.coerce.number().min(0).optional(),
  depositPaid: z.coerce.number().min(0).optional(),
});

type AppointmentForm = z.infer<typeof appointmentSchema>;

// ── Ana bileşen ───────────────────────────────────────────────────────────────

export default function CalendarPage() {
  const [selectedDate, setSelectedDate] = useState<Date>(new Date());
  const [dialogOpen, setDialogOpen]     = useState(false);
  const [calPopoverOpen, setCalPopoverOpen] = useState(false);

  const { data: appointments, isLoading: appsLoading } = useAppointments();
  const { data: services }                             = useServices();
  const createAppointment                              = useCreateAppointment();

  // Seçilen güne ait randevular
  const dayAppointments = (appointments ?? []).filter((apt) => {
    try {
      return isSameDay(parseISO(apt.startTime), selectedDate);
    } catch {
      return false;
    }
  }).sort((a, b) => a.startTime.localeCompare(b.startTime));

  // ── Randevu formu ────────────────────────────────────────────────────────────
  const form = useForm<AppointmentForm>({
    resolver:      zodResolver(appointmentSchema),
    defaultValues: {
      customerId:  '',
      staffId:     '',
      serviceId:   '',
      locationId:  '',
      date:        format(new Date(), 'yyyy-MM-dd'),
      startTime:   '09:00',
      endTime:     '10:00',
      source:      'RECEPTIONIST',
      notes:       '',
      totalPrice:  0,
      depositPaid: 0,
    },
  });

  async function onSubmit(values: AppointmentForm) {
    try {
      const startDateTime = new Date(`${values.date}T${values.startTime}:00`);
      const endDateTime   = new Date(`${values.date}T${values.endTime}:00`);

      if (endDateTime <= startDateTime) {
        toast({ variant: 'destructive', title: 'Geçersiz saat', description: 'Bitiş saati başlangıçtan sonra olmalı.' });
        return;
      }

      await createAppointment.mutateAsync({
        customerId:  values.customerId,
        staffId:     values.staffId,
        serviceId:   values.serviceId,
        locationId:  values.locationId,
        startTime:   startDateTime.toISOString(),
        endTime:     endDateTime.toISOString(),
        source:      (values.source as AppointmentSource) || 'RECEPTIONIST',
        notes:       values.notes || undefined,
        totalPrice:  values.totalPrice || undefined,
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
    <div className="min-h-screen bg-slate-50">
      {/* Üst nav */}
      <header className="border-b bg-white px-6 py-4 flex items-center gap-2 shadow-sm">
        <span className="text-xl font-bold text-primary">Auralis</span>
        <span className="text-sm text-muted-foreground">/ Randevular</span>
      </header>

      <main className="container mx-auto max-w-6xl p-6 space-y-6">
        <div className="flex items-center justify-between">
          <h1 className="text-3xl font-bold tracking-tight">Randevu Takvimi</h1>
          <Button onClick={() => setDialogOpen(true)}>
            <Plus className="mr-2 h-4 w-4" />
            Yeni Randevu
          </Button>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-[280px_1fr] gap-6">
          {/* ── Takvim ─────────────────────────────────────────────────────── */}
          <div className="bg-white rounded-lg border shadow-sm p-4 h-fit">
            <Calendar
              mode="single"
              selected={selectedDate}
              onSelect={(d) => d && setSelectedDate(d)}
              locale={tr}
              className="rounded-md"
            />
          </div>

          {/* ── Randevu listesi ─────────────────────────────────────────────── */}
          <div className="space-y-3">
            <h2 className="text-lg font-semibold">
              {format(selectedDate, 'd MMMM yyyy, EEEE', { locale: tr })}
            </h2>

            {appsLoading ? (
              <div className="flex justify-center py-12">
                <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
              </div>
            ) : dayAppointments.length === 0 ? (
              <div className="bg-white rounded-lg border shadow-sm p-8 text-center text-muted-foreground">
                Bu gün için randevu bulunmuyor
              </div>
            ) : (
              dayAppointments.map((apt) => {
                const service = services?.find((s) => s.id === apt.serviceId);
                const start   = format(parseISO(apt.startTime), 'HH:mm');
                const end     = format(parseISO(apt.endTime),   'HH:mm');

                return (
                  <div
                    key={apt.id}
                    className="bg-white rounded-lg border shadow-sm p-4 flex items-start gap-4 hover:border-primary/30 transition-colors"
                  >
                    <div className="flex flex-col items-center min-w-[56px] text-center">
                      <Clock className="h-4 w-4 text-muted-foreground mb-1" />
                      <span className="text-sm font-semibold">{start}</span>
                      <span className="text-xs text-muted-foreground">{end}</span>
                    </div>

                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="font-medium text-sm truncate">
                          {service?.name ?? apt.serviceId.slice(0, 8) + '…'}
                        </span>
                        <Badge variant={STATUS_VARIANT[apt.status]}>
                          {STATUS_LABEL[apt.status]}
                        </Badge>
                      </div>
                      <p className="text-xs text-muted-foreground mt-1">
                        Müşteri: {apt.customerId.slice(0, 8)}… · Personel: {apt.staffId.slice(0, 8)}…
                      </p>
                      {apt.notes && (
                        <p className="text-xs text-slate-500 mt-1 italic line-clamp-1">{apt.notes}</p>
                      )}
                    </div>

                    {apt.totalPrice && (
                      <div className="text-right shrink-0">
                        <span className="text-sm font-semibold">
                          {Number(apt.totalPrice).toLocaleString('tr-TR')} ₺
                        </span>
                      </div>
                    )}
                  </div>
                );
              })
            )}
          </div>
        </div>
      </main>

      {/* ── RANDEVU OLUŞTUR DIALOG ────────────────────────────────────────── */}
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Yeni Randevu Oluştur</DialogTitle>
            <DialogDescription>
              Tüm UUID alanları backend'den alınır. Hizmet listeden seçilir.
            </DialogDescription>
          </DialogHeader>

          <Form {...form}>
            <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">

              {/* Tarih seçici */}
              <FormField control={form.control} name="date"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Tarih</FormLabel>
                    <Popover open={calPopoverOpen} onOpenChange={setCalPopoverOpen}>
                      <PopoverTrigger asChild>
                        <FormControl>
                          <Button
                            variant="outline"
                            className={cn('w-full justify-start font-normal', !field.value && 'text-muted-foreground')}
                          >
                            <CalendarIcon className="mr-2 h-4 w-4" />
                            {field.value
                              ? format(new Date(field.value), 'd MMMM yyyy', { locale: tr })
                              : 'Tarih seçin'}
                          </Button>
                        </FormControl>
                      </PopoverTrigger>
                      <PopoverContent className="w-auto p-0" align="start">
                        <Calendar
                          mode="single"
                          locale={tr}
                          selected={field.value ? new Date(field.value) : undefined}
                          onSelect={(d) => {
                            if (d) {
                              field.onChange(format(d, 'yyyy-MM-dd'));
                              setCalPopoverOpen(false);
                            }
                          }}
                        />
                      </PopoverContent>
                    </Popover>
                    <FormMessage />
                  </FormItem>
                )}
              />

              {/* Saat aralığı */}
              <div className="grid grid-cols-2 gap-4">
                <FormField control={form.control} name="startTime"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Başlangıç Saati</FormLabel>
                      <FormControl><Input type="time" {...field} /></FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <FormField control={form.control} name="endTime"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Bitiş Saati</FormLabel>
                      <FormControl><Input type="time" {...field} /></FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              </div>

              {/* Hizmet seçimi */}
              <FormField control={form.control} name="serviceId"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Hizmet</FormLabel>
                    <Select onValueChange={field.onChange} defaultValue={field.value}>
                      <FormControl>
                        <SelectTrigger>
                          <SelectValue placeholder="Hizmet seçin" />
                        </SelectTrigger>
                      </FormControl>
                      <SelectContent>
                        {!services || services.length === 0 ? (
                          <SelectItem value="_none" disabled>Hizmet yükleniyor…</SelectItem>
                        ) : (
                          services.map((svc) => (
                            <SelectItem key={svc.id} value={svc.id}>
                              {svc.name} ({svc.durationMin} dk)
                            </SelectItem>
                          ))
                        )}
                      </SelectContent>
                    </Select>
                    <FormMessage />
                  </FormItem>
                )}
              />

              {/* UUID alanları */}
              <FormField control={form.control} name="customerId"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Müşteri UUID</FormLabel>
                    <FormControl><Input placeholder="550e8400-e29b-41d4-a716-..." {...field} /></FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField control={form.control} name="staffId"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Personel UUID</FormLabel>
                    <FormControl><Input placeholder="550e8400-e29b-41d4-a716-..." {...field} /></FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField control={form.control} name="locationId"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Lokasyon UUID</FormLabel>
                    <FormControl><Input placeholder="550e8400-e29b-41d4-a716-..." {...field} /></FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              {/* Kaynak */}
              <FormField control={form.control} name="source"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Kaynak</FormLabel>
                    <Select onValueChange={field.onChange} defaultValue={field.value}>
                      <FormControl>
                        <SelectTrigger>
                          <SelectValue placeholder="Kaynak seçin" />
                        </SelectTrigger>
                      </FormControl>
                      <SelectContent>
                        <SelectItem value="RECEPTIONIST">Resepsiyonist</SelectItem>
                        <SelectItem value="PHONE">Telefon</SelectItem>
                        <SelectItem value="WHATSAPP">WhatsApp</SelectItem>
                        <SelectItem value="ONLINE">Online</SelectItem>
                        <SelectItem value="WALK_IN">Kapıdan Gelen</SelectItem>
                        <SelectItem value="AI_ASSISTANT">Yapay Zeka</SelectItem>
                      </SelectContent>
                    </Select>
                    <FormMessage />
                  </FormItem>
                )}
              />

              {/* Fiyat / kaparo */}
              <div className="grid grid-cols-2 gap-4">
                <FormField control={form.control} name="totalPrice"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Toplam Fiyat</FormLabel>
                      <FormControl><Input type="number" min={0} step="0.01" {...field} /></FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <FormField control={form.control} name="depositPaid"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Kaparo</FormLabel>
                      <FormControl><Input type="number" min={0} step="0.01" {...field} /></FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              </div>

              {/* Notlar */}
              <FormField control={form.control} name="notes"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Notlar (opsiyonel)</FormLabel>
                    <FormControl><Input placeholder="Müşteri notu..." {...field} /></FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <Button
                type="submit"
                className="w-full"
                disabled={createAppointment.isPending}
              >
                {createAppointment.isPending ? (
                  <><Loader2 className="mr-2 h-4 w-4 animate-spin" /> Kaydediliyor…</>
                ) : (
                  'Randevu Oluştur'
                )}
              </Button>
            </form>
          </Form>
        </DialogContent>
      </Dialog>
    </div>
  );
}
