/**
 * TEST 2: Retry Policy — Unified Deterministic Schedule
 * ──────────────────────────────────────────────────────────────────────────────
 * Birleşik 5-deneme deterministik retry takvimi doğrulama.
 *
 * Kapsam:
 *   - Her denemeden sonra beklenen süre: 1m → 5m → 15m → 1h → 6h
 *   - MAX_DELIVERY_ATTEMPTS = 5
 *   - 5. deneme sonrası → null (retry yok)
 *   - isMaxAttemptsReached: sınır değer testi
 *   - Jitter YOK: kesin değerler
 * ──────────────────────────────────────────────────────────────────────────────
 */

import {
  nextRetryAt,
  isMaxAttemptsReached,
  classifyFailure,
  MAX_DELIVERY_ATTEMPTS,
} from './retry-policy';

// ── Sabitleri yansıt ──────────────────────────────────────────────────────────

const EXPECTED_DELAYS_MS = [
  1  * 60_000,        //  1 dakika
  5  * 60_000,        //  5 dakika
  15 * 60_000,        // 15 dakika
  60 * 60_000,        //  1 saat
  6  * 60 * 60_000,   //  6 saat
];

// ── Test suite ────────────────────────────────────────────────────────────────

describe('retry-policy — Unified Deterministic Schedule', () => {
  let now: number;

  beforeEach(() => {
    now = Date.now();
    jest.spyOn(Date, 'now').mockReturnValue(now);
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  describe('MAX_DELIVERY_ATTEMPTS', () => {
    it('5 olmalı', () => {
      expect(MAX_DELIVERY_ATTEMPTS).toBe(5);
    });
  });

  describe('nextRetryAt', () => {
    it.each([1, 2, 3, 4, 5])(
      '%i. denemeden sonra doğru gecikmeyi döner',
      (attemptsDone) => {
        const result = nextRetryAt('SMS', attemptsDone);
        if (attemptsDone >= MAX_DELIVERY_ATTEMPTS) {
          expect(result).toBeNull();
        } else {
          expect(result).not.toBeNull();
          const expectedMs = EXPECTED_DELAYS_MS[attemptsDone - 1];
          // Kesin değer — jitter yok
          expect(result!.getTime()).toBe(now + expectedMs);
        }
      },
    );

    it('1. deneme sonrası → 1 dakika gecikme', () => {
      const result = nextRetryAt('SMS', 1);
      expect(result!.getTime() - now).toBe(60_000);
    });

    it('2. deneme sonrası → 5 dakika gecikme', () => {
      const result = nextRetryAt('EMAIL', 2);
      expect(result!.getTime() - now).toBe(5 * 60_000);
    });

    it('3. deneme sonrası → 15 dakika gecikme', () => {
      const result = nextRetryAt('PUSH', 3);
      expect(result!.getTime() - now).toBe(15 * 60_000);
    });

    it('4. deneme sonrası → 1 saat gecikme', () => {
      const result = nextRetryAt('SMS', 4);
      expect(result!.getTime() - now).toBe(60 * 60_000);
    });

    it('5. deneme sonrası (MAX) → null', () => {
      expect(nextRetryAt('SMS', 5)).toBeNull();
    });

    it('6. deneme sonrası (MAX üstü) → null', () => {
      expect(nextRetryAt('EMAIL', 6)).toBeNull();
    });

    it('kanal bağımsız: SMS ve EMAIL aynı gecikmeyi döner', () => {
      const smsResult   = nextRetryAt('SMS',   2);
      const emailResult = nextRetryAt('EMAIL', 2);
      const pushResult  = nextRetryAt('PUSH',  2);
      expect(smsResult?.getTime()).toBe(emailResult?.getTime());
      expect(emailResult?.getTime()).toBe(pushResult?.getTime());
    });
  });

  describe('isMaxAttemptsReached', () => {
    it('attempts < 5 → false', () => {
      expect(isMaxAttemptsReached('SMS', 4)).toBe(false);
    });

    it('attempts = 5 → true', () => {
      expect(isMaxAttemptsReached('SMS', 5)).toBe(true);
    });

    it('attempts > 5 → true', () => {
      expect(isMaxAttemptsReached('EMAIL', 6)).toBe(true);
    });

    it('attempts = 0 → false', () => {
      expect(isMaxAttemptsReached('PUSH', 0)).toBe(false);
    });
  });

  describe('classifyFailure', () => {
    it('INVALID_PHONE → PERMANENT', () => {
      expect(classifyFailure({ code: 'INVALID_PHONE', message: 'x' })).toBe('PERMANENT');
    });

    it('OPT_OUT → PERMANENT', () => {
      expect(classifyFailure({ code: 'OPT_OUT', message: 'x' })).toBe('PERMANENT');
    });

    it('HTTP 404 → PERMANENT', () => {
      expect(classifyFailure({ code: 'NOT_FOUND', message: 'x', httpStatus: 404 })).toBe('PERMANENT');
    });

    it('TIMEOUT → TRANSIENT', () => {
      expect(classifyFailure({ code: 'TIMEOUT', message: 'x' })).toBe('TRANSIENT');
    });

    it('HTTP 503 → TRANSIENT', () => {
      expect(classifyFailure({ code: 'PROVIDER_5XX', message: 'x', httpStatus: 503 })).toBe('TRANSIENT');
    });
  });
});
