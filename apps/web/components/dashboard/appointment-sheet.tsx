/**
 * AppointmentSheet — Side drawer for appointment detail + quick actions
 * TASK 6: Full sayfa geçiş yapmadan operasyon çözmek
 */

'use client';

import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetDescription,
} from '@/components/ui/sheet';
import { Badge }  from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Phone, FileText, Clock, User, Scissors, CreditCard } from 'lucide-react';
import { StatusActionGroup } from './status-action-group';
import type { AppointmentOp, AppointmentStatus } from '@/lib/dashboard-mock';

const STATUS_LABELS: Record<AppointmentStatus, string> = {
  PENDING:    'Onay Bekliyor',
  CONFIRMED:  'Onaylandı',
  CHECKED_IN: 'Salona Geldi',
  IN_SERVICE: 'Hizmette',
  COMPLETED:  'Tamamlandı',
  CANCELLED:  'İptal Edildi',
  NO_SHOW:    'Gelmedi',
};

const STATUS_BADGE: Record<AppointmentStatus, 'default' | 'secondary' | 'destructive' | 'success' | 'warning' | 'info' | 'outline'> = {
  PENDING: 'warning', CONFIRMED: 'info', CHECKED_IN: 'info',
  IN_SERVICE: 'default', COMPLETED: 'success', CANCELLED: 'destructive', NO_SHOW: 'destructive',
};

function formatTime(iso: string): string {
  try {
    return new Date(iso).toLocaleTimeString('tr-TR', { hour: '2-digit', minute: '2-digit' });
  } catch {
    return '--:--';
  }
}

function formatCurrency(amount: number, currency: string): string {
  return new Intl.NumberFormat('tr-TR', { style: 'currency', currency, maximumFractionDigits: 0 }).format(amount);
}

interface AppointmentSheetProps {
  appointment: AppointmentOp | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onStatusChange: (id: string, newStatus: AppointmentStatus) => void;
}

export function AppointmentSheet({ appointment, open, onOpenChange, onStatusChange }: AppointmentSheetProps) {
  if (!appointment) return null;

  const apt = appointment;

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="right" className="w-full sm:max-w-md overflow-y-auto">
        <SheetHeader className="pb-4">
          <div className="flex items-center gap-2">
            <SheetTitle className="text-lg">{apt.customerName}</SheetTitle>
            <Badge variant={STATUS_BADGE[apt.status]} className="text-xs">
              {STATUS_LABELS[apt.status]}
            </Badge>
          </div>
          <SheetDescription>
            {formatTime(apt.startTime)}–{formatTime(apt.endTime)} · {apt.serviceName}
          </SheetDescription>
        </SheetHeader>

        {/* Detail fields */}
        <div className="space-y-4 mt-2">
          <DetailRow icon={<User className="h-4 w-4" />} label="Müşteri" value={apt.customerName} />
          <DetailRow
            icon={<Phone className="h-4 w-4" />}
            label="Telefon"
            value={apt.customerPhone}
            action={
              <Button size="sm" variant="outline" className="h-7 text-xs" asChild>
                <a href={`tel:${apt.customerPhone.replace(/\s/g, '')}`}>Müşteriyi ara</a>
              </Button>
            }
          />
          <DetailRow icon={<Scissors className="h-4 w-4" />} label="Hizmet" value={apt.serviceName} />
          <DetailRow icon={<User className="h-4 w-4" />} label="Uzman" value={apt.staffName} />
          <DetailRow icon={<Clock className="h-4 w-4" />} label="Saat" value={`${formatTime(apt.startTime)} – ${formatTime(apt.endTime)}`} />
          <DetailRow icon={<CreditCard className="h-4 w-4" />} label="Ücret" value={formatCurrency(apt.price, apt.currency)} />

          {apt.note && (
            <DetailRow icon={<FileText className="h-4 w-4" />} label="Not" value={apt.note} />
          )}

          {apt.isDelayed && (
            <div className="rounded-md bg-yellow-50 border border-yellow-200 px-3 py-2 text-xs text-yellow-800">
              ⚠ Müşteri gecikti — randevu saati geçmiş, henüz gelmedi.
            </div>
          )}
        </div>

        {/* Quick actions */}
        <div className="mt-6 pt-4 border-t">
          <p className="text-xs font-medium text-muted-foreground mb-3">Hızlı İşlemler</p>
          <StatusActionGroup
            currentStatus={apt.status}
            onStatusChange={(newStatus) => onStatusChange(apt.id, newStatus)}
          />
        </div>
      </SheetContent>
    </Sheet>
  );
}

function DetailRow({
  icon,
  label,
  value,
  action,
}: {
  icon: React.ReactNode;
  label: string;
  value: string;
  action?: React.ReactNode;
}) {
  return (
    <div className="flex items-start gap-3">
      <div className="mt-0.5 text-muted-foreground shrink-0">{icon}</div>
      <div className="flex-1 min-w-0">
        <p className="text-xs text-muted-foreground">{label}</p>
        <p className="text-sm font-medium">{value}</p>
      </div>
      {action && <div className="shrink-0 mt-2">{action}</div>}
    </div>
  );
}
