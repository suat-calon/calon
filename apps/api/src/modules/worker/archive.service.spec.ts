/**
 * MVP-GATE-1: ArchiveService — Unit Tests
 * ──────────────────────────────────────────────────────────────────────────────
 * Doğrulanan davranışlar:
 *
 *   A. Boş tablo → 0 döner, createMany/deleteMany çağrılmaz
 *
 *   B. Arşivlenecek satırlar varsa:
 *      - eventOutboxArchive.createMany(skipDuplicates: true) çağrılır
 *      - eventOutbox.deleteMany doğru ID'lerle çağrılır
 *      - Dönüş değeri satır sayısını yansıtır
 *
 *   C. Delivery arşivleme: aynı iki adım eventDelivery için
 *
 *   D. runArchive():
 *      - metrics.incArchiveRows(total) çağrılır
 *      - metrics.setArchiveDuration(ms) çağrılır
 *
 *   E. runArchive() hata durumunda:
 *      - metrics.incArchiveFailures() çağrılır
 *      - Hata yeniden fırlatılır
 *
 *   F. Güvenlik: aktif durumlar (PENDING/PROCESSING/DISPATCHED) arşivlenmez
 *      (mock WHERE filtresi bu testi temsil eder)
 * ──────────────────────────────────────────────────────────────────────────────
 */

import { ArchiveService } from './archive.service';

// ── Prisma mock ───────────────────────────────────────────────────────────────
//
// Yeni mimari: SELECT + INSERT + DELETE aynı $transaction içinde.
// $queryRaw → FOR UPDATE SKIP LOCKED → [{id}] listesi
// tx.eventOutbox.findMany / tx.eventDelivery.findMany → tam satırlar
// tx.eventOutboxArchive.createMany / tx.eventDeliveryArchive.createMany → arşiv
// tx.eventOutbox.deleteMany / tx.eventDelivery.deleteMany → silme

function makeTx(outboxRows: object[], deliveryRows: object[]) {
  const outboxIds   = outboxRows.map((r) => ({ id: (r as { id: string }).id }));
  const deliveryIds = deliveryRows.map((r) => ({ id: (r as { id: string }).id }));

  // $queryRaw, Prisma tagged template literal olarak çağrılır:
  //   tx.$queryRaw`SELECT id FROM "event_outbox" ...`
  // Jest mock: (strings: TemplateStringsArray, ...values) alır.
  // strings[0] tablo adını içerir → "event_outbox" vs "event_delivery".
  return {
    $queryRaw: jest.fn().mockImplementation(
      async (strings: TemplateStringsArray) => {
        const sql = strings[0] ?? '';
        if (sql.includes('event_outbox'))   return outboxIds;
        if (sql.includes('event_delivery')) return deliveryIds;
        return [];
      },
    ),
    eventOutbox:          {
      findMany:  jest.fn().mockResolvedValue(outboxRows),
      deleteMany: jest.fn().mockResolvedValue({ count: outboxRows.length }),
    },
    eventDelivery:        {
      findMany:  jest.fn().mockResolvedValue(deliveryRows),
      deleteMany: jest.fn().mockResolvedValue({ count: deliveryRows.length }),
    },
    eventOutboxArchive:   { createMany: jest.fn().mockResolvedValue({ count: outboxRows.length }) },
    eventDeliveryArchive: { createMany: jest.fn().mockResolvedValue({ count: deliveryRows.length }) },
  };
}

type TxType = ReturnType<typeof makeTx>;

function makePrisma(outboxRows: object[], deliveryRows: object[]) {
  const tx = makeTx(outboxRows, deliveryRows);
  return {
    $transaction: jest.fn().mockImplementation(
      async (fn: (t: TxType) => unknown) => fn(tx),
    ),
    _tx: tx, // test erişimi
  };
}

// ── MetricsService mock ───────────────────────────────────────────────────────

function makeMockMetrics() {
  return {
    incArchiveRows:     jest.fn(),
    setArchiveDuration: jest.fn(),
    incArchiveFailures: jest.fn(),
    incArchiveBatch:    jest.fn(),
  };
}

// ── Outbox satır fabrikası ────────────────────────────────────────────────────

