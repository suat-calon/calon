/**
 * DecisionPanel V3 — Closed Learning Loop Panel
 * FAZ UI-11.3: Outcome feedback, learning stats, hard dismiss
 */

import { cn } from '@/lib/utils';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Zap, CheckCircle2 } from 'lucide-react';
import { DecisionCard, DecisionCardSkeleton } from './decision-card';
import type { Decision } from '@/lib/decision-engine';

interface DecisionPanelProps {
  decisions: Decision[];
  onAction?: (decision: Decision) => void;
  onDismiss?: (id: string) => void;
  onDefer?: (id: string) => void;
  onHardDismiss?: (decision: Decision) => void;
  onOutcome?: (decisionId: string, result: 'success' | 'failed') => void;
  appliedIds?: Set<string>;
  /** IDs that already have outcome feedback */
  outcomeIds?: Set<string>;
  learningFeedback?: Map<string, string>;
  learningStats?: Map<string, { successCount: number; failCount: number }>;
  loading?: boolean;
  className?: string;
}

export function DecisionPanel({
  decisions,
  onAction,
  onDismiss,
  onDefer,
  onHardDismiss,
  onOutcome,
  appliedIds,
  outcomeIds,
  learningFeedback,
  learningStats,
  loading,
  className,
}: DecisionPanelProps) {
  if (loading) {
    return (
      <Card className={className}>
        <CardHeader className="pb-2">
          <CardTitle className="text-sm font-semibold">Öneriler</CardTitle>
        </CardHeader>
        <CardContent className="space-y-2">
          {[1, 2].map((i) => <DecisionCardSkeleton key={i} />)}
        </CardContent>
      </Card>
    );
  }

  if (decisions.length === 0) {
    return (
      <Card className={className}>
        <CardHeader className="pb-2">
          <CardTitle className="text-sm font-semibold">Öneriler</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex flex-col items-center py-6 text-center">
            <div className="rounded-full bg-green-50 p-3 mb-3">
              <CheckCircle2 className="h-5 w-5 text-green-600" />
            </div>
            <p className="text-sm font-medium text-muted-foreground">
              Şu anda önerilecek bir aksiyon yok
            </p>
            <p className="text-xs text-muted-foreground mt-1">
              Her şey yolunda görünüyor. Veriler değiştikçe öneriler burada belirecek.
            </p>
          </div>
        </CardContent>
      </Card>
    );
  }

  const highCount = decisions.filter((d) => d.priority === 'high').length;

  return (
    <Card className={cn(highCount > 0 && 'border-red-200', className)}>
      <CardHeader className="pb-2">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Zap className="h-4 w-4 text-primary" />
            <CardTitle className="text-sm font-semibold">Öneriler</CardTitle>
          </div>
          <div className="flex items-center gap-1.5">
            {highCount > 0 && (
              <Badge variant="destructive" className="text-[10px]">{highCount} acil</Badge>
            )}
            <Badge variant="outline" className="text-[10px]">{decisions.length}</Badge>
          </div>
        </div>
      </CardHeader>
      <CardContent className="space-y-2">
        {decisions.map((decision) => (
          <DecisionCard
            key={decision.id}
            decision={decision}
            onAction={onAction}
            onDismiss={onDismiss}
            onDefer={onDefer}
            onHardDismiss={onHardDismiss}
            onOutcome={onOutcome}
            isApplied={appliedIds?.has(decision.id) ?? false}
            hasOutcome={outcomeIds?.has(decision.id) ?? false}
            learningFeedback={learningFeedback?.get(decision.id)}
            learningStats={learningStats?.get(decision.id)}
          />
        ))}
      </CardContent>
    </Card>
  );
}
