/**
 * DecisionCard V3 — Closed Learning Loop
 * FAZ UI-11.3: Outcome feedback UI, learning stats, hard dismiss
 *
 * KURAL: 3 saniyede ne yapılacağı anlaşılmalı
 * KURAL: Tek CTA — aksiyonsuz insight YASAK
 * KURAL: Outcome UI olmadan faz FAIL
 */

import { useState } from 'react';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import {
  TrendingDown,
  Clock,
  Users,
  Scissors,
  Heart,
  TrendingUp,
  X,
  ArrowRight,
  Info,
  Clock3,
  Check,
  ThumbsUp,
  ThumbsDown,
  Ban,
} from 'lucide-react';
import type { Decision, DecisionType, DecisionPriority } from '@/lib/decision-engine';

// ── Visual mapping ───────────────────────────────────────────────────────────

const TYPE_ICONS: Record<DecisionType, React.ReactNode> = {
  revenue:    <TrendingDown className="h-4 w-4" />,
  capacity:   <Clock className="h-4 w-4" />,
  staff:      <Users className="h-4 w-4" />,
  service:    <Scissors className="h-4 w-4" />,
  retention:  <Heart className="h-4 w-4" />,
  growth:     <TrendingUp className="h-4 w-4" />,
};

const PRIORITY_STYLES: Record<DecisionPriority, {
  border: string;
  bg: string;
  iconBg: string;
  iconText: string;
  badge: 'destructive' | 'warning' | 'outline';
  badgeLabel: string;
}> = {
  high: {
    border: 'border-red-200',
    bg: 'bg-red-50/40',
    iconBg: 'bg-red-100',
    iconText: 'text-red-600',
    badge: 'destructive',
    badgeLabel: 'Acil',
  },
  medium: {
    border: 'border-yellow-200',
    bg: 'bg-yellow-50/40',
    iconBg: 'bg-yellow-100',
    iconText: 'text-yellow-700',
    badge: 'warning',
    badgeLabel: 'Önemli',
  },
  low: {
    border: 'border-border',
    bg: 'bg-background',
    iconBg: 'bg-muted',
    iconText: 'text-muted-foreground',
    badge: 'outline',
    badgeLabel: 'Öneri',
  },
};

const IMPACT_LABELS: Record<string, string> = {
  revenue: 'Gelir etkisi',
  efficiency: 'Verimlilik etkisi',
  retention: 'Müşteri etkisi',
};

// ── Component ─────────────────────────────────────────────────────────────────

interface DecisionCardProps {
  decision: Decision;
  onAction?: (decision: Decision) => void;
  onDismiss?: (id: string) => void;
  onDefer?: (id: string) => void;
  onHardDismiss?: (decision: Decision) => void;
  onOutcome?: (decisionId: string, result: 'success' | 'failed') => void;
  isApplied?: boolean;
  /** Has outcome been recorded already? */
  hasOutcome?: boolean;
  /** Learning feedback text from memory */
  learningFeedback?: string;
  /** Learning stats: { successCount, failCount } */
  learningStats?: { successCount: number; failCount: number } | null;
  className?: string;
}

