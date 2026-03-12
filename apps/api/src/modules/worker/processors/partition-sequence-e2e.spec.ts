/**
 * TEST 5 — FAZ 24.8: Partition Sequence / Ordering (E2E)
 * ──────────────────────────────────────────────────────────────────────────────
 * Aynı partitionKey'e ait event'ler sıralı (sequential) işlenir.
 * Farklı partitionKey'ler bağımsız ve paralel işlenebilir.
 *
 * Bu test Redis NX lock'un zaten doğru çalıştığını varsayar (Test 3).
 * Buradaki odak nokta:
 *
 *   A. Sıralı aynı partition: event-A biter → lock serbest → event-B alır
 *      Processor düzeyinde: her işlemde redis.set çağrılır, sonra redis.del
 *
 *   B. Paralel farklı partition: iki farklı partitionKey → ikisi de işlenir
 *      (birbirini bloke etmez)
 *
 *   C. Lock release → yeniden kullanım: bir event bittikten sonra aynı lock
 *      başka bir event tarafından alınabilir
 *
 *   D. Lock key'ler farklı partitionKey için birbirini etkilemez
 * ──────────────────────────────────────────────────────────────────────────────
 */

import { Test, TestingModule } from '@nestjs/testing';
import { getQueueToken }       from '@nestjs/bull';
import { DispatcherProcessor } from './dispatcher.processor';
import { PrismaService }       from '../../../common/prisma.service';
import { OutboxRepository }    from '../../event/outbox.repository';
import { DeliveryRepository }  from '../../delivery/delivery.repository';
import { PreferenceResolver }  from '../../notification/preference.resolver';
import { TemplateResolver }    from '../../notification/template.resolver';
import { CostPolicyEngine }    from '../../notification/cost-policy.engine';
import { FailedJobService }    from '../../../common/queue/failed-job.service';
import { QUEUE_NAMES }         from '../../../common/queue/queue-names';
import { MetricsService }      from '../../../common/logging/metrics.service';

// ── Fabrika ───────────────────────────────────────────────────────────────────

function makeEvent(id: string, partitionKey: string) {
  return {
    id,
    tenantId:           'tenant-1',
    status:             'PENDING',
    partitionKey,
    eventName:          'booking.created',
    payload:            { customerId: 'cust-1', customerPhone: '+905001234567' },
    scheduledFor:       new Date(),
    processingStartedAt: null,
    retryCount:         0,
    lastError:          null,
  };
}

// ── Redis call tracker ────────────────────────────────────────────────────────

type RedisCall = { op: 'set'; key: string; result: 'OK' | null } | { op: 'eval'; key: string };

// ── Yardımcı: processor kurulumu ─────────────────────────────────────────────

function buildProcessor(
  outboxFindById: jest.Mock,
  redisMock: { set: jest.Mock; eval: jest.Mock },
) {
  const mockOutbox = {
    findById:          outboxFindById,
    markProcessing:    jest.fn().mockResolvedValue(undefined),
    markDispatched:    jest.fn().mockResolvedValue(undefined),
    markForRetry:      jest.fn().mockResolvedValue(undefined),
    markDelivered:     jest.fn().mockResolvedValue(undefined),
    markDeadLettered:  jest.fn().mockResolvedValue(undefined),
    isPartitionLocked: jest.fn().mockResolvedValue(false),
  };
  const mockDelivery = {
    createIdempotentInTx: jest.fn().mockResolvedValue(null),
  };
  const mockPreference = {
    resolve: jest.fn().mockResolvedValue({ enabledChannels: [] }),
  };
  const mockCostPolicy = {
    getCurrentPeriod: jest.fn().mockReturnValue({ start: new Date(), end: new Date() }),
    checkPolicy: jest.fn().mockResolvedValue({ allowed: true }),
  };
  const mockPrisma = {
    $transaction: jest.fn().mockImplementation(async (fn: (tx: unknown) => unknown) => fn({})),
  };
  const smsQueue = {
    add: jest.fn().mockResolvedValue({ id: 'q-1' }),
    client: redisMock,
  };

  return { mockOutbox, smsQueue, mockPreference, mockPrisma };
}

