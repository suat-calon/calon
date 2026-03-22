/**
 * AlertBar — Conditional top bar for critical alerts
 * Supports warning, danger, info types
 * Multi-alert stack support via parent composition
 */

import { AlertTriangle, AlertCircle, Info, X } from 'lucide-react';
import { cn } from '@/lib/utils';
import type { DashboardAlert } from '@/lib/dashboard-mock';

const CONFIG = {
  warning: {
    bg:   'bg-yellow-50 border-yellow-200',
    text: 'text-yellow-800',
    icon: AlertTriangle,
  },
  danger: {
    bg:   'bg-red-50 border-red-200',
    text: 'text-red-800',
    icon: AlertCircle,
  },
  info: {
    bg:   'bg-blue-50 border-blue-200',
    text: 'text-blue-800',
    icon: Info,
  },
} as const;

interface AlertBarProps {
  alert: DashboardAlert;
  onDismiss?: (id: string) => void;
  className?: string;
}

export function AlertBar({ alert, onDismiss, className }: AlertBarProps) {
  const cfg = CONFIG[alert.type];
  const Icon = cfg.icon;

  return (
    <div
      className={cn(
        'flex items-center gap-2 rounded-lg border px-3 py-2 text-sm animate-in fade-in slide-in-from-top-1 duration-200',
        cfg.bg,
        cfg.text,
        className,
      )}
      role="alert"
    >
      <Icon className="h-4 w-4 shrink-0" />
      <span className="flex-1 min-w-0 truncate sm:whitespace-normal">{alert.message}</span>
      {alert.action && (
        <a
          href={alert.action.href}
          className="shrink-0 text-xs font-semibold underline underline-offset-2 hover:no-underline"
        >
          {alert.action.label}
        </a>
      )}
      {onDismiss && (
        <button
          type="button"
          onClick={() => onDismiss(alert.id)}
          className="shrink-0 rounded p-0.5 hover:bg-black/5"
          aria-label="Kapat"
        >
          <X className="h-3.5 w-3.5" />
        </button>
      )}
    </div>
  );
}

/** Error-level alert bar for global fetch failures */
export function ErrorBar({
  message = 'Veriler yüklenirken sorun oluştu',
  onRetry,
  className,
}: {
  message?: string;
  onRetry?: () => void;
  className?: string;
}) {
  return (
    <div
      className={cn(
        'flex items-center gap-2 rounded-lg border px-3 py-2 text-sm',
        'bg-red-50 border-red-200 text-red-800',
        className,
      )}
      role="alert"
    >
      <AlertCircle className="h-4 w-4 shrink-0" />
      <span className="flex-1">{message}</span>
      {onRetry && (
        <button
          type="button"
          onClick={onRetry}
          className="shrink-0 text-xs font-semibold underline underline-offset-2 hover:no-underline"
        >
          Yeniden dene
        </button>
      )}
    </div>
  );
}
