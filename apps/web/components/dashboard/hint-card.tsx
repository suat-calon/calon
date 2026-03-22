/**
 * HintCard — Non-intrusive heuristic suggestion card
 * TASK 7: FAKE AI YASAK — basit heuristik öneriler
 */

import { cn } from '@/lib/utils';
import { Lightbulb, X } from 'lucide-react';

export interface Hint {
  id: string;
  message: string;
  type: 'revenue' | 'capacity' | 'retention';
}

interface HintCardProps {
  hint: Hint;
  onDismiss?: (id: string) => void;
  className?: string;
}

export function HintCard({ hint, onDismiss, className }: HintCardProps) {
  return (
    <div className={cn(
      'flex items-start gap-2 rounded-lg border border-blue-100 bg-blue-50/50 px-3 py-2 text-xs',
      className,
    )}>
      <Lightbulb className="h-3.5 w-3.5 text-blue-500 shrink-0 mt-0.5" />
      <p className="flex-1 text-blue-800 leading-relaxed">{hint.message}</p>
      {onDismiss && (
        <button
          type="button"
          onClick={() => onDismiss(hint.id)}
          className="shrink-0 rounded p-0.5 hover:bg-blue-100 text-blue-400"
          aria-label="Öneriyi kapat"
        >
          <X className="h-3 w-3" />
        </button>
      )}
    </div>
  );
}

/**
 * Generate hints from data — simple heuristics, no fake AI
 */
export function generateHints(data: {
  occupancyPercent: number;
  noShowCount: number;
  topServiceRevenue?: { name: string; pct: number };
  emptySlotCount: number;
}): Hint[] {
  const hints: Hint[] = [];

  if (data.occupancyPercent < 60) {
    hints.push({
      id: 'hint-low-occ',
      message: 'Doluluk oranı düşük. Boş saatlerde kısa süreli kampanya düşünebilirsiniz.',
      type: 'capacity',
    });
  }

  if (data.noShowCount >= 2) {
    hints.push({
      id: 'hint-noshow',
      message: `Bugün ${data.noShowCount} no-show var. SMS/WhatsApp hatırlatma sistemi ile no-show oranını düşürebilirsiniz.`,
      type: 'retention',
    });
  }

  if (data.topServiceRevenue && data.topServiceRevenue.pct > 60) {
    hints.push({
      id: 'hint-single-service',
      message: `Gelirin %${data.topServiceRevenue.pct}'ı ${data.topServiceRevenue.name} hizmetinden geliyor. Farklı hizmetleri öne çıkararak gelir çeşitliliğini artırabilirsiniz.`,
      type: 'revenue',
    });
  }

  if (data.emptySlotCount >= 3) {
    hints.push({
      id: 'hint-empty-slots',
      message: `${data.emptySlotCount} boş slot var. Sosyal medyada "son dakika randevusu" paylaşımı yapabilirsiniz.`,
      type: 'capacity',
    });
  }

  return hints;
}
