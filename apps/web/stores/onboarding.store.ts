/**
 * ONBOARDING STORE — Faz 21 Wizard State
 * ──────────────────────────────────────────────────────────────────────────────
 * Wizard refresh edildiğinde state kaybolmaması için localStorage persist.
 * Zustand v5 + zustand/middleware (persist)
 *
 * Güvenlik (v2 — Faz 21.5):
 *   • tenantId, serviceId, staffId, locationId PERSIST EDİLMEZ.
 *   • Bu ID'ler yalnızca backend /onboarding/status API'nden alınır.
 *   • Persist'e yalnızca UI navigasyonu için gereken minimum state yazılır:
 *     onboardingSessionId, currentStep, tenantSlug, bookingLink.
 */

import { create } from 'zustand';
import { persist } from 'zustand/middleware';

// ── State arayüzü ─────────────────────────────────────────────────────────────

export interface OnboardingState {
  /** Rasgele oturum ID (idem. key için) */
  onboardingSessionId: string | null;
  /** Mevcut adım: 1-5 */
  currentStep: number;
  tenantId:    string | null;
  tenantSlug:  string | null;
  locationId:  string | null;
  serviceId:   string | null;
  staffId:     string | null;
  bookingLink: string | null;
}

interface OnboardingActions {
  setSession: (id: string) => void;
  setStep: (step: number) => void;
  setTenant: (id: string, slug: string, bookingLink: string) => void;
  setLocation: (id: string) => void;
  setService: (id: string) => void;
  setStaff: (id: string) => void;
  setBookingLink: (link: string) => void;
  reset: () => void;
}

// ── İlk değerler ──────────────────────────────────────────────────────────────

const initialState: OnboardingState = {
  onboardingSessionId: null,
  currentStep:         1,
  tenantId:            null,
  tenantSlug:          null,
  locationId:          null,
  serviceId:           null,
  staffId:             null,
  bookingLink:         null,
};

// ── Store ─────────────────────────────────────────────────────────────────────

export const useOnboardingStore = create<OnboardingState & OnboardingActions>()(
  persist(
    (set) => ({
      ...initialState,

      setSession:    (id)                         => set({ onboardingSessionId: id }),
      setStep:       (step)                       => set({ currentStep: step }),
      setTenant:     (id, slug, bookingLink)      => set({ tenantId: id, tenantSlug: slug, bookingLink }),
      setLocation:   (id)                         => set({ locationId: id }),
      setService:    (id)                         => set({ serviceId: id }),
      setStaff:      (id)                         => set({ staffId: id }),
      setBookingLink:(link)                       => set({ bookingLink: link }),
      reset:         ()                           => set(initialState),
    }),
    {
      name: 'calon-onboarding',
      /**
       * Güvenlik: sunucu tarafından doğrulanması gereken ID'ler PERSIST EDİLMEZ.
       * tenantId, serviceId, staffId, locationId → her oturumda /onboarding/status'tan alınır.
       */
      partialize: (state) => ({
        onboardingSessionId: state.onboardingSessionId,
        currentStep:         state.currentStep,
        tenantSlug:          state.tenantSlug,
        bookingLink:         state.bookingLink,
      }),
    },
  ),
);
