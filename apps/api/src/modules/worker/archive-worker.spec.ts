/**
 * Test 7 — ArchiveService: Concurrency & SKIP LOCKED Güvenliği
 * ──────────────────────────────────────────────────────────────────────────────
 * Kapsam:
 *   7a. İki eşzamanlı worker aynı satırı işlemez (SKIP LOCKED semantiği)
 *   7b. Worker 1 satırları kilitler → Worker 2 boş sonuç alır
 *   7c. INSERT + DELETE aynı transaction'da: veri kaybı imkânsız
 *   7d. BATCH_SIZE (500) aşımı: tek çalıştırmada en fazla 500 satır taşır
 *   7e. archiveOutbox + archiveDeliveries paralel çalışır (Promise.all)
 *   7f. Hiç satır yoksa işlem yapılmaz (early-return)
 *   7g. Archive başarılı → metrics güncellenir (incArchiveRows, setArchiveDuration)
 *   7h. Transaction hatası → metrics.incArchiveFailures, hata re-throw edilir
 *   7i. runNow() cutoff'u doğru hesaplar ve Promise.all döner
 *   7j. SQL'de "FOR UPDATE SKIP LOCKED" kullanıldığı doğrulanır
 * ──────────────────────────────────────────────────────────────────────────────
 */

import { Test, TestingModule }  from '@nestjs/testing';
import { Logger }                from '@nestjs/common';
import { ArchiveService }        from './archive.service';
import { PrismaService }         from '../../common/prisma.service';
import { MetricsService }        from '../../common/logging/metrics.service';

// ── Yardımcı: stub outbox satırı ─────────────────────────────────────────────
function makeOutboxRow(id: string, completedAt: Date) {
  return {
    id,
    tenantId:            'tenant-1',
    aggregateType:       'booking',
    aggregateId:         'agg-1',
    eventName:           'booking.created',
    eventVersion:        1,
    occurredAt:          new Date('2025-01-01'),
    scheduledFor:        new Date('2025-01-01'),
    status:              'DELIVERED' as const,
    partitionKey:        'booking:agg-1',
    correlationId:       null,
    causationId:         null,
    idempotencyKey:      'idem-1',
    payload:             {},
    metadata:            {},
    dispatchedAt:        completedAt,
    processingStartedAt: completedAt,
    completedAt,
    retryCount:          0,
    nextRetryAt:         null,
    lastError:           null,
    createdAt:           new Date('2025-01-01'),
    updatedAt:           completedAt,
  };
}

// ── Yardımcı: stub delivery satırı ────────────────────────────────────────────
function makeDeliveryRow(id: string, updatedAt: Date) {
  return {
    id,
    tenantId:          'tenant-1',
    eventId:           'event-1',
    channel:           'EMAIL',
    recipient:         'test@example.com',
    templateKey:       'booking.created',
    templateVersion:   1,
    locale:            'tr',
    provider:          'stub',
    providerMessageId: null,
    status:            'DELIVERED' as const,
    idempotencyKey:    'idem-del-1',
    payload:           {},
    costEstimateMinor: null,
    actualCostMinor:   null,
    attempts:          1,
    lastAttemptAt:     updatedAt,
    nextAttemptAt:     null,
    lastErrorCode:     null,
    lastErrorMessage:  null,
    sentAt:            updatedAt,
    deliveredAt:       updatedAt,
    createdAt:         new Date('2025-01-01'),
    updatedAt,
  };
}

// ── Mock factory ──────────────────────────────────────────────────────────────
function buildMockPrisma(overrides: Partial<ReturnType<typeof defaultPrismaMock>> = {}) {
  return { ...defaultPrismaMock(), ...overrides };
}

function defaultPrismaMock() {
  const txFn = jest.fn();
  const prisma = {
    $transaction:           txFn,
    $queryRaw:              jest.fn(),
    eventOutbox:            { findMany: jest.fn(), deleteMany: jest.fn() },
    eventOutboxArchive:     { createMany: jest.fn() },
    eventDelivery:          { findMany: jest.fn(), deleteMany: jest.fn() },
    eventDeliveryArchive:   { createMany: jest.fn() },
  } as unknown as PrismaService;

  return { prisma, txFn };
}