const mockMetrics = {
  incEventDispatched:     jest.fn(),
  incEventDispatchFailed: jest.fn(),
  incDlq:                 jest.fn(),
};

// ── Test suite ────────────────────────────────────────────────────────────────

describe('DispatcherProcessor — Partition Sequence E2E (FAZ 24.8 Test 5)', () => {

  // ── A: Sıralı aynı partition ──────────────────────────────────────────────

  it('A: aynı partitionKey sıralı işleme — her event set+eval çifti', async () => {
    const redisMock = {
      set:  jest.fn().mockResolvedValue('OK'),
      eval: jest.fn().mockResolvedValue(1),
    };
    const outboxFindById = jest.fn();
    const { mockOutbox, smsQueue, mockPreference, mockPrisma } = buildProcessor(outboxFindById, redisMock);

    outboxFindById
      .mockResolvedValueOnce(makeEvent('event-A', 'booking:uuid-1'))
      .mockResolvedValueOnce(makeEvent('event-B', 'booking:uuid-1'));

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        DispatcherProcessor,
        { provide: PrismaService,       useValue: mockPrisma },
        { provide: OutboxRepository,    useValue: mockOutbox },
        { provide: DeliveryRepository,  useValue: { createIdempotentInTx: jest.fn().mockResolvedValue(null) } },
        { provide: PreferenceResolver,  useValue: mockPreference },
        { provide: TemplateResolver,    useValue: { resolveAndRender: jest.fn().mockResolvedValue(null) } },
        { provide: CostPolicyEngine,    useValue: { getCurrentPeriod: jest.fn().mockReturnValue({ start: new Date(), end: new Date() }), checkPolicy: jest.fn().mockResolvedValue({ allowed: true }) } },
        { provide: FailedJobService,    useValue: { save: jest.fn() } },
        { provide: getQueueToken(QUEUE_NAMES.NOTIFICATION_SMS),   useValue: smsQueue },
        { provide: getQueueToken(QUEUE_NAMES.NOTIFICATION_EMAIL), useValue: { add: jest.fn(), client: redisMock } },
        { provide: getQueueToken(QUEUE_NAMES.NOTIFICATION_PUSH),  useValue: { add: jest.fn(), client: redisMock } },
        { provide: getQueueToken(QUEUE_NAMES.NOTIFICATION_DLQ),   useValue: { add: jest.fn() } },
        { provide: MetricsService, useValue: mockMetrics },
      ],
    }).compile();

    const processor = module.get(DispatcherProcessor);

    // Sıralı işleme
    await processor.handleDispatch({ data: { eventId: 'event-A', tenantId: 'tenant-1' } } as never);
    await processor.handleDispatch({ data: { eventId: 'event-B', tenantId: 'tenant-1' } } as never);

    // Her event için bir set + bir eval (token-safe release)
    expect(redisMock.set).toHaveBeenCalledTimes(2);
    expect(redisMock.eval).toHaveBeenCalledTimes(2);

    // Her iki işlem de aynı lock key'i kullandı
    const setCalls = redisMock.set.mock.calls;
    expect(setCalls[0][0]).toBe('event-partition-lock:booking:uuid-1');
    expect(setCalls[1][0]).toBe('event-partition-lock:booking:uuid-1');

    await module.close();
  });

  // ── B: Paralel farklı partition ───────────────────────────────────────────

  it('B: farklı partitionKey → her ikisi de bağımsız işlenir', async () => {
    const redisMock = {
      set:  jest.fn().mockResolvedValue('OK'), // ikisi de lock alır
      eval: jest.fn().mockResolvedValue(1),
    };
    const outboxFindById = jest.fn();
    const { mockOutbox, smsQueue, mockPreference, mockPrisma } = buildProcessor(outboxFindById, redisMock);

    outboxFindById
      .mockResolvedValueOnce(makeEvent('event-X', 'booking:uuid-X'))
      .mockResolvedValueOnce(makeEvent('event-Y', 'booking:uuid-Y'));

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        DispatcherProcessor,
        { provide: PrismaService,       useValue: mockPrisma },
        { provide: OutboxRepository,    useValue: mockOutbox },
        { provide: DeliveryRepository,  useValue: { createIdempotentInTx: jest.fn().mockResolvedValue(null) } },
        { provide: PreferenceResolver,  useValue: mockPreference },
        { provide: TemplateResolver,    useValue: { resolveAndRender: jest.fn().mockResolvedValue(null) } },
        { provide: CostPolicyEngine,    useValue: { getCurrentPeriod: jest.fn().mockReturnValue({ start: new Date(), end: new Date() }), checkPolicy: jest.fn().mockResolvedValue({ allowed: true }) } },
        { provide: FailedJobService,    useValue: { save: jest.fn() } },
        { provide: getQueueToken(QUEUE_NAMES.NOTIFICATION_SMS),   useValue: smsQueue },
        { provide: getQueueToken(QUEUE_NAMES.NOTIFICATION_EMAIL), useValue: { add: jest.fn(), client: redisMock } },
        { provide: getQueueToken(QUEUE_NAMES.NOTIFICATION_PUSH),  useValue: { add: jest.fn(), client: redisMock } },
        { provide: getQueueToken(QUEUE_NAMES.NOTIFICATION_DLQ),   useValue: { add: jest.fn() } },
        { provide: MetricsService, useValue: mockMetrics },
      ],
    }).compile();

    const processor = module.get(DispatcherProcessor);

    // Paralel işleme (farklı partitionKey → birbirini bloke etmez)
    await Promise.all([
      processor.handleDispatch({ data: { eventId: 'event-X', tenantId: 'tenant-1' } } as never),
      processor.handleDispatch({ data: { eventId: 'event-Y', tenantId: 'tenant-1' } } as never),
    ]);

    expect(redisMock.set).toHaveBeenCalledTimes(2);
    expect(redisMock.eval).toHaveBeenCalledTimes(2);

    // Farklı lock key'ler
    const setCalls = redisMock.set.mock.calls;
    const lockKeys = setCalls.map((c: string[]) => c[0]);
    expect(lockKeys).toContain('event-partition-lock:booking:uuid-X');
    expect(lockKeys).toContain('event-partition-lock:booking:uuid-Y');

    await module.close();
  });

  // ── C: Lock release → yeniden kullanım ───────────────────────────────────

  it('C: ilk event bittikten sonra aynı lock tekrar alınabilir', async () => {
    const setResults = ['OK', 'OK']; // her iki event de lock alır (sıralı)
    let setCallIdx = 0;

    const redisMock = {
      set:  jest.fn().mockImplementation(async () => setResults[setCallIdx++] ?? 'OK'),
      eval: jest.fn().mockResolvedValue(1),
    };
    const outboxFindById = jest.fn();
    const { mockOutbox, smsQueue, mockPreference, mockPrisma } = buildProcessor(outboxFindById, redisMock);

    outboxFindById
      .mockResolvedValueOnce(makeEvent('event-seq-1', 'payment:uuid-1'))
      .mockResolvedValueOnce(makeEvent('event-seq-2', 'payment:uuid-1'));

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        DispatcherProcessor,
        { provide: PrismaService,       useValue: mockPrisma },
        { provide: OutboxRepository,    useValue: mockOutbox },
        { provide: DeliveryRepository,  useValue: { createIdempotentInTx: jest.fn().mockResolvedValue(null) } },
        { provide: PreferenceResolver,  useValue: mockPreference },
        { provide: TemplateResolver,    useValue: { resolveAndRender: jest.fn().mockResolvedValue(null) } },
        { provide: CostPolicyEngine,    useValue: { getCurrentPeriod: jest.fn().mockReturnValue({ start: new Date(), end: new Date() }), checkPolicy: jest.fn().mockResolvedValue({ allowed: true }) } },
        { provide: FailedJobService,    useValue: { save: jest.fn() } },
        { provide: getQueueToken(QUEUE_NAMES.NOTIFICATION_SMS),   useValue: smsQueue },
        { provide: getQueueToken(QUEUE_NAMES.NOTIFICATION_EMAIL), useValue: { add: jest.fn(), client: redisMock } },
        { provide: getQueueToken(QUEUE_NAMES.NOTIFICATION_PUSH),  useValue: { add: jest.fn(), client: redisMock } },
        { provide: getQueueToken(QUEUE_NAMES.NOTIFICATION_DLQ),   useValue: { add: jest.fn() } },
        { provide: MetricsService, useValue: mockMetrics },
      ],
    }).compile();

    const processor = module.get(DispatcherProcessor);

    // event-seq-1 işle (lock al → serbest bırak)
    await processor.handleDispatch({ data: { eventId: 'event-seq-1', tenantId: 'tenant-1' } } as never);
    // event-seq-2 işle (lock tekrar alınabilmeli)
    await processor.handleDispatch({ data: { eventId: 'event-seq-2', tenantId: 'tenant-1' } } as never);

    // Her ikisi de başarıyla lock aldı
    expect(redisMock.set).toHaveBeenCalledTimes(2);
    expect(redisMock.eval).toHaveBeenCalledTimes(2);

    // eval her seferinde doğru key ile çağrıldı (KEYS[1] = lockKey)
    const evalCalls = redisMock.eval.mock.calls as [string, number, string, string][];
    expect(evalCalls[0][2]).toBe('event-partition-lock:payment:uuid-1');
    expect(evalCalls[1][2]).toBe('event-partition-lock:payment:uuid-1');

    await module.close();
  });

  // ── D: Farklı partitionKey'ler birbirini etkilemez ────────────────────────

  it('D: farklı lock key\'ler birbirini engellemez (NX key isolation)', async () => {
    const lockState = new Map<string, boolean>();
    const redisMock = {
      set: jest.fn().mockImplementation(async (key: string) => {
        if (lockState.get(key)) return null;
        lockState.set(key, true);
        return 'OK';
      }),
      // eval(script, numkeys, lockKey, lockToken) → token-safe release
      eval: jest.fn().mockImplementation(async (_script: string, _n: number, key: string) => {
        lockState.delete(key);
        return 1;
      }),
    };

    const outboxFindById = jest.fn()
      .mockResolvedValueOnce(makeEvent('event-part-A', 'booking:aaa'))
      .mockResolvedValueOnce(makeEvent('event-part-B', 'booking:bbb'));

    const { mockOutbox, smsQueue, mockPreference, mockPrisma } = buildProcessor(outboxFindById, redisMock);

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        DispatcherProcessor,
        { provide: PrismaService,       useValue: mockPrisma },
        { provide: OutboxRepository,    useValue: mockOutbox },
        { provide: DeliveryRepository,  useValue: { createIdempotentInTx: jest.fn().mockResolvedValue(null) } },
        { provide: PreferenceResolver,  useValue: mockPreference },
        { provide: TemplateResolver,    useValue: { resolveAndRender: jest.fn().mockResolvedValue(null) } },
        { provide: CostPolicyEngine,    useValue: { getCurrentPeriod: jest.fn().mockReturnValue({ start: new Date(), end: new Date() }), checkPolicy: jest.fn().mockResolvedValue({ allowed: true }) } },
        { provide: FailedJobService,    useValue: { save: jest.fn() } },
        { provide: getQueueToken(QUEUE_NAMES.NOTIFICATION_SMS),   useValue: smsQueue },
        { provide: getQueueToken(QUEUE_NAMES.NOTIFICATION_EMAIL), useValue: { add: jest.fn(), client: redisMock } },
        { provide: getQueueToken(QUEUE_NAMES.NOTIFICATION_PUSH),  useValue: { add: jest.fn(), client: redisMock } },
        { provide: getQueueToken(QUEUE_NAMES.NOTIFICATION_DLQ),   useValue: { add: jest.fn() } },
        { provide: MetricsService, useValue: mockMetrics },
      ],
    }).compile();

    const processor = module.get(DispatcherProcessor);

    const results = await Promise.allSettled([
      processor.handleDispatch({ data: { eventId: 'event-part-A', tenantId: 'tenant-1' } } as never),
      processor.handleDispatch({ data: { eventId: 'event-part-B', tenantId: 'tenant-1' } } as never),
    ]);

    // Her iki event de başarıyla işlendi (farklı key → çakışmaz)
    expect(results.every(r => r.status === 'fulfilled')).toBe(true);

    await module.close();
  });
});
