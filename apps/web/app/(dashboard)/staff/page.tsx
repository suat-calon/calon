'use client';

import { UserCog, AlertCircle } from 'lucide-react';

import {
  Card, CardContent, CardHeader, CardTitle,
} from '@/components/ui/card';
import { Badge }          from '@/components/ui/badge';
import { useStaff }       from '@/hooks/api/use-staff';

const DAY_LABELS: Record<string, string> = {
  MON: 'Pzt', TUE: 'Sal', WED: 'Çar', THU: 'Per',
  FRI: 'Cum', SAT: 'Cmt', SUN: 'Paz',
};

export default function StaffPage() {
  const { data, isLoading, error } = useStaff();
  const staff = data?.data ?? [];

  return (
    <div className="space-y-6 max-w-6xl">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold tracking-tight">Personel</h1>
        <span className="text-sm text-muted-foreground">
          {data ? `${data.total} personel` : ''}
        </span>
      </div>

      {error ? (
        <div className="flex items-center gap-2 text-destructive text-sm py-4">
          <AlertCircle className="h-4 w-4" />
          Personel listesi yüklenemedi.
        </div>
      ) : isLoading ? (
        <div className="flex justify-center py-8">
          <div className="h-6 w-6 animate-spin rounded-full border-4 border-primary border-t-transparent" />
        </div>
      ) : staff.length === 0 ? (
        <p className="text-muted-foreground text-sm py-6 text-center">
          Henüz personel bulunmuyor.
        </p>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {staff.map((s) => {
            const workingDays = (s.workingHours ?? [])
              .filter((w) => w.isWorkingDay)
              .map((w) => DAY_LABELS[w.dayOfWeek] ?? w.dayOfWeek);

            return (
              <Card key={s.id}>
                <CardHeader className="pb-3">
                  <div className="flex items-center gap-3">
                    <div
                      className="w-10 h-10 rounded-full flex items-center justify-center text-white text-sm font-semibold"
                      style={{ backgroundColor: s.colorHex ?? '#6366f1' }}
                    >
                      {s.firstName[0]}{s.lastName[0]}
                    </div>
                    <div className="flex-1 min-w-0">
                      <CardTitle className="text-base">
                        {s.firstName} {s.lastName}
                      </CardTitle>
                      {s.title && (
                        <p className="text-xs text-muted-foreground">{s.title}</p>
                      )}
                    </div>
                    <Badge variant={s.isActive ? 'success' : 'secondary'} className="text-xs">
                      {s.isActive ? 'Aktif' : 'Pasif'}
                    </Badge>
                  </div>
                </CardHeader>
                <CardContent className="pt-0">
                  <div className="flex items-center gap-4 text-xs text-muted-foreground">
                    <span>Komisyon: %{s.commissionRate}</span>
                    <span>Çalışma: {workingDays.length > 0 ? workingDays.join(', ') : '-'}</span>
                  </div>
                  {s.workingHours && s.workingHours.length > 0 && (
                    <p className="text-xs text-muted-foreground mt-1">
                      Saat: {s.workingHours.find((w) => w.isWorkingDay)?.startTime ?? '-'} - {s.workingHours.find((w) => w.isWorkingDay)?.endTime ?? '-'}
                    </p>
                  )}
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}
    </div>
  );
}
