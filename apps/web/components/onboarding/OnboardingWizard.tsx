'use client';

/**
 * ONBOARDING WIZARD — Faz 21
 * ──────────────────────────────────────────────────────────────────────────────
 * 5 adımlı kurulum sihirbazı:
 *   1. Salon Bilgileri (Location)
 *   2. Hizmet Kurulumu (Service)
 *   3. Personel Kurulumu (Staff)
 *   4. Booking Link Aktivasyonu
 *   5. Test Rezervasyonu
 */

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { CheckCircle } from 'lucide-react';

import { useOnboardingStore } from '@/stores/onboarding.store';
import apiClient from '@/lib/api-client';
import { Step1Salon }    from './steps/Step1Salon';
import { Step2Service }  from './steps/Step2Service';
import { Step3Staff }    from './steps/Step3Staff';
import { Step4BookingLink } from './steps/Step4BookingLink';
import { Step5TestBooking } from './steps/Step5TestBooking';

// ── Adım meta verisi ──────────────────────────────────────────────────────────

const STEPS = [
  { label: 'Salon Bilgileri',  short: 'Salon'  },
  { label: 'Hizmet',          short: 'Hizmet'  },
  { label: 'Personel',        short: 'Personel'},
  { label: 'Booking Link',    short: 'Link'    },
  { label: 'Test Rezervasyon',short: 'Test'    },
];

// ── Bileşen ───────────────────────────────────────────────────────────────────

export function OnboardingWizard() {
  const router     = useRouter();
  const store      = useOnboardingStore();
  const { currentStep, tenantId } = store;

  // Oturum yoksa kayıt sayfasına yönlendir
  useEffect(() => {
    if (!tenantId) {
      router.replace('/register');
    }
  }, [tenantId, router]);

  // Wizard durumunu backend'den senkronize et (sayfa yenileme sonrası)
  useEffect(() => {
    if (!tenantId) return;
    apiClient
      .get<{
        currentStep: number;
        locationId:  string | null;
        serviceId:   string | null;
        staffId:     string | null;
        bookingLink: string;
        tenantSlug:  string;
      }>('/onboarding/status')
      .then(({ data }) => {
        if (data.locationId && !store.locationId) store.setLocation(data.locationId);
        if (data.serviceId  && !store.serviceId)  store.setService(data.serviceId);
        if (data.staffId    && !store.staffId)     store.setStaff(data.staffId);
        if (data.bookingLink)                      store.setBookingLink(data.bookingLink);
        // Sayfa refresh'te daha ilerideyse adımı güncelle
        if (data.currentStep > currentStep) store.setStep(data.currentStep);
      })
      .catch(() => {
        // Hata durumunda mevcut store durumunu koru
      });
    // Sadece mount'ta çalışsın
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tenantId]);

  if (!tenantId) return null;

  return (
    <div className="space-y-8">
      {/* İlerleme çubuğu */}
      <StepIndicator current={currentStep} />

      {/* Aktif adım */}
      {currentStep === 1 && <Step1Salon />}
      {currentStep === 2 && <Step2Service />}
      {currentStep === 3 && <Step3Staff />}
      {currentStep === 4 && <Step4BookingLink />}
      {currentStep === 5 && <Step5TestBooking />}
    </div>
  );
}

// ── İlerleme göstergesi ───────────────────────────────────────────────────────

function StepIndicator({ current }: { current: number }) {
  return (
    <div className="flex items-center gap-1">
      {STEPS.map((step, idx) => {
        const num       = idx + 1;
        const done      = num < current;
        const active    = num === current;
        const isLast    = idx === STEPS.length - 1;

        return (
          <div key={num} className="flex flex-1 items-center gap-1">
            <div className="flex flex-col items-center gap-1">
              <div
                className={[
                  'flex h-8 w-8 items-center justify-center rounded-full text-sm font-medium transition-all',
                  done   ? 'bg-emerald-500 text-white'       : '',
                  active ? 'bg-primary text-primary-foreground ring-4 ring-primary/20' : '',
                  !done && !active ? 'bg-slate-200 text-slate-500' : '',
                ].join(' ')}
              >
                {done ? <CheckCircle className="h-4 w-4" /> : num}
              </div>
              <span className={[
                'hidden text-xs font-medium sm:block',
                active ? 'text-primary' : done ? 'text-emerald-600' : 'text-slate-400',
              ].join(' ')}>
                {step.short}
              </span>
            </div>
            {!isLast && (
              <div
                className={[
                  'h-0.5 flex-1 rounded-full transition-all',
                  done ? 'bg-emerald-400' : 'bg-slate-200',
                ].join(' ')}
              />
            )}
          </div>
        );
      })}
    </div>
  );
}
