/**
 * LifecycleHint — Customer lifecycle insights
 * FAZ UI-12 TASK 6: Basit heuristik müşteri lifecycle notları
 *
 * KURAL: Fake AI YASAK — basit gözlem metinleri
 * KURAL: Intrusive değil, küçük hint card
 */

import { cn } from '@/lib/utils';
import { Clock, User, Star, Gift, X } from 'lucide-react';
import type { LifecycleHint as LifecycleHintType } from '@/lib/dashboard-mock';

const HINT_CONFIG: Record<LifecycleHintType['type'], {
  icon: React.ReactNode;
  borderColor: string;
  bgColor: string;
  textColor: string;
}> = {
  dormant:       { icon: <Clock className="h-3.5 w-3.5" />, borderColor: 'border-yellow-200', bgColor: 'bg-yellow-50/50', textColor: 'text-yellow-800' },
  one_time:      { icon: <User className="h-3.5 w-3.5" />, borderColor: 'border-slate-200', bgColor: 'bg-slate-50/50', textColor: 'text-slate-700' },
  loyal_upsell:  { icon: <Star className="h-3.5 w-3.5" />, borderColor: 'border-green-200', bgColor: 'bg-green-50/50', textColor: 'text-green-800' },
  birthday:      { icon: <Gift className="h-3.5 w-3.5" />, borderColor: 'border-pink-200', bgColor: 'bg-pink-50/50', textColor: 'text-pink-800' },
};

interface LifecycleHintCardProps {
  hint: LifecycleHintType;
  onDismiss?: (id: string) => void;
  className?: string;
}

export function LifecycleHintCard({ hint, onDismiss, className }: LifecycleHintCardProps) {
  const config = HINT_CONFIG[hint.type];

  return (
    <div className={cn(
      'flex items-start gap-2 rounded-lg border px-3 py-2 text-xs',
      config.borderColor,
      config.bgColor,
      className,
    )}>
      <span className={cn('shrink-0 mt-0.5', config.textColor)}>{config.icon}</span>
      <div className="flex-1 min-w-0">
        <span className={cn('font-medium', config.textColor)}>{hint.customerName}: </span>
        <span className={cn('leading-relaxed', config.textColor)}>{hint.message}</span>
      </div>
      {onDismiss && (
        <button
          type="button"
          onClick={() => onDismiss(hint.id)}
          className="shrink-0 rounded p-0.5 hover:bg-accent text-muted-foreground"
          aria-label="İpucunu kapat"
        >
          <X className="h-3 w-3" />
        </button>
      )}
    </div>
  );
}
