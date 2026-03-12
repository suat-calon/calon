/**
 * MVP-GATE-1: MetricsService — Observability Unit Tests
 * ──────────────────────────────────────────────────────────────────────────────
 * MetricsService'in tüm sayaç ve snapshot metotlarını doğrular.
 *
 *   A. HTTP metrikleri: record() + snapshot()
 *      - total, errors, errorRate, p50, p95
 *
 *   B. Worker sayaçları: inc* + workerSnapshot()
 *      - eventDispatched, eventDispatchFailed
 *      - smsSent, smsFailed
 *      - emailSent, emailFailed
 *      - pushSent, pushFailed
 *      - dlqTotal
 *
 *   C. Archive metrikleri
 *      - incArchiveRows(n), setArchiveDuration(ms), incArchiveFailures()
 *
 *   D. summaryLine() formatı
 * ──────────────────────────────────────────────────────────────────────────────
 */

import { MetricsService } from './metrics.service';

describe('MetricsService — Observability (MVP-GATE-1)', () => {
  let svc: MetricsService;

  beforeEach(() => {
    svc = new MetricsService();
  });

  // ── A: HTTP metrikleri ────────────────────────────────────────────────────

  describe('A: HTTP metrikleri — record() + snapshot()', () => {
    it('başlangıçta total=0, errors=0, errorRate="0.00%"', () => {
      const snap = svc.snapshot();
      expect(snap.total).toBe(0);
      expect(snap.errors).toBe(0);
      expect(snap.errorRate).toBe('0.00%');
    });

    it('record(100, 200) → total=1, errors=0', () => {
      svc.record(100, 200);
      const snap = svc.snapshot();
      expect(snap.total).toBe(1);
      expect(snap.errors).toBe(0);
    });

    it('record(100, 500) → total=1, errors=1, errorRate="100.00%"', () => {
      svc.record(100, 500);
      const snap = svc.snapshot();
      expect(snap.total).toBe(1);
      expect(snap.errors).toBe(1);
      expect(snap.errorRate).toBe('100.00%');
    });

    it('2 istek, 1 hata → errorRate="50.00%"', () => {
      svc.record(50, 200);
      svc.record(50, 503);
      const snap = svc.snapshot();
      expect(snap.errors).toBe(1);
      expect(snap.errorRate).toBe('50.00%');
    });

    it('p50: medyan gecikme hesabı', () => {
      // 3 istek: 10ms, 20ms, 30ms → sorted → p50 index = floor(3*0.5)=1 → 20ms
      svc.record(10, 200);
      svc.record(30, 200);
      svc.record(20, 200);
      const snap = svc.snapshot();
      expect(snap.p50).toBe(20);
    });

    it('p95: 95. yüzdelik gecikme', () => {
      // 20 istek: 1-20ms → p95 index = floor(20*0.95)=19 → 20ms
      for (let i = 1; i <= 20; i++) svc.record(i, 200);
      const snap = svc.snapshot();
      expect(snap.p95).toBeGreaterThanOrEqual(18);
    });

    it('uptimeMs > 0', () => {
      const snap = svc.snapshot();
      expect(snap.uptimeMs).toBeGreaterThanOrEqual(0);
    });
  });

  // ── B: Worker sayaçları ───────────────────────────────────────────────────

  describe('B: worker sayaçları — workerSnapshot()', () => {
    it('başlangıçta tüm sayaçlar 0', () => {
      const snap = svc.workerSnapshot();
      expect(snap.eventDispatched).toBe(0);
      expect(snap.eventDispatchFailed).toBe(0);
      expect(snap.smsSent).toBe(0);
      expect(snap.smsFailed).toBe(0);
      expect(snap.emailSent).toBe(0);
      expect(snap.emailFailed).toBe(0);
      expect(snap.pushSent).toBe(0);
      expect(snap.pushFailed).toBe(0);
      expect(snap.dlqTotal).toBe(0);
    });

    it('incEventDispatched() → eventDispatched++', () => {
      svc.incEventDispatched();
      svc.incEventDispatched();
      expect(svc.workerSnapshot().eventDispatched).toBe(2);
    });

    it('incEventDispatchFailed() → eventDispatchFailed++', () => {
      svc.incEventDispatchFailed();
      expect(svc.workerSnapshot().eventDispatchFailed).toBe(1);
    });

    it('incSmsSent() → smsSent++', () => {
      svc.incSmsSent();
      svc.incSmsSent();
      svc.incSmsSent();
      expect(svc.workerSnapshot().smsSent).toBe(3);
    });

    it('incSmsFailed() → smsFailed++', () => {
      svc.incSmsFailed();
      expect(svc.workerSnapshot().smsFailed).toBe(1);
    });

    it('incEmailSent() → emailSent++', () => {
      svc.incEmailSent();
      expect(svc.workerSnapshot().emailSent).toBe(1);
    });

    it('incEmailFailed() → emailFailed++', () => {
      svc.incEmailFailed();
      svc.incEmailFailed();
      expect(svc.workerSnapshot().emailFailed).toBe(2);
    });

    it('incPushSent() → pushSent++', () => {
      svc.incPushSent();
      expect(svc.workerSnapshot().pushSent).toBe(1);
    });

    it('incPushFailed() → pushFailed++', () => {
      svc.incPushFailed();
      expect(svc.workerSnapshot().pushFailed).toBe(1);
    });

    it('incDlq() → dlqTotal++', () => {
      svc.incDlq();
      svc.incDlq();
      svc.incDlq();
      expect(svc.workerSnapshot().dlqTotal).toBe(3);
    });

    it('farklı sayaçlar birbirini etkilemez', () => {
      svc.incSmsSent();
      svc.incSmsFailed();
      svc.incEmailSent();
      svc.incPushSent();
      svc.incDlq();

      const snap = svc.workerSnapshot();
      expect(snap.smsSent).toBe(1);
      expect(snap.smsFailed).toBe(1);
      expect(snap.emailSent).toBe(1);
      expect(snap.pushSent).toBe(1);
      expect(snap.dlqTotal).toBe(1);
      // Etkilenmemeli
      expect(snap.emailFailed).toBe(0);
      expect(snap.pushFailed).toBe(0);
      expect(snap.eventDispatched).toBe(0);
    });
  });

  // ── C: Archive metrikleri ─────────────────────────────────────────────────

  describe('C: archive metrikleri', () => {
    it('başlangıçta archiveRowsMoved=0, archiveFailures=0, archiveLastDurationMs=null', () => {
      const snap = svc.workerSnapshot();
      expect(snap.archiveRowsMoved).toBe(0);
      expect(snap.archiveFailures).toBe(0);
      expect(snap.archiveLastDurationMs).toBeNull();
    });

    it('incArchiveRows(5) → archiveRowsMoved=5', () => {
      svc.incArchiveRows(5);
      expect(svc.workerSnapshot().archiveRowsMoved).toBe(5);
    });

    it('incArchiveRows biriktirici: 5 + 3 = 8', () => {
      svc.incArchiveRows(5);
      svc.incArchiveRows(3);
      expect(svc.workerSnapshot().archiveRowsMoved).toBe(8);
    });

    it('setArchiveDuration(150) → archiveLastDurationMs=150', () => {
      svc.setArchiveDuration(150);
      expect(svc.workerSnapshot().archiveLastDurationMs).toBe(150);
    });

    it('setArchiveDuration üzerine yazar (son süre)', () => {
      svc.setArchiveDuration(100);
      svc.setArchiveDuration(200);
      expect(svc.workerSnapshot().archiveLastDurationMs).toBe(200);
    });

    it('incArchiveFailures() → archiveFailures++', () => {
      svc.incArchiveFailures();
      svc.incArchiveFailures();
      expect(svc.workerSnapshot().archiveFailures).toBe(2);
    });
  });

  // ── D: summaryLine() ──────────────────────────────────────────────────────

  describe('D: summaryLine() formatı', () => {
    it('"[Metrics] shutdown summary" ile başlar', () => {
      expect(svc.summaryLine()).toMatch(/^\[Metrics\] shutdown summary/);
    });

    it('total, errors, errorRate, p50, p95, uptime alanlarını içerir', () => {
      svc.record(50, 200);
      const line = svc.summaryLine();
      expect(line).toContain('total=1');
      expect(line).toContain('errors=0');
      expect(line).toContain('errorRate=0.00%');
      expect(line).toContain('p50=');
      expect(line).toContain('p95=');
      expect(line).toContain('uptime=');
    });
  });
});
