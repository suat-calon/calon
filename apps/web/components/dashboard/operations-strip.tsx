/**
 * OperationsStrip — Daily operations narrative strip
 * TASK 3: "Bugün operasyon" strip — durumu anlatsın, sadece sayı göstermesin
 */

import { cn } from '@/lib/utils';
import {
  Activity,
  Clock,
  AlertTriangle,
  UserX,
  CalendarOff,
} from 'lucide-react';
import type { OperationsStrip as OperationsStripType } from '@/lib/dashboard-mock';

const ICONS = [
  <Activity key="a" className="h-3.5 w-3.5" />,
  <Clock key="c" className="h-3.5 w-3.5" />,
  <AlertTriangle key="t" className="h-3.5 w-3.5" />,
  <UserX key="u" className="h-3.5 w-3.5" />,
  <CalendarOff key="o" className="h-3.5 w-3.5" />,
];

function getIconForNarrative(text: string, index: number): React.ReactNode {
  if (text.includes('aktif')) return <Activity className="h-3.5 w-3.5 text-primary" />;
  if (text.includes('gelecek') || text.includes('dakika')) return <Clock className="h-3.5 w-3.5 text-blue-500" />;
  if (text.includes('gecikti')) return <AlertTriangle className="h-3.5 w-3.5 text-yellow-600" />;
  if (text.includes('gelmedi')) return <UserX className="h-3.5 w-3.5 text-red-500" />;
  if (text.includes('boş') || text.includes('ekstra')) return <CalendarOff className="h-3.5 w-3.5 text-muted-foreground" />;
  return ICONS[index % ICONS.length];
}

function getColorForNarrative(text: string): string {
  if (text.includes('gecikti')) return 'text-yellow-700';
  if (text.includes('gelmedi')) return 'text-red-700';
  return 'text-foreground';
}

interface OperationsStripProps {
  data: OperationsStripType;
  className?: string;
  loading?: boolean;
}

export function OperationsStrip({ data, className, loading }: OperationsStripProps) {
  if (loading) {
    return (
      <div className={cn('rounded-lg border bg-card p-3', className)}>
        <div className="flex flex-wrap gap-3">
          {Array.from({ length: 3 }).map((_, i) => (
            <div key={i} className="flex items-center gap-1.5">
              <div className="h-3.5 w-3.5 rounded bg-muted shimmer" />
              <div className="h-3 w-32 rounded bg-muted shimmer" />
            </div>
          ))}
        </div>
      </div>
    );
  }

  if (data.narratives.length === 0) return null;

  // Single narrative = calm day, no problems
  const isCalm = data.delayed === 0 && data.noShows === 0 && data.activeNow === 0;

  return (
    <div className={cn(
      'rounded-lg border bg-card px-4 py-3',
      !isCalm && 'border-primary/20',
      className,
    )}>
      <div className="flex flex-wrap gap-x-4 gap-y-1.5">
        {data.narratives.map((text, i) => (
          <div key={i} className="flex items-center gap-1.5">
            {getIconForNarrative(text, i)}
            <span className={cn('text-xs font-medium', getColorForNarrative(text))}>
              {text}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}