function makeOutboxRow(id: string) {
  return {
    id,
    tenantId:            'tenant-1',
    aggregateType:       'booking',
    aggregateId:         'agg-1',
    eventName:           'booking.created',
    eventVersion:        1,
    occurredAt:          new Date('2026-01-01'),
    scheduledFor:        new Date('2026-01-01'),
    status:              'DELIVERED',
    partitionKey:        'booking:agg-1',
    correlationId:       null,
    causationId:         null,
    idempotencyKey:      `idem-${id}`,
    payload:             { foo: 'bar' },
    metadata:            {},
    dispatchedAt:        new Date('2026-01-01'),
    processingStartedAt: new Date('2026-01-01'),
    completedAt:         new Date('2026-01-01'),
    retryCount:          0,
    nextRetryAt:         null,
    lastError:           null,
    createdAt:           new Date('2026-01-01'),
    updatedAt:           new Date('2026-01-01'),
  };
}

// ── Delivery satır fabrikası ──────────────────────────────────────────────────

function makeDeliveryRow(id: string) {
  return {
    id,
    tenantId:          'tenant-1',
    eventId:           'event-1',
    channel:           'SMS',
    recipient:         '+905001234567',
    templateKey:       'booking.created.sms.v1',
    templateVersion:   1,
    locale:            'tr',
    provider:          'stub',
    providerMessageId: 'msg-1',
    status:            'DELIVERED',
    idempotencyKey:    `idem-${id}`,
    payload:           { body: 'test' },
    costEstimateMinor: 5,
    actualCostMinor:   5,
    attempts:          1,
    lastAttemptAt:     new Date('2026-01-01'),
    nextAttemptAt:     null,
    lastErrorCode:     null,
    lastErrorMessage:  null,
    sentAt:            new Date('2026-01-01'),
    deliveredAt:       new Date('2026-01-01'),
    createdAt:         new Date('2026-01-01'),
    updatedAt:         new Date('2026-01-01'),
  };
}

// ── Test suite ────────────────────────────────────────────────────────────────

