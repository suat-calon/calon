'use client';

import { useState, useCallback } from 'react';
import {
  UserCog, AlertCircle, Loader2, Clock, Pencil, Check,
} from 'lucide-react';

import { Badge }  from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input }  from '@/components/ui/input';
import {
  Sheet, SheetContent, SheetHeader, SheetTitle, SheetDescription,
} from '@/components/ui/sheet';
import { toast } from '@/hooks/use-toast';
import {
  useStaff, useSetWorkingHours,
  type StaffMember, type WorkingHourEntry,
} from '@/hooks/api/use-staff';

// ── Constants ──────────────────────────────────────────────────────────────────

const DAYS: { key: string; label: string }[] = [
  { key: 'MON', label: 'Pazartesi' },
  { key: 'TUE', label: 'Salı' },
  { key: 'WED', label: 'Çarşamba' },
  { key: 'THU', label: 'Perşembe' },
  { key: 'FRI', label: 'Cuma' },
  { key: 'SAT', label: 'Cumartesi' },
  { key: 'SUN', label: 'Pazar' },
];

const DAY_SHORT: Record<string, string> = {
  MON: 'Pzt', TUE: 'Sal', WED: 'Çar', THU: 'Per',
  FRI: 'Cum', SAT: 'Cmt', SUN: 'Paz',
};

const DEFAULT_HOURS: WorkingHourEntry[] = DAYS.map((d) => ({
  dayOfWeek: d.key,
  startTime: '09:00',
  endTime: '18:00',
  isWorkingDay: d.key !== 'SUN',
  breakStart: '12:00',
  breakEnd: '13:00',
}));

// ── Main ───────────────────────────────────────────────────────────────────────

export default function StaffPage() {
  const { data, isLoading, error } = useStaff();
  const staff = data?.data ?? [];
  const [editingStaff, setEditingStaff] = useState<StaffMember | null>(null);

  return (
    <div className="space-y-5 max-w-5xl">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold tracking-tight">Personel</h1>
        <span className="text-sm text-muted-foreground">{data ? `${data.total} personel` : ''}</span>
      </div>

      {error ? (
        <div className="flex items-center gap-2 text-destructive py-8 justify-center">
          <AlertCircle className="h-5 w-5" /><span>Yüklenemedi. Lütfen sayfayı yenileyin.</span>
        </div>
      ) : isLoading ? (
        <div className="flex justify-center py-12"><Loader2 className="h-6 w-6 animate-spin text-primary" /></div>
      ) : staff.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-16 text-center">
          <div className="p-3 rounded-xl bg-muted mb-3"><UserCog className="h-6 w-6 text-muted-foreground/50" /></div>
          <p className="text-sm text-muted-foreground">Henüz personel bulunmuyor.</p>
          <p className="text-xs text-muted-foreground mt-1">Online booking için en az bir personel gereklidir.</p>
        </div>
      ) : (
        <div className="space-y-2">
          {staff.map((s) => {
            const workingDays = (s.workingHours ?? []).filter((w) => w.isWorkingDay).map((w) => DAY_SHORT[w.dayOfWeek] ?? w.dayOfWeek);
            const firstWorking = (s.workingHours ?? []).find((w) => w.isWorkingDay);

            return (
              <div key={s.id} className="bg-white rounded-xl border shadow-sm px-4 py-3 flex items-center gap-4 hover:shadow-md transition-shadow group">
                <div className="w-10 h-10 rounded-full flex items-center justify-center text-white text-sm font-semibold shrink-0"
                  style={{ backgroundColor: s.colorHex ?? '#6366f1' }}>
                  {s.firstName[0]}{s.lastName[0]}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="text-sm font-semibold truncate">{s.firstName} {s.lastName}</span>
                    {s.title && <span className="text-[10px] text-muted-foreground">{s.title}</span>}
                    <Badge variant={s.isActive ? 'success' : 'secondary'} className="text-[9px] px-1.5 py-0">
                      {s.isActive ? 'Aktif' : 'Pasif'}
                    </Badge>
                  </div>
                  <div className="flex items-center gap-3 text-xs text-muted-foreground mt-0.5">
                    <span className="flex items-center gap-1">
                      <Clock className="h-3 w-3" />
                      {workingDays.length > 0 ? workingDays.join(', ') : 'Çalışma saati yok'}
                    </span>
                    {firstWorking && <span>{firstWorking.startTime}–{firstWorking.endTime}</span>}
                  </div>
                </div>
                <Button variant="ghost" size="sm" className="opacity-0 group-hover:opacity-100 transition-opacity"
                  onClick={() => setEditingStaff(s)}>
                  <Pencil className="h-3.5 w-3.5 mr-1" />Saatler
                </Button>
              </div>
            );
          })}
        </div>
      )}

      {/* Working Hours Sheet */}
      <Sheet open={!!editingStaff} onOpenChange={(open) => { if (!open) setEditingStaff(null); }}>
        <SheetContent className="overflow-y-auto sm:max-w-lg">
          {editingStaff && (
            <WorkingHoursEditor staff={editingStaff} onClose={() => setEditingStaff(null)} />
          )}
        </SheetContent>
      </Sheet>
    </div>
  );
}

