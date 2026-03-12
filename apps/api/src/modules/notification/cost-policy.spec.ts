/**
 * MVP-GATE-1: CostPolicyEngine — Rate Limiting & Cost Estimation
 * ──────────────────────────────────────────────────────────────────────────────
 * Kapsam:
 *
 *   A. estimateSmsSegments — SMS segment hesabı
 *      160 karakter → 1 segment, 161+ → çok segment (153 char/segment)
 *
 *   B. estimateCostMinor — kanal maliyet tahmini
 *      SMS: 5 kuruş/segment, EMAIL: 1 kuruş, PUSH: 0 kuruş
 *
 *   C. CostPolicyEngine.checkPolicy — SMS kota kontrolü
 *      Mevcut kullanım + segment <= 1000 → allowed: true
 *      Mevcut kullanım + segment > 1000  → allowed: false, fallback: EMAIL
 *
 *   D. CostPolicyEngine.checkPolicy — EMAIL/PUSH
 *      DB sorgusu yapılmaz, her zaman allowed: true
 *
 *   E. CostPolicyEngine.getCurrentPeriod
 *      start = bu ayın 1'i, end = bu ayın son günü
 * ──────────────────────────────────────────────────────────────────────────────
 */

import {
  CostPolicyEngine,
  estimateSmsSegments,
  estimateCostMinor,
} from './cost-policy.engine';

// ── Prisma mock ───────────────────────────────────────────────────────────────

const mockPrisma = {
  notificationUsage: {
    findUnique: jest.fn(),
  },
};

function makeEngine(): CostPolicyEngine {
  return new CostPolicyEngine(mockPrisma as never);
}

const PERIOD_START = new Date('2026-03-01');
const PERIOD_END   = new Date('2026-03-31');

// ── Test suite ────────────────────────────────────────────────────────────────

