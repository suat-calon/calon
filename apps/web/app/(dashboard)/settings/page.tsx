'use client';

import { useState, useCallback } from 'react';
import {
  Building2, MapPin, Phone, Globe, Copy, Check,
  ExternalLink, Link2, AlertCircle, Loader2,
} from 'lucide-react';

import { Button } from '@/components/ui/button';
import { Badge }  from '@/components/ui/badge';
import { useTenant } from '@/hooks/api/use-auth';

export default function SettingsPage() {
  const { data: tenant, isLoading, error } = useTenant();
  const [copied, setCopied] = useState(false);

  const bookingUrl = tenant?.slug
    ? `${process.env.NEXT_PUBLIC_BOOKING_URL ?? 'https://book.calon.com.tr'}/${tenant.slug}`
    : null;

  const handleCopy = useCallback(async () => {
    if (!bookingUrl) return;
    try {
      await navigator.clipboard.writeText(bookingUrl);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch { /* clipboard API might fail */ }
  }, [bookingUrl]);

  if (error) {
    return (
      <div className="flex items-center gap-2 text-destructive py-8 justify-center">
        <AlertCircle className="h-5 w-5" /><span>Salon bilgileri yüklenemedi.</span>
      </div>
    );
  }

  if (isLoading || !tenant) {
    return (
      <div className="flex justify-center py-12">
        <Loader2 className="h-6 w-6 animate-spin text-primary" />
      </div>
    );
  }

  return (
    <div className="space-y-6 max-w-3xl">
      <h1 className="text-2xl font-bold tracking-tight">Salon Ayarları</h1>

      {/* ── Profile Card ──────────────────────────────────────────────────── */}
      <div className="bg-white rounded-xl border shadow-sm p-6">
        <div className="flex items-start gap-4">
          <div className="p-3 rounded-xl bg-primary/10 shrink-0">
            <Building2 className="h-6 w-6 text-primary" />
          </div>
          <div className="flex-1 min-w-0">
            <h2 className="text-lg font-semibold">{tenant.name}</h2>
            <div className="flex items-center gap-2 mt-1">
              <Badge variant="secondary" className="text-xs">{tenant.plan}</Badge>
              <span className="text-xs text-muted-foreground">{tenant.currency}</span>
              <span className="text-xs text-muted-foreground">{tenant.timezone}</span>
            </div>
          </div>
        </div>

        <div className="mt-5 grid grid-cols-1 sm:grid-cols-2 gap-4">
          <InfoRow icon={Globe} label="Slug" value={tenant.slug} />
          <InfoRow icon={MapPin} label="Bölge" value={`${tenant.locale} / ${tenant.timezone}`} />
        </div>

        <p className="text-xs text-muted-foreground mt-4 italic">
          Salon adı ve diğer temel bilgileri değiştirmek için destek ile iletişime geçin.
        </p>
      </div>

      {/* ── Booking Link ──────────────────────────────────────────────────── */}
      {bookingUrl && (
        <div className="bg-gradient-to-r from-primary/5 to-primary/10 rounded-xl border border-primary/20 shadow-sm p-5">
          <div className="flex items-start gap-3">
            <div className="p-2 rounded-lg bg-primary/15 shrink-0">
              <Link2 className="h-5 w-5 text-primary" />
            </div>
            <div className="flex-1 min-w-0">
              <h3 className="text-sm font-semibold">Online Randevu Linki</h3>
              <p className="text-xs text-muted-foreground mt-1">
                Bu linki müşterilerinizle paylaşarak online randevu almalarını sağlayın.
              </p>
              <div className="flex items-center gap-2 mt-3">
                <code className="flex-1 text-xs bg-white/80 border rounded-md px-3 py-2 truncate font-mono">
                  {bookingUrl}
                </code>
                <Button variant="outline" size="sm" className="shrink-0 border-primary/30 text-primary hover:bg-primary/10" onClick={handleCopy}>
                  {copied ? <Check className="h-4 w-4" /> : <Copy className="h-4 w-4" />}
                </Button>
                <Button variant="outline" size="sm" className="shrink-0" asChild>
                  <a href={bookingUrl} target="_blank" rel="noopener noreferrer">
                    <ExternalLink className="h-4 w-4" />
                  </a>
                </Button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function InfoRow({ icon: Icon, label, value }: { icon: React.ComponentType<{ className?: string }>; label: string; value: string }) {
  return (
    <div className="flex items-center gap-2">
      <Icon className="h-4 w-4 text-muted-foreground shrink-0" />
      <span className="text-xs text-muted-foreground">{label}:</span>
      <span className="text-sm font-medium truncate">{value}</span>
    </div>
  );
}