describe('ArchiveService — MVP-GATE-1', () => {

  // ── A: Boş tablo ─────────────────────────────────────────────────────────

  describe('A: boş tablo → 0 döner, createMany çağrılmaz', () => {
    it('runNow() outbox ve delivery boşsa { outbox: 0, delivery: 0 }', async () => {
      const prisma  = makePrisma([], []);
      const metrics = makeMockMetrics();
      const svc = new ArchiveService(prisma as never, metrics as never);

      const result = await svc.runNow();

      expect(result).toEqual({ outbox: 0, delivery: 0 });
    });

    it('boş outbox → createMany çağrılmaz', async () => {
      const prisma  = makePrisma([], []);
      const metrics = makeMockMetrics();
      const svc = new ArchiveService(prisma as never, metrics as never);

      await svc.runNow();

      // $transaction çağrılır (SELECT içeride) ama createMany çağrılmaz
      const tx = (prisma as unknown as { _tx: ReturnType<typeof makeTx> })._tx;
      expect(tx.eventOutboxArchive.createMany).not.toHaveBeenCalled();
      expect(tx.eventDeliveryArchive.createMany).not.toHaveBeenCalled();
    });
  });

  // ── B: Outbox arşivleme ───────────────────────────────────────────────────

  describe('B: eventOutbox arşivleme', () => {
    it('satırlar varsa createMany + deleteMany çağrılır', async () => {
      const rows = [makeOutboxRow('out-1'), makeOutboxRow('out-2')];
      const prisma  = makePrisma(rows, []);
      const metrics = makeMockMetrics();
      const svc = new ArchiveService(prisma as never, metrics as never);

      const result = await svc.runNow();

      expect(result.outbox).toBe(2);
      const tx = (prisma as unknown as { _tx: ReturnType<typeof makeTx> })._tx;
      expect(tx.eventOutboxArchive.createMany).toHaveBeenCalledTimes(1);
      const createManyArg = tx.eventOutboxArchive.createMany.mock.calls[0][0];
      expect(createManyArg.skipDuplicates).toBe(true);
      expect(createManyArg.data).toHaveLength(2);
    });

    it('deleteMany doğru ID\'lerle çağrılır', async () => {
      const rows = [makeOutboxRow('out-A'), makeOutboxRow('out-B')];
      const prisma  = makePrisma(rows, []);
      const metrics = makeMockMetrics();
      const svc = new ArchiveService(prisma as never, metrics as never);

      await svc.runNow();

      const tx = (prisma as unknown as { _tx: ReturnType<typeof makeTx> })._tx;
      expect(tx.eventOutbox.deleteMany).toHaveBeenCalledWith({
        where: { id: { in: ['out-A', 'out-B'] } },
      });
    });

    it('createMany data outbox row alanlarını içerir', async () => {
      const row = makeOutboxRow('out-chk');
      const prisma  = makePrisma([row], []);
      const metrics = makeMockMetrics();
      const svc = new ArchiveService(prisma as never, metrics as never);

      await svc.runNow();

      const tx = (prisma as unknown as { _tx: ReturnType<typeof makeTx> })._tx;
      const data = tx.eventOutboxArchive.createMany.mock.calls[0][0].data[0];
      expect(data.id).toBe('out-chk');
      expect(data.tenantId).toBe('tenant-1');
      expect(data.eventName).toBe('booking.created');
      expect(data.status).toBe('DELIVERED');
    });
  });

  // ── C: Delivery arşivleme ─────────────────────────────────────────────────

  describe('C: eventDelivery arşivleme', () => {
    it('satırlar varsa createMany + deleteMany çağrılır', async () => {
      const rows = [makeDeliveryRow('del-1'), makeDeliveryRow('del-2'), makeDeliveryRow('del-3')];
      const prisma  = makePrisma([], rows);
      const metrics = makeMockMetrics();
      const svc = new ArchiveService(prisma as never, metrics as never);

      const result = await svc.runNow();

      expect(result.delivery).toBe(3);
      const tx = (prisma as unknown as { _tx: ReturnType<typeof makeTx> })._tx;
      expect(tx.eventDeliveryArchive.createMany).toHaveBeenCalledTimes(1);
      const createManyArg = tx.eventDeliveryArchive.createMany.mock.calls[0][0];
      expect(createManyArg.skipDuplicates).toBe(true);
      expect(createManyArg.data).toHaveLength(3);
    });

    it('deleteMany doğru delivery ID\'leriyle çağrılır', async () => {
      const rows = [makeDeliveryRow('del-X')];
      const prisma  = makePrisma([], rows);
      const metrics = makeMockMetrics();
      const svc = new ArchiveService(prisma as never, metrics as never);

      await svc.runNow();

      const tx = (prisma as unknown as { _tx: ReturnType<typeof makeTx> })._tx;
      expect(tx.eventDelivery.deleteMany).toHaveBeenCalledWith({
        where: { id: { in: ['del-X'] } },
      });
    });
  });

  // ── D: runArchive() metrics ───────────────────────────────────────────────

  describe('D: runArchive() — metrik kayıt', () => {
    it('incArchiveRows toplam (outbox + delivery) ile çağrılır', async () => {
      const prisma  = makePrisma(
        [makeOutboxRow('o1'), makeOutboxRow('o2')],   // 2 outbox
        [makeDeliveryRow('d1')],                       // 1 delivery
      );
      const metrics = makeMockMetrics();
      const svc = new ArchiveService(prisma as never, metrics as never);

      await svc.runArchive();

      expect(metrics.incArchiveRows).toHaveBeenCalledTimes(1);
      expect(metrics.incArchiveRows).toHaveBeenCalledWith(3); // 2 + 1
    });

    it('setArchiveDuration milisaniye ile çağrılır', async () => {
      const prisma  = makePrisma([], []);
      const metrics = makeMockMetrics();
      const svc = new ArchiveService(prisma as never, metrics as never);

      await svc.runArchive();

      expect(metrics.setArchiveDuration).toHaveBeenCalledTimes(1);
      const ms = metrics.setArchiveDuration.mock.calls[0][0];
      expect(typeof ms).toBe('number');
      expect(ms).toBeGreaterThanOrEqual(0);
    });

    it('boş tablolarda da metrics güncellenir (0 satır)', async () => {
      const prisma  = makePrisma([], []);
      const metrics = makeMockMetrics();
      const svc = new ArchiveService(prisma as never, metrics as never);

      await svc.runArchive();

      expect(metrics.incArchiveRows).toHaveBeenCalledWith(0);
    });
  });

  // ── E: runArchive() hata durumu ───────────────────────────────────────────

  describe('E: runArchive() hata → incArchiveFailures + rethrow', () => {
    it('DB hatası → metrics.incArchiveFailures çağrılır', async () => {
      // $transaction kendisi hata fırlatır
      const prisma = {
        $transaction: jest.fn().mockRejectedValue(new Error('DB kesinti')),
      };
      const metrics = makeMockMetrics();
      const svc = new ArchiveService(prisma as never, metrics as never);

      await expect(svc.runArchive()).rejects.toThrow('DB kesinti');
      expect(metrics.incArchiveFailures).toHaveBeenCalledTimes(1);
    });

    it('DB hatası → incArchiveRows çağrılmaz', async () => {
      const prisma = {
        $transaction: jest.fn().mockRejectedValue(new Error('Hata')),
      };
      const metrics = makeMockMetrics();
      const svc = new ArchiveService(prisma as never, metrics as never);

      await expect(svc.runArchive()).rejects.toThrow();
      expect(metrics.incArchiveRows).not.toHaveBeenCalled();
    });
  });

  // ── F: Güvenlik — sadece terminal satırlar ────────────────────────────────
  // Yeni mimari: filtre SQL ($queryRaw) içinde; statüler tagged template
  // argümanları olarak geçirilir. SQL içeriği kontrolü ile doğrulanır.

  describe('F: $queryRaw doğru SQL ile çağrılır', () => {
    it('outbox $queryRaw çağrısı DELIVERED/DEAD_LETTERED/CANCELLED içerir', async () => {
      const prisma  = makePrisma([], []);
      const metrics = makeMockMetrics();
      const svc = new ArchiveService(prisma as never, metrics as never);

      await svc.runNow();

      const tx = (prisma as unknown as { _tx: TxType })._tx;
      expect(tx.$queryRaw).toHaveBeenCalled();

      // İlk çağrı outbox için (veya delivery için) — SQL string argümanı kontrol
      const calls = tx.$queryRaw.mock.calls as [string[]][];
      const outboxCall = calls.find(([strings]) =>
        (strings[0] ?? '').includes('event_outbox'),
      );
      expect(outboxCall).toBeDefined();

      // Statü değerleri query args olarak geçirilir (template literal values)
      // outboxCall: [strings, ...values] → values içinde DELIVERED, DEAD_LETTERED, CANCELLED
      const outboxArgs = outboxCall as [string[], ...string[]];
      const statusValues = outboxArgs.slice(1, 4); // üç statü değeri
      expect(statusValues).toEqual(
        expect.arrayContaining(['DELIVERED', 'DEAD_LETTERED', 'CANCELLED']),
      );
      // Aktif durumlar OLMAMALI
      expect(statusValues).not.toContain('PENDING');
      expect(statusValues).not.toContain('PROCESSING');
      expect(statusValues).not.toContain('DISPATCHED');
    });

    it('outbox $queryRaw çağrısı cutoff (Date) içerir', async () => {
      const prisma  = makePrisma([], []);
      const metrics = makeMockMetrics();
      const svc = new ArchiveService(prisma as never, metrics as never);

      await svc.runNow();

      const tx = (prisma as unknown as { _tx: TxType })._tx;
      const calls = tx.$queryRaw.mock.calls as [string[], ...unknown[]][];
      const outboxCall = calls.find(([strings]) =>
        (strings[0] ?? '').includes('event_outbox'),
      );
      expect(outboxCall).toBeDefined();

      // Cutoff değeri (Date) template args içinde olmalı
      const templateArgs = (outboxCall as unknown[]).slice(1);
      const hasDate = templateArgs.some((v) => v instanceof Date);
      expect(hasDate).toBe(true);
    });
  });
});