describe('CostPolicyEngine — Rate Limiting (MVP-GATE-1)', () => {
  beforeEach(() => jest.clearAllMocks());

  // ── A: estimateSmsSegments ────────────────────────────────────────────────

  describe('A: estimateSmsSegments — segment hesabı', () => {
    it('160 karakter → 1 segment', () => {
      expect(estimateSmsSegments('a'.repeat(160))).toBe(1);
    });

    it('boş string → 1 segment', () => {
      expect(estimateSmsSegments('')).toBe(1);
    });

    it('1 karakter → 1 segment', () => {
      expect(estimateSmsSegments('X')).toBe(1);
    });

    it('161 karakter → 2 segment', () => {
      expect(estimateSmsSegments('a'.repeat(161))).toBe(2);
    });

    it('153 karakter çok parçalı sınır: 306 = 2×153 → 2 segment', () => {
      expect(estimateSmsSegments('a'.repeat(306))).toBe(2);
    });

    it('307 karakter → 3 segment', () => {
      expect(estimateSmsSegments('a'.repeat(307))).toBe(3);
    });

    it('459 = 3×153 → 3 segment', () => {
      expect(estimateSmsSegments('a'.repeat(459))).toBe(3);
    });

    it('460 karakter → 4 segment', () => {
      expect(estimateSmsSegments('a'.repeat(460))).toBe(4);
    });
  });

  // ── B: estimateCostMinor ──────────────────────────────────────────────────

  describe('B: estimateCostMinor — maliyet tahmini', () => {
    it('SMS 1 segment → 5 kuruş', () => {
      expect(estimateCostMinor('SMS', 1)).toBe(5);
    });

    it('SMS 3 segment → 15 kuruş', () => {
      expect(estimateCostMinor('SMS', 3)).toBe(15);
    });

    it('EMAIL → 1 kuruş (segment bağımsız)', () => {
      expect(estimateCostMinor('EMAIL', 1)).toBe(1);
      expect(estimateCostMinor('EMAIL', 5)).toBe(1);
    });

    it('PUSH → 0 kuruş', () => {
      expect(estimateCostMinor('PUSH', 1)).toBe(0);
      expect(estimateCostMinor('PUSH', 10)).toBe(0);
    });
  });

  // ── C: checkPolicy — SMS kota ─────────────────────────────────────────────

  describe('C: checkPolicy — SMS kota kontrolü', () => {
    it('SMS, mevcut kullanım 0 → allowed: true', async () => {
      mockPrisma.notificationUsage.findUnique.mockResolvedValueOnce(null); // kullanım yok

      const engine = makeEngine();
      const result = await engine.checkPolicy(
        'tenant-1', 'SMS', 'a'.repeat(100), PERIOD_START, PERIOD_END,
      );

      expect(result.allowed).toBe(true);
    });

    it('SMS, mevcut kullanım 999 + 1 segment → allowed: true (tam limit)', async () => {
      mockPrisma.notificationUsage.findUnique.mockResolvedValueOnce({ sentCount: 999 });

      const engine = makeEngine();
      const result = await engine.checkPolicy(
        'tenant-1', 'SMS', 'a'.repeat(100), // 1 segment
        PERIOD_START, PERIOD_END,
      );

      expect(result.allowed).toBe(true); // 999 + 1 = 1000 (eşit → geçer)
    });

    it('SMS, mevcut kullanım 1000 + 1 segment → allowed: false, fallback: EMAIL', async () => {
      mockPrisma.notificationUsage.findUnique.mockResolvedValueOnce({ sentCount: 1000 });

      const engine = makeEngine();
      const result = await engine.checkPolicy(
        'tenant-1', 'SMS', 'a'.repeat(100), // 1 segment
        PERIOD_START, PERIOD_END,
      );

      expect(result.allowed).toBe(false);
      expect(result.reason).toBe('SMS_QUOTA_EXCEEDED');
      expect(result.fallback).toBe('EMAIL');
    });

    it('SMS, mevcut kullanım 998 + 2 segment → aşıldı (998+2=1000 → geçer)', async () => {
      mockPrisma.notificationUsage.findUnique.mockResolvedValueOnce({ sentCount: 998 });

      const engine = makeEngine();
      const result = await engine.checkPolicy(
        'tenant-1', 'SMS', 'a'.repeat(161), // 2 segment
        PERIOD_START, PERIOD_END,
      );

      // 998 + 2 = 1000 → sınırı aşmadı (current + segments > limit değil, <=)
      // Kod: currentCount + segments > SMS_MONTHLY_LIMIT (1000)
      // 998 + 2 = 1000; 1000 > 1000 = false → allowed: true
      expect(result.allowed).toBe(true);
    });

    it('SMS, mevcut kullanım 999 + 2 segment → aşıldı (999+2=1001 > 1000)', async () => {
      mockPrisma.notificationUsage.findUnique.mockResolvedValueOnce({ sentCount: 999 });

      const engine = makeEngine();
      const result = await engine.checkPolicy(
        'tenant-1', 'SMS', 'a'.repeat(161), // 2 segment
        PERIOD_START, PERIOD_END,
      );

      expect(result.allowed).toBe(false);
      expect(result.reason).toBe('SMS_QUOTA_EXCEEDED');
    });

    it('SMS checkPolicy: tenantId, channel, periodStart, periodEnd DB\'ye geçilir', async () => {
      mockPrisma.notificationUsage.findUnique.mockResolvedValueOnce(null);

      const engine = makeEngine();
      await engine.checkPolicy('tenant-xyz', 'SMS', 'msg', PERIOD_START, PERIOD_END);

      expect(mockPrisma.notificationUsage.findUnique).toHaveBeenCalledWith({
        where: {
          tenantId_channel_periodStart_periodEnd: {
            tenantId:    'tenant-xyz',
            channel:     'SMS',
            periodStart: PERIOD_START,
            periodEnd:   PERIOD_END,
          },
        },
      });
    });
  });

  // ── D: checkPolicy — EMAIL / PUSH ─────────────────────────────────────────

  describe('D: checkPolicy — EMAIL ve PUSH (DB sorgusu yok)', () => {
    it('EMAIL → allowed: true, DB sorgusu yok', async () => {
      const engine = makeEngine();
      const result = await engine.checkPolicy(
        'tenant-1', 'EMAIL', 'subject', PERIOD_START, PERIOD_END,
      );

      expect(result.allowed).toBe(true);
      expect(mockPrisma.notificationUsage.findUnique).not.toHaveBeenCalled();
    });

    it('PUSH → allowed: true, DB sorgusu yok', async () => {
      const engine = makeEngine();
      const result = await engine.checkPolicy(
        'tenant-1', 'PUSH', 'notification', PERIOD_START, PERIOD_END,
      );

      expect(result.allowed).toBe(true);
      expect(mockPrisma.notificationUsage.findUnique).not.toHaveBeenCalled();
    });
  });

  // ── E: getCurrentPeriod ───────────────────────────────────────────────────

  describe('E: getCurrentPeriod — aylık dönem başlangıç/bitiş', () => {
    it('start = bu ayın 1\'i (saat 00:00:00)', () => {
      const engine = makeEngine();
      const { start } = engine.getCurrentPeriod();
      const now = new Date();

      expect(start.getFullYear()).toBe(now.getFullYear());
      expect(start.getMonth()).toBe(now.getMonth());
      expect(start.getDate()).toBe(1);
      expect(start.getHours()).toBe(0);
      expect(start.getMinutes()).toBe(0);
    });

    it('end = bu ayın son günü', () => {
      const engine = makeEngine();
      const { end } = engine.getCurrentPeriod();
      const now = new Date();

      expect(end.getFullYear()).toBe(now.getFullYear());
      expect(end.getMonth()).toBe(now.getMonth());

      // Son gün: bir sonraki ayın 0. günü = bu ayın son günü
      const expectedLastDay = new Date(now.getFullYear(), now.getMonth() + 1, 0).getDate();
      expect(end.getDate()).toBe(expectedLastDay);
    });

    it('start < end', () => {
      const engine = makeEngine();
      const { start, end } = engine.getCurrentPeriod();
      expect(start.getTime()).toBeLessThan(end.getTime());
    });
  });
});