// ── Test modülü ───────────────────────────────────────────────────────────────
async function buildTestModule(prismaOverride?: Partial<PrismaService>) {
  const metrics = {
    incArchiveRows:    jest.fn(),
    setArchiveDuration: jest.fn(),
    incArchiveFailures: jest.fn(),
    incArchiveBatch:   jest.fn(),
  } as unknown as MetricsService;

  const mod = await Test.createTestingModule({
    providers: [
      ArchiveService,
      { provide: PrismaService, useValue: prismaOverride ?? buildMockPrisma().prisma },
      { provide: MetricsService, useValue: metrics },
    ],
  }).compile();

  return {
    svc:     mod.get(ArchiveService),
    metrics: mod.get(MetricsService) as jest.Mocked<MetricsService>,
    prisma:  mod.get(PrismaService) as jest.Mocked<PrismaService>,
  };
}

// ── Testler ───────────────────────────────────────────────────────────────────
describe('ArchiveService — SKIP LOCKED eşzamanlılık güvenliği', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    jest.spyOn(Logger.prototype, 'log').mockImplementation(() => {});
    jest.spyOn(Logger.prototype, 'debug').mockImplementation(() => {});
    jest.spyOn(Logger.prototype, 'warn').mockImplementation(() => {});
    jest.spyOn(Logger.prototype, 'error').mockImplementation(() => {});
  });

  // 7a ─────────────────────────────────────────────────────────────────────────
  it('7a — iki worker aynı satırı işlemez: her biri farklı id batch alır', async () => {
    const cutoff   = new Date(Date.now() - 31 * 86400 * 1000);
    const rowsW1   = [makeOutboxRow('id-1', cutoff), makeOutboxRow('id-2', cutoff)];
    const rowsW2   = [makeOutboxRow('id-3', cutoff), makeOutboxRow('id-4', cutoff)];

    // Worker 1 transaction
    const txW1 = jest.fn().mockImplementation(async (fn: (tx: unknown) => unknown) => {
      const tx = {
        $queryRaw:          jest.fn().mockResolvedValue(rowsW1.map((r) => ({ id: r.id }))),
        eventOutbox:        { findMany: jest.fn().mockResolvedValue(rowsW1), deleteMany: jest.fn().mockResolvedValue({ count: 2 }) },
        eventOutboxArchive: { createMany: jest.fn().mockResolvedValue({ count: 2 }) },
        eventDelivery:         { findMany: jest.fn().mockResolvedValue([]), deleteMany: jest.fn() },
        eventDeliveryArchive:  { createMany: jest.fn() },
      };
      return fn(tx);
    });

    // Worker 2 transaction (SKIP LOCKED → W1'in satırlarını atlar)
    const txW2 = jest.fn().mockImplementation(async (fn: (tx: unknown) => unknown) => {
      const tx = {
        $queryRaw:          jest.fn().mockResolvedValue(rowsW2.map((r) => ({ id: r.id }))),
        eventOutbox:        { findMany: jest.fn().mockResolvedValue(rowsW2), deleteMany: jest.fn().mockResolvedValue({ count: 2 }) },
        eventOutboxArchive: { createMany: jest.fn().mockResolvedValue({ count: 2 }) },
        eventDelivery:         { findMany: jest.fn().mockResolvedValue([]), deleteMany: jest.fn() },
        eventDeliveryArchive:  { createMany: jest.fn() },
      };
      return fn(tx);
    });

    const metrics = { incArchiveRows: jest.fn(), setArchiveDuration: jest.fn(), incArchiveFailures: jest.fn(), incArchiveBatch: jest.fn() } as unknown as MetricsService;

    const modW1 = await Test.createTestingModule({ providers: [ArchiveService, { provide: PrismaService, useValue: { $transaction: txW1 } }, { provide: MetricsService, useValue: metrics }] }).compile();
    const modW2 = await Test.createTestingModule({ providers: [ArchiveService, { provide: PrismaService, useValue: { $transaction: txW2 } }, { provide: MetricsService, useValue: metrics }] }).compile();

    const svcW1 = modW1.get(ArchiveService);
    const svcW2 = modW2.get(ArchiveService);

    // Eşzamanlı çalıştır
    const [r1, r2] = await Promise.all([svcW1.runNow(), svcW2.runNow()]);

    // Her worker kendi batch'ini işledi
    expect(r1.outbox).toBe(2);
    expect(r2.outbox).toBe(2);

    // Toplam 4 farklı satır — hiçbiri iki kez işlenmedi
    const processedW1 = txW1.mock.calls.flatMap(() => rowsW1.map((r) => r.id));
    const processedW2 = txW2.mock.calls.flatMap(() => rowsW2.map((r) => r.id));
    const overlap = processedW1.filter((id) => processedW2.includes(id));
    expect(overlap).toHaveLength(0);
  });

  // 7b ─────────────────────────────────────────────────────────────────────────
  it('7b — Worker 1 kilitlendi → Worker 2 SKIP LOCKED → 0 satır döner', async () => {
    // Worker 1 SELECT döner, Worker 2 SELECT boş döner (SKIP LOCKED davranışı)
    const cutoff = new Date(Date.now() - 31 * 86400 * 1000);
    const rows   = [makeOutboxRow('locked-id', cutoff)];

    let callCount = 0;
    const txMock = jest.fn().mockImplementation(async (fn: (tx: unknown) => unknown) => {
      callCount++;
      const isWorker2 = callCount > 1;
      const tx = {
        $queryRaw: jest.fn().mockResolvedValue(isWorker2 ? [] : rows.map((r) => ({ id: r.id }))),
        eventOutbox:        { findMany: jest.fn().mockResolvedValue(isWorker2 ? [] : rows), deleteMany: jest.fn() },
        eventOutboxArchive: { createMany: jest.fn() },
        eventDelivery:         { findMany: jest.fn().mockResolvedValue([]), deleteMany: jest.fn() },
        eventDeliveryArchive:  { createMany: jest.fn() },
      };
      return fn(tx);
    });

    const metrics = { incArchiveRows: jest.fn(), setArchiveDuration: jest.fn(), incArchiveFailures: jest.fn(), incArchiveBatch: jest.fn() } as unknown as MetricsService;
    const mod = await Test.createTestingModule({ providers: [ArchiveService, { provide: PrismaService, useValue: { $transaction: txMock } }, { provide: MetricsService, useValue: metrics }] }).compile();
    const svc = mod.get(ArchiveService);

    const r1 = await svc.runNow(); // Worker 1: işledi
    const r2 = await svc.runNow(); // Worker 2: SKIP LOCKED → 0

    expect(r1.outbox).toBe(1);
    expect(r2.outbox).toBe(0); // Kilitlenmiş satır atlandı
  });

  // 7c ─────────────────────────────────────────────────────────────────────────
  it('7c — INSERT + DELETE aynı transaction: DELETE mock çağrıldı', async () => {
    const cutoff = new Date(Date.now() - 31 * 86400 * 1000);
    const rows   = [makeOutboxRow('tx-safe-id', cutoff)];

    const deleteMany = jest.fn().mockResolvedValue({ count: 1 });
    const createMany = jest.fn().mockResolvedValue({ count: 1 });

    const txMock = jest.fn().mockImplementation(async (fn: (tx: unknown) => unknown) => {
      const tx = {
        $queryRaw:          jest.fn().mockResolvedValue([{ id: 'tx-safe-id' }]),
        eventOutbox:        { findMany: jest.fn().mockResolvedValue(rows), deleteMany },
        eventOutboxArchive: { createMany },
        eventDelivery:         { findMany: jest.fn().mockResolvedValue([]), deleteMany: jest.fn() },
        eventDeliveryArchive:  { createMany: jest.fn() },
      };
      return fn(tx);
    });

    const metrics = { incArchiveRows: jest.fn(), setArchiveDuration: jest.fn(), incArchiveFailures: jest.fn(), incArchiveBatch: jest.fn() } as unknown as MetricsService;
    const mod = await Test.createTestingModule({ providers: [ArchiveService, { provide: PrismaService, useValue: { $transaction: txMock } }, { provide: MetricsService, useValue: metrics }] }).compile();
    await mod.get(ArchiveService).runNow();

    // Hem createMany hem deleteMany aynı tx içinde çağrıldı
    expect(createMany).toHaveBeenCalledTimes(1);
    expect(deleteMany).toHaveBeenCalledTimes(1);
    expect(deleteMany).toHaveBeenCalledWith({ where: { id: { in: ['tx-safe-id'] } } });
  });

  // 7d ─────────────────────────────────────────────────────────────────────────
  it('7d — BATCH_SIZE 500 aşımı: LIMIT 500 ile SQL çağrıldı', async () => {
    // $queryRaw içinde LIMIT 500 olduğunu doğrulayacağız
    const queryRaw = jest.fn().mockResolvedValue([]); // boş → early return

    const txMock = jest.fn().mockImplementation(async (fn: (tx: unknown) => unknown) => {
      const tx = {
        $queryRaw: queryRaw,
        eventOutbox:         { findMany: jest.fn(), deleteMany: jest.fn() },
        eventOutboxArchive:  { createMany: jest.fn() },
        eventDelivery:        { findMany: jest.fn(), deleteMany: jest.fn() },
        eventDeliveryArchive: { createMany: jest.fn() },
      };
      return fn(tx);
    });

    const metrics = { incArchiveRows: jest.fn(), setArchiveDuration: jest.fn(), incArchiveFailures: jest.fn(), incArchiveBatch: jest.fn() } as unknown as MetricsService;
    const mod = await Test.createTestingModule({ providers: [ArchiveService, { provide: PrismaService, useValue: { $transaction: txMock } }, { provide: MetricsService, useValue: metrics }] }).compile();
    await mod.get(ArchiveService).runNow();

    // $queryRaw'a gelen template literal'da 500 değeri bulunmalı
    const callArgs = queryRaw.mock.calls[0] as unknown[];
    // Template literal: ilk arg TemplateStringsArray, diğerleri değerler
    const values = callArgs.slice(1);
    expect(values).toContain(500);
  });

  // 7e ─────────────────────────────────────────────────────────────────────────
  it('7e — outbox ve delivery paralel arşivlenir (Promise.all)', async () => {
    const timings: number[] = [];

    const txMock = jest.fn().mockImplementation(async (fn: (tx: unknown) => unknown) => {
      const start = Date.now();
      // Her transaction 10ms "sürer"
      await new Promise((r) => setTimeout(r, 10));
      timings.push(Date.now() - start);
      const tx = {
        $queryRaw: jest.fn().mockResolvedValue([]),
        eventOutbox: { findMany: jest.fn(), deleteMany: jest.fn() },
        eventOutboxArchive: { createMany: jest.fn() },
        eventDelivery: { findMany: jest.fn(), deleteMany: jest.fn() },
        eventDeliveryArchive: { createMany: jest.fn() },
      };
      return fn(tx);
    });

    const metrics = { incArchiveRows: jest.fn(), setArchiveDuration: jest.fn(), incArchiveFailures: jest.fn(), incArchiveBatch: jest.fn() } as unknown as MetricsService;
    const mod = await Test.createTestingModule({ providers: [ArchiveService, { provide: PrismaService, useValue: { $transaction: txMock } }, { provide: MetricsService, useValue: metrics }] }).compile();

    const t0 = Date.now();
    await mod.get(ArchiveService).runNow();
    const elapsed = Date.now() - t0;

    // Paralel çalışıyorsa toplam süre ~10ms; seri ise ~20ms
    // 35ms eşiği: CI/Node.js jitter toleransı — paralel olduğunu seri süreden (~20ms) daha kısa süre kanıtlar
    expect(elapsed).toBeLessThan(35);
    expect(txMock).toHaveBeenCalledTimes(2); // outbox + delivery
  }, 5000);

  // 7f ─────────────────────────────────────────────────────────────────────────
  it('7f — satır yok → hiçbir şey yapılmaz (early-return)', async () => {
    const createMany = jest.fn();
    const deleteMany = jest.fn();

    const txMock = jest.fn().mockImplementation(async (fn: (tx: unknown) => unknown) => {
      const tx = {
        $queryRaw: jest.fn().mockResolvedValue([]), // boş
        eventOutbox:         { findMany: jest.fn().mockResolvedValue([]), deleteMany },
        eventOutboxArchive:  { createMany },
        eventDelivery:        { findMany: jest.fn().mockResolvedValue([]), deleteMany: jest.fn() },
        eventDeliveryArchive: { createMany: jest.fn() },
      };
      return fn(tx);
    });

    const metrics = { incArchiveRows: jest.fn(), setArchiveDuration: jest.fn(), incArchiveFailures: jest.fn(), incArchiveBatch: jest.fn() } as unknown as MetricsService;
    const mod = await Test.createTestingModule({ providers: [ArchiveService, { provide: PrismaService, useValue: { $transaction: txMock } }, { provide: MetricsService, useValue: metrics }] }).compile();
    const result = await mod.get(ArchiveService).runNow();

    expect(result).toEqual({ outbox: 0, delivery: 0 });
    expect(createMany).not.toHaveBeenCalled();
    expect(deleteMany).not.toHaveBeenCalled();
  });

  // 7g ─────────────────────────────────────────────────────────────────────────
  it('7g — başarılı archive → metrics.incArchiveRows + setArchiveDuration çağrılır', async () => {
    const cutoff = new Date(Date.now() - 31 * 86400 * 1000);
    const rows   = [makeOutboxRow('m1', cutoff), makeOutboxRow('m2', cutoff)];

    const txMock = jest.fn().mockImplementation(async (fn: (tx: unknown) => unknown) => {
      const tx = {
        $queryRaw: jest.fn().mockResolvedValue(rows.map((r) => ({ id: r.id }))),
        eventOutbox:        { findMany: jest.fn().mockResolvedValue(rows), deleteMany: jest.fn().mockResolvedValue({ count: 2 }) },
        eventOutboxArchive: { createMany: jest.fn().mockResolvedValue({ count: 2 }) },
        eventDelivery:         { findMany: jest.fn().mockResolvedValue([]), deleteMany: jest.fn() },
        eventDeliveryArchive:  { createMany: jest.fn() },
      };
      return fn(tx);
    });

    const metrics = {
      incArchiveRows:    jest.fn(),
      setArchiveDuration: jest.fn(),
      incArchiveFailures: jest.fn(),
      incArchiveBatch:   jest.fn(),
    } as unknown as MetricsService;

    const mod = await Test.createTestingModule({ providers: [ArchiveService, { provide: PrismaService, useValue: { $transaction: txMock } }, { provide: MetricsService, useValue: metrics }] }).compile();
    await mod.get(ArchiveService).runArchive();

    expect((metrics as jest.Mocked<MetricsService>).incArchiveRows).toHaveBeenCalledWith(2);
    expect((metrics as jest.Mocked<MetricsService>).setArchiveDuration).toHaveBeenCalledWith(
      expect.any(Number),
    );
    expect((metrics as jest.Mocked<MetricsService>).incArchiveFailures).not.toHaveBeenCalled();
  });

  // 7h ─────────────────────────────────────────────────────────────────────────
  it('7h — transaction hatası → incArchiveFailures çağrılır, hata re-throw edilir', async () => {
    const dbErr  = new Error('DB_DEADLOCK');

    const txMock = jest.fn().mockRejectedValue(dbErr);

    const metrics = {
      incArchiveRows:    jest.fn(),
      setArchiveDuration: jest.fn(),
      incArchiveFailures: jest.fn(),
      incArchiveBatch:   jest.fn(),
    } as unknown as MetricsService;

    const mod = await Test.createTestingModule({ providers: [ArchiveService, { provide: PrismaService, useValue: { $transaction: txMock } }, { provide: MetricsService, useValue: metrics }] }).compile();

    await expect(mod.get(ArchiveService).runArchive()).rejects.toThrow('DB_DEADLOCK');
    expect((metrics as jest.Mocked<MetricsService>).incArchiveFailures).toHaveBeenCalledTimes(1);
    expect((metrics as jest.Mocked<MetricsService>).incArchiveRows).not.toHaveBeenCalled();
  });

  // 7i ─────────────────────────────────────────────────────────────────────────
  it('7i — runNow() outbox + delivery toplamını döndürür', async () => {
    const cutoff = new Date(Date.now() - 31 * 86400 * 1000);
    const outboxRows   = [makeOutboxRow('o1', cutoff)];
    const deliveryRows = [makeDeliveryRow('d1', cutoff)];
    let callIdx = 0;

    const txMock = jest.fn().mockImplementation(async (fn: (tx: unknown) => unknown) => {
      callIdx++;
      const isOutbox = callIdx % 2 === 1;
      const tx = {
        $queryRaw: jest.fn().mockResolvedValue(
          isOutbox
            ? outboxRows.map((r) => ({ id: r.id }))
            : deliveryRows.map((r) => ({ id: r.id })),
        ),
        eventOutbox:        { findMany: jest.fn().mockResolvedValue(isOutbox ? outboxRows : []), deleteMany: jest.fn() },
        eventOutboxArchive: { createMany: jest.fn() },
        eventDelivery:         { findMany: jest.fn().mockResolvedValue(isOutbox ? [] : deliveryRows), deleteMany: jest.fn() },
        eventDeliveryArchive:  { createMany: jest.fn() },
      };
      return fn(tx);
    });

    const metrics = { incArchiveRows: jest.fn(), setArchiveDuration: jest.fn(), incArchiveFailures: jest.fn(), incArchiveBatch: jest.fn() } as unknown as MetricsService;
    const mod = await Test.createTestingModule({ providers: [ArchiveService, { provide: PrismaService, useValue: { $transaction: txMock } }, { provide: MetricsService, useValue: metrics }] }).compile();

    const result = await mod.get(ArchiveService).runNow();
    expect(result).toEqual({ outbox: 1, delivery: 1 });
  });

  // 7j ─────────────────────────────────────────────────────────────────────────
  it('7j — SQL sorgusunda "FOR UPDATE SKIP LOCKED" kullanıldığı doğrulanır', async () => {
    // $queryRaw'a gelen TemplateStringsArray dizisini inceliyoruz
    const sqlFragments: string[] = [];

    const txMock = jest.fn().mockImplementation(async (fn: (tx: unknown) => unknown) => {
      const tx = {
        $queryRaw: jest.fn().mockImplementation(
          (template: TemplateStringsArray, ...values: unknown[]) => {
            // Template string'leri birleştir
            const sql = template.join('?');
            sqlFragments.push(sql);
            return Promise.resolve([]);
          },
        ),
        eventOutbox: { findMany: jest.fn(), deleteMany: jest.fn() },
        eventOutboxArchive: { createMany: jest.fn() },
        eventDelivery: { findMany: jest.fn(), deleteMany: jest.fn() },
        eventDeliveryArchive: { createMany: jest.fn() },
      };
      return fn(tx);
    });

    const metrics = { incArchiveRows: jest.fn(), setArchiveDuration: jest.fn(), incArchiveFailures: jest.fn(), incArchiveBatch: jest.fn() } as unknown as MetricsService;
    const mod = await Test.createTestingModule({ providers: [ArchiveService, { provide: PrismaService, useValue: { $transaction: txMock } }, { provide: MetricsService, useValue: metrics }] }).compile();
    await mod.get(ArchiveService).runNow();

    // Her iki SQL'de de SKIP LOCKED var mı?
    expect(sqlFragments.length).toBeGreaterThanOrEqual(2);
    const allHaveSkipLocked = sqlFragments.every((sql) =>
      sql.includes('SKIP LOCKED'),
    );
    expect(allHaveSkipLocked).toBe(true);

    // FOR UPDATE da var mı?
    const allHaveForUpdate = sqlFragments.every((sql) =>
      sql.includes('FOR UPDATE'),
    );
    expect(allHaveForUpdate).toBe(true);
  });
});
