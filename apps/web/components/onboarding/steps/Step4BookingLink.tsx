'use client';

import { useState }      from 'react';
import { Link2, Copy, ExternalLink, CheckCheck } from 'lucide-react';

import { Button }    from '@/components/ui/button';
import {
  Card, CardContent, CardDescription, CardHeader, CardTitle,
} from '@/components/ui/card';
import { toast }              from '@/hooks/use-toast';
import { useOnboardingStore } from '@/stores/onboarding.store';

export function Step4BookingLink() {
  const [copied, setCopied]  = useState(false);
  const store = useOnboardingStore();
  const link  = store.bookingLink ?? '';

  function copyLink() {
    navigator.clipboard.writeText(link).then(() => {
      setCopied(true);
      toast({ title: 'Link kopyalandı!' });
      setTimeout(() => setCopied(false), 2500);
    });
  }

  function previewPage() {
    window.open(link, '_blank', 'noopener,noreferrer');
  }

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center gap-2">
          <Link2 className="h-5 w-5 text-primary" />
          <CardTitle>Booking Sayfanız Hazır!</CardTitle>
        </div>
        <CardDescription>
          Müşterileriniz bu link üzerinden randevu alabilir. Paylaşmaya hazır.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-6">

        {/* Link gösterimi */}
        <div className="rounded-lg border border-emerald-200 bg-emerald-50 p-4">
          <p className="mb-1 text-xs font-medium uppercase tracking-wider text-emerald-600">
            Booking Linkiniz
          </p>
          <p className="break-all font-mono text-sm font-semibold text-emerald-800">
            {link}
          </p>
        </div>

        {/* Aksiyon butonları */}
        <div className="flex flex-col gap-3 sm:flex-row">
          <Button onClick={copyLink} variant="outline" className="flex-1 gap-2">
            {copied ? <CheckCheck className="h-4 w-4 text-emerald-500" /> : <Copy className="h-4 w-4" />}
            {copied ? 'Kopyalandı!' : 'Linki Kopyala'}
          </Button>
          <Button onClick={previewPage} variant="outline" className="flex-1 gap-2">
            <ExternalLink className="h-4 w-4" />
            Sayfayı Önizle
          </Button>
        </div>

        <Button
          className="w-full"
          onClick={() => store.setStep(5)}
        >
          Test Rezervasyonu Oluştur →
        </Button>
      </CardContent>
    </Card>
  );
}
