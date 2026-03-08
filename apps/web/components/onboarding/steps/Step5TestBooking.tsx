'use client';

/**
 * STEP 5 — Test Rezervasyonu (Faz 21.6)
 * ──────────────────────────────────────────────────────────────────────────────
 * Booking linkini Step4 ile aynı resolveBookingLink() yardımcısıyla çözer.
 * Bu sayede store'da bookingLink null olsa bile tenantSlug'dan üretilir.
 *
 * Test randevusu semantiği (Faz 21.9 — B6):
 *   Kullanıcı booking sayfasını açarak manuel olarak test rezervasyonu yapar.
 *   Sunucu tarafında public.service.ts, TRIAL tenant + ilk randevu tespiti yaparak
 *   isTestBooking=true atar. Frontend'in bu konuda ek işlem yapması gerekmez.
 */

import { useState }   from 'react';
import { useRouter }  from 'next/navigation';
import { CalendarCheck, ExternalLink, PartyPopper } from 'lucide-react';

import { Button }    from '@/components/ui/button';
import {
  Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle,
} from '@/components/ui/card';
import { useOnboardingStore } from '@/stores/onboarding.store';

const BOOKING_BASE =
  process.env.NEXT_PUBLIC_BOOKING_URL ?? 'https://book.calon.com.tr';

function resolveBookingLink(bookingLink: string | null, tenantSlug: string | null): string {
  if (bookingLink) return bookingLink;
  if (tenantSlug)  return `${BOOKING_BASE}/${tenantSlug}`;
  return '';
}

export function Step5TestBooking() {
  const router    = useRouter();
  const store     = useOnboardingStore();
  const [done, setDone] = useState(false);
  const link = resolveBookingLink(store.bookingLink, store.tenantSlug);

  function openBookingPage() {
    if (!link) return;
    window.open(link, '_blank', 'noopener,noreferrer');
    // Test rezervasyonu sayfası açılınca tamamlandı kabul et
    setDone(true);
  }

  function goToDashboard() {
    store.reset(); // Wizard state temizle
    router.push('/dashboard');
  }

  if (done) {
    return (
      <Card className="border-emerald-200 bg-emerald-50">
        <CardHeader className="items-center text-center">
          <PartyPopper className="h-12 w-12 text-emerald-500" />
          <CardTitle className="text-emerald-800">Kurulum Tamamlandı!</CardTitle>
          <CardDescription className="text-emerald-700">
            Salonunuz artık yayında. Booking sayfanız üzerinden gerçek rezervasyonlar alabilirsiniz.
          </CardDescription>
        </CardHeader>
        <CardFooter>
          <Button className="w-full" onClick={goToDashboard}>
            Dashboard&apos;a Git →
          </Button>
        </CardFooter>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center gap-2">
          <CalendarCheck className="h-5 w-5 text-primary" />
          <CardTitle>Test Rezervasyonu Oluşturun</CardTitle>
        </div>
        <CardDescription>
          Booking motorunun düzgün çalıştığını doğrulamak için bir test rezervasyonu yapın.
          Bu randevu test olarak işaretlenecek ve gelir metriklerini etkilemeyecektir.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">

        <div className="rounded-lg border bg-slate-50 p-4 text-sm text-slate-600">
          <p className="font-medium text-slate-800">Nasıl yapılır?</p>
          <ol className="mt-2 space-y-1 list-decimal list-inside">
            <li>Aşağıdaki butona tıklayarak booking sayfanızı açın</li>
            <li>Hizmet, personel ve saat seçin</li>
            <li>Müşteri bilgilerinizi (test verisi) girin</li>
            <li>Rezervasyonu onaylayın</li>
          </ol>
        </div>

        <Button
          className="w-full gap-2"
          onClick={openBookingPage}
          disabled={!link}
        >
          <ExternalLink className="h-4 w-4" />
          Booking Sayfasını Aç
        </Button>

        <Button
          variant="ghost"
          className="w-full text-muted-foreground"
          onClick={goToDashboard}
        >
          Şimdi değil, dashboard&apos;a git
        </Button>
      </CardContent>
    </Card>
  );
}