// ── Working Hours Editor ────────────────────────────────────────────────────

function WorkingHoursEditor({ staff, onClose }: { staff: StaffMember; onClose: () => void }) {
  const setHours = useSetWorkingHours();

  // Initialize from existing or defaults
  const [hours, setLocalHours] = useState<WorkingHourEntry[]>(() => {
    if (staff.workingHours && staff.workingHours.length > 0) {
      return DAYS.map((d) => {
        const existing = staff.workingHours!.find((w) => w.dayOfWeek === d.key);
        return existing
          ? { dayOfWeek: d.key, startTime: existing.startTime, endTime: existing.endTime, isWorkingDay: existing.isWorkingDay, breakStart: existing.breakStart ?? '', breakEnd: existing.breakEnd ?? '' }
          : { dayOfWeek: d.key, startTime: '09:00', endTime: '18:00', isWorkingDay: false, breakStart: '', breakEnd: '' };
      });
    }
    return DEFAULT_HOURS.map((h) => ({ ...h }));
  });

  const updateDay = useCallback((idx: number, field: keyof WorkingHourEntry, value: string | boolean) => {
    setLocalHours((prev) => prev.map((h, i) => i === idx ? { ...h, [field]: value } : h));
  }, []);

  const handleSave = useCallback(async () => {
    try {
      const payload = hours.map((h) => ({
        dayOfWeek: h.dayOfWeek,
        startTime: h.startTime,
        endTime: h.endTime,
        isWorkingDay: h.isWorkingDay,
        ...(h.breakStart ? { breakStart: h.breakStart } : {}),
        ...(h.breakEnd ? { breakEnd: h.breakEnd } : {}),
      }));
      await setHours.mutateAsync({ staffId: staff.id, hours: payload });
      toast({ title: 'Kaydedildi', description: `${staff.firstName} ${staff.lastName} çalışma saatleri güncellendi.` });
      onClose();
    } catch {
      toast({ variant: 'destructive', title: 'Hata', description: 'Çalışma saatleri kaydedilemedi.' });
    }
  }, [hours, staff, setHours, onClose]);

  return (
    <>
      <SheetHeader>
        <SheetTitle>{staff.firstName} {staff.lastName} — Çalışma Saatleri</SheetTitle>
        <SheetDescription>Haftalık çalışma programını düzenleyin. Değişiklikler müsaitlik takvimini etkiler.</SheetDescription>
      </SheetHeader>
      <div className="mt-6 space-y-3">
        {hours.map((h, idx) => {
          const day = DAYS.find((d) => d.key === h.dayOfWeek);
          return (
            <div key={h.dayOfWeek} className={`rounded-lg border p-3 transition-colors ${h.isWorkingDay ? 'bg-white' : 'bg-muted/50'}`}>
              <div className="flex items-center gap-3">
                <label className="flex items-center gap-2 cursor-pointer min-w-[100px]">
                  <input type="checkbox" checked={h.isWorkingDay} onChange={(e) => updateDay(idx, 'isWorkingDay', e.target.checked)}
                    className="rounded border-gray-300 text-primary focus:ring-primary" />
                  <span className={`text-sm font-medium ${h.isWorkingDay ? '' : 'text-muted-foreground'}`}>{day?.label}</span>
                </label>
                {h.isWorkingDay && (
                  <div className="flex items-center gap-1.5 flex-1">
                    <Input type="time" value={h.startTime} onChange={(e) => updateDay(idx, 'startTime', e.target.value)} className="h-8 text-xs w-24" />
                    <span className="text-muted-foreground text-xs">–</span>
                    <Input type="time" value={h.endTime} onChange={(e) => updateDay(idx, 'endTime', e.target.value)} className="h-8 text-xs w-24" />
                  </div>
                )}
                {!h.isWorkingDay && <span className="text-xs text-muted-foreground italic">Kapalı</span>}
              </div>
              {h.isWorkingDay && (
                <div className="flex items-center gap-1.5 mt-2 ml-[100px]">
                  <span className="text-[10px] text-muted-foreground w-10">Mola:</span>
                  <Input type="time" value={h.breakStart ?? ''} onChange={(e) => updateDay(idx, 'breakStart', e.target.value)} className="h-7 text-xs w-24" placeholder="Yok" />
                  <span className="text-muted-foreground text-xs">–</span>
                  <Input type="time" value={h.breakEnd ?? ''} onChange={(e) => updateDay(idx, 'breakEnd', e.target.value)} className="h-7 text-xs w-24" placeholder="Yok" />
                </div>
              )}
            </div>
          );
        })}
        <Button className="w-full mt-4" onClick={handleSave} disabled={setHours.isPending}>
          {setHours.isPending ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Check className="mr-2 h-4 w-4" />}
          Kaydet
        </Button>
      </div>
    </>
  );
}