export function DecisionCard({
  decision,
  onAction,
  onDismiss,
  onDefer,
  onHardDismiss,
  onOutcome,
  isApplied = false,
  hasOutcome = false,
  learningFeedback,
  learningStats,
  className,
}: DecisionCardProps) {
  const [showExplain, setShowExplain] = useState(false);
  const [outcomeGiven, setOutcomeGiven] = useState(false);
  const style = PRIORITY_STYLES[decision.priority];

  const handleOutcome = (result: 'success' | 'failed') => {
    onOutcome?.(decision.id, result);
    setOutcomeGiven(true);
  };

  return (
    <div
      className={cn(
        'rounded-lg border p-3 transition-colors',
        isApplied ? 'border-green-200 bg-green-50/30' : [style.border, style.bg],
        className,
      )}
    >
      <div className="flex items-start gap-3">
        {/* Icon */}
        <div className={cn(
          'shrink-0 rounded-lg p-2',
          isApplied ? 'bg-green-100 text-green-600' : [style.iconBg, style.iconText],
        )}>
          {isApplied ? <Check className="h-4 w-4" /> : TYPE_ICONS[decision.type]}
        </div>

        {/* Content */}
        <div className="flex-1 min-w-0">
          {/* Header */}
          <div className="flex items-center gap-2 mb-1">
            <h4 className="text-sm font-semibold leading-tight truncate">
              {decision.title}
            </h4>
            <Badge variant={isApplied ? 'outline' : style.badge} className="text-[10px] px-1.5 py-0 shrink-0">
              {isApplied ? 'Uygulandı' : style.badgeLabel}
            </Badge>
          </div>

          {/* Description */}
          <p className="text-xs text-muted-foreground leading-relaxed mb-1.5">
            {decision.description}
          </p>

          {/* Reason */}
          <p className="text-[10px] text-muted-foreground/80 italic mb-2">
            {decision.reason}
          </p>

          {/* Explainability toggle */}
          {showExplain && (
            <p className="text-[10px] text-blue-700 bg-blue-50 rounded px-2 py-1 mb-2">
              {decision.explainability}
            </p>
          )}

          {/* Learning feedback — real memory */}
          {learningFeedback && !isApplied && (
            <p className="text-[10px] text-purple-700 bg-purple-50 rounded px-2 py-1 mb-2">
              📊 {learningFeedback}
            </p>
          )}

          {/* Learning stats (TASK 9) */}
          {learningStats && (learningStats.successCount > 0 || learningStats.failCount > 0) && (
            <div className="flex items-center gap-3 text-[10px] text-muted-foreground mb-2">
              <span className="flex items-center gap-0.5">
                <ThumbsUp className="h-2.5 w-2.5 text-green-600" />
                {learningStats.successCount}
              </span>
              <span className="flex items-center gap-0.5">
                <ThumbsDown className="h-2.5 w-2.5 text-red-500" />
                {learningStats.failCount}
              </span>
            </div>
          )}

          {/* Impact + actions row */}
          <div className="flex items-center justify-between gap-2 flex-wrap">
            <div className="flex items-center gap-1.5">
              <Badge variant="outline" className="text-[10px] px-1.5 py-0">
                {IMPACT_LABELS[decision.impact.type] ?? decision.impact.type}
              </Badge>
              <button
                type="button"
                onClick={() => setShowExplain((v) => !v)}
                className="text-[10px] text-muted-foreground hover:text-foreground flex items-center gap-0.5"
                aria-label="Neden bu öneriyi görüyorum"
              >
                <Info className="h-3 w-3" />
                <span className="hidden sm:inline">{showExplain ? 'Gizle' : 'Neden?'}</span>
              </button>
            </div>

            <div className="flex items-center gap-1">
              {/* Defer */}
              {onDefer && !isApplied && (
                <Button size="sm" variant="ghost" className="h-7 text-xs gap-1 text-muted-foreground" onClick={() => onDefer(decision.id)}>
                  <Clock3 className="h-3 w-3" />
                  <span className="hidden sm:inline">Sonra</span>
                </Button>
              )}
              {/* CTA */}
              {!isApplied && (
                <Button
                  size="sm"
                  variant={decision.priority === 'high' ? 'default' : 'outline'}
                  className="h-7 text-xs gap-1"
                  onClick={() => onAction?.(decision)}
                >
                  {decision.action.label}
                  <ArrowRight className="h-3 w-3" />
                </Button>
              )}
            </div>
          </div>

          {/* ── OUTCOME FEEDBACK UI (TASK 1 — ZORUNLU) ───────────────── */}
          {isApplied && !hasOutcome && !outcomeGiven && onOutcome && (
            <div className="flex items-center gap-2 mt-3 pt-2 border-t border-green-200">
              <span className="text-[11px] text-muted-foreground">Bu öneri işe yaradı mı?</span>
              <Button
                size="sm"
                variant="outline"
                className="h-6 text-[10px] gap-1 border-green-300 text-green-700 hover:bg-green-50"
                onClick={() => handleOutcome('success')}
              >
                <ThumbsUp className="h-3 w-3" /> Evet
              </Button>
              <Button
                size="sm"
                variant="outline"
                className="h-6 text-[10px] gap-1 border-red-200 text-red-600 hover:bg-red-50"
                onClick={() => handleOutcome('failed')}
              >
                <ThumbsDown className="h-3 w-3" /> Hayır
              </Button>
            </div>
          )}

          {/* Outcome recorded confirmation */}
          {isApplied && (hasOutcome || outcomeGiven) && (
            <p className="text-[10px] text-green-700 bg-green-50 rounded px-2 py-1 mt-2">
              ✓ Geri bildiriminiz kaydedildi
            </p>
          )}

          {/* Applied feedback (when no outcome yet) */}
          {isApplied && !hasOutcome && !outcomeGiven && decision.impact.feedback && (
            <p className="text-[10px] text-green-700/70 mt-1">
              {decision.impact.feedback}
            </p>
          )}
        </div>

        {/* Dismiss actions */}
        {!isApplied && (
          <div className="flex flex-col gap-1 shrink-0">
            {onDismiss && (
              <button
                type="button"
                onClick={() => onDismiss(decision.id)}
                className="rounded p-0.5 hover:bg-accent text-muted-foreground"
                aria-label="Öneriyi kapat"
              >
                <X className="h-3.5 w-3.5" />
              </button>
            )}
            {onHardDismiss && (
              <button
                type="button"
                onClick={() => onHardDismiss(decision)}
                className="rounded p-0.5 hover:bg-red-50 text-muted-foreground hover:text-red-500"
                aria-label="Bir daha gösterme"
                title="Bu öneriyi bir daha gösterme"
              >
                <Ban className="h-3 w-3" />
              </button>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

// ── Skeleton ──────────────────────────────────────────────────────────────────

export function DecisionCardSkeleton() {
  return (
    <div className="rounded-lg border p-3">
      <div className="flex items-start gap-3">
        <div className="w-8 h-8 rounded-lg bg-muted shimmer shrink-0" />
        <div className="flex-1 space-y-2">
          <div className="h-4 w-48 rounded bg-muted shimmer" />
          <div className="h-3 w-64 rounded bg-muted shimmer" />
          <div className="h-3 w-32 rounded bg-muted shimmer" />
          <div className="flex items-center justify-between">
            <div className="h-4 w-20 rounded bg-muted shimmer" />
            <div className="h-7 w-32 rounded bg-muted shimmer" />
          </div>
        </div>
      </div>
    </div>
  );
}
