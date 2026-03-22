/**
 * SafeBlock — Error Boundary per Dashboard Block
 * FAZ UI-13 TASK 6: Each dashboard section wrapped in error boundary
 *
 * KURAL: Bir blok crash olursa sadece o blok hata gösterir, sayfa ayakta kalır
 */

'use client';

import React, { Component, type ErrorInfo, type ReactNode } from 'react';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { AlertTriangle, RefreshCw } from 'lucide-react';
import { trackError } from '@/lib/telemetry';

interface SafeBlockProps {
  /** Block name for error reporting */
  name: string;
  children: ReactNode;
  /** Optional fallback UI */
  fallback?: ReactNode;
  /** Optional className for wrapper */
  className?: string;
}

interface SafeBlockState {
  hasError: boolean;
  error?: Error;
}

export class SafeBlock extends Component<SafeBlockProps, SafeBlockState> {
  constructor(props: SafeBlockProps) {
    super(props);
    this.state = { hasError: false };
  }

  static getDerivedStateFromError(error: Error): SafeBlockState {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, info: ErrorInfo): void {
    trackError('ui', `block_crash:${this.props.name}`, error, {
      componentStack: info.componentStack ?? undefined,
    });
  }

  handleRetry = (): void => {
    this.setState({ hasError: false, error: undefined });
  };

  render(): ReactNode {
    if (this.state.hasError) {
      if (this.props.fallback) return this.props.fallback;

      return (
        <Card className={this.props.className}>
          <CardContent className="py-6">
            <div className="flex flex-col items-center text-center gap-2">
              <div className="rounded-full bg-red-50 p-2">
                <AlertTriangle className="h-4 w-4 text-red-500" />
              </div>
              <p className="text-xs text-muted-foreground">
                Bu bölüm yüklenemedi
              </p>
              <Button
                size="sm"
                variant="outline"
                className="h-7 text-xs gap-1"
                onClick={this.handleRetry}
              >
                <RefreshCw className="h-3 w-3" />
                Tekrar dene
              </Button>
            </div>
          </CardContent>
        </Card>
      );
    }

    return this.props.children;
  }
}
