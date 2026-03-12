/**
 * TEST 3 — FAZ 24.8: Partition Concurrency Guard (Redis NX Lock)
 * ──────────────────────────────────────────────────────────────────────────────
 * DispatcherProcessor, aynı partitionKey için iki paralel dispatcher çalıştığında
 * Redis SET NX ile yalnızca birinin işlem yapmasını sağlar.
 *
 * Mock mimarisi:
 *   - (this.smsQueue as any).client → ioredis mock
 *   - redis.set(key, value, 'PX', 30000, 'NX') → 'OK' (lock alındı) veya null (kilitli)
 *   - redis.del(key) → her zaman 1
 *
 * Doğrulanan davranışlar:
 *   A. İlk dispatcher lock alır → set 'OK' → işlem ilerler
 *   B. İkinci dispatcher lock alamaz → set null → PARTITION_LOCKED throw
 *   C. İlk dispatcher finally'de lock'u serbest bırakır → redis.del çağrılır
 *   D. Lock key formatı: `event-partition-lock:{partitionKey}`
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

// ── Outbox event fabrikası ────────────────────────────────────────────────────

function makeEvent(partitionKey = 'booking:uuid-123') {
  return {
    id:                 'event-part-1',
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

// ── Redis mock ────────────────────────────────────────────────────────────────

const mockRedis = {
  set:  jest.fn(),
  eval: jest.fn().mockResolvedValue(1), // token-safe release
};

// ── Outbox mock ───────────────────────────────────────────────────────────────

const mockOutbox = {
  findById:           jest.fn(),
  markProcessing:     jest.fn().mockResolvedValue(undefined),
  markDispatched:     jest.fn().mockResolvedValue(undefined),
  markForRetry:       jest.fn().mockResolvedValue(undefined),
  markDelivered:      jest.fn().mockResolvedValue(undefined),
  markDeadLettered:   jest.fn().mockResolvedValue(undefined),
  isPartitionLocked:  jest.fn().mockResolvedValue(false), // artık kullanılmıyor
};

const mockDelivery = {
  createIdempotentInTx: jest.fn().mockResolvedValue(null), // duplicate prevention
};

const mockPreference = {
  resolve: jest.fn().mockResolvedValue({ enabledChannels: [] }), // kanal yok → markDelivered
};
const mockTemplate = { resolveAndRender: jest.fn().mockResolvedValue(null) };
const mockCostPolicy = {
  getCurrentPeriod: jest.fn().mockReturnValue({
    start: new Date('2026-03-01'),
    end:   new Date('2026-03-31'),
  }),
  checkPolicy: jest.fn().mockResolvedValue({ allowed: true }),
};
const mockFailedJobs = { save: jest.fn().mockResolvedValue(undefined) };

const mockMetrics = {
  incEventDispatched:     jest.fn(),
  incEventDispatchFailed: jest.fn(),
  incDlq:                 jest.fn(),
};

const mockPrisma = {
  $transaction: jest.fn().mockImplementation(async (fn: (tx: unknown) => unknown) => fn({})),
};

const makeQueue = () => ({
  add:    jest.fn().mockResolvedValue({ id: 'q-1' }),
  // Bull v4: .client is the ioredis instance
  client: mockRedis,
});

// ── Test suite ────────────────────────────────────────────────────────────────

describe('DispatcherProcessor — Partition Lock (Redis NX) (FAZ 24.8 Test 3)', () => {
  let processor: DispatcherProcessor;
  let smsQueue: ReturnType<typeof makeQueue>;
  let module: TestingModule;

  beforeEach(async () => {
    jest.clearAllMocks();
    smsQueue = makeQueue();

    module = await Test.createTestingModule({
      providers: [
        DispatcherProcessor,
        { provide: PrismaService,       useValue: mockPrisma },
        { provide: OutboxRepository,    useValue: mockOutbox },
        { provide: DeliveryRepository,  useValue: mockDelivery },
        { provide: PreferenceResolver,  useValue: mockPreference },
        { provide: TemplateResolver,    useValue: mockTemplate },
        { provide: CostPolicyEngine,    useValue: mockCostPolicy },
        { provide: FailedJobService,    useValue: mockFailedJobs },
        { provide: getQueueToken(QUEUE_NAMES.NOTIFICATION_SMS),   useValue: smsQueue },
        { provide: getQueueToken(QUEUE_NAMES.NOTIFICATION_EMAIL), useValue: makeQueue() },
        { provide: getQueueToken(QUEUE_NAMES.NOTIFICATION_PUSH),  useValue: makeQueue() },
        { provide: getQueueToken(QUEUE_NAMES.NOTIFICATION_DLQ),   useValue: makeQueue() },
        { provide: MetricsService,                                 useValue: mockMetrics },
      ],
    }).compile();

    processor = module.get(DispatcherProcessor);
  });

  afterEach(async () => {
    await module.close();
  });

  // ── A: Lock alındığında işlem ilerler ────────────────────────────────────

  it('A: redis.set NX "OK" döndüğünde markProcessing çağrılır', async () => {
    mockOutbox.findById.mockResolvedValueOnce(makeEvent());
    mockRedis.set.mockResolvedValueOnce('OK');

    const job = { data: { eventId: 'event-part-1', tenantId: 'tenant-1' } } as never;
    await processor.handleDispatch(job);

    expect(mockOutbox.markProcessing).toHaveBeenCalledTimes(1);
    expect(mockRedis.eval).toHaveBeenCalledTimes(1);
  });

  // ── B: Lock alınamadığında PARTITION_LOCKED fırlatılır ───────────────────

  it('B: redis.set NX null döndüğünde PARTITION_LOCKED throw edilir', async () => {
    mockOutbox.findById.mockResolvedValueOnce(makeEvent());
    mockRedis.set.mockResolvedValueOnce(null); // başka dispatcher kilitli

    const job = { data: { eventId: 'event-part-1', tenantId: 'tenant-1' } } as never;

    await expect(processor.handleDispatch(job)).rejects.toThrow('PARTITION_LOCKED');
    expect(mockOutbox.markProcessing).not.toHaveBeenCalled();
  });

  it('B: PARTITION_LOCKED exception mesajı partitionKey içerir', async () => {
    const partKey = 'booking:specific-uuid-456';
    mockOutbox.findById.mockResolvedValueOnce(makeEvent(partKey));
    mockRedis.set.mockResolvedValueOnce(null);

    const job = { data: { eventId: 'event-part-1', tenantId: 'tenant-1' } } as never;

    await expect(processor.handleDispatch(job)).rejects.toThrow(partKey);
  });

  // ── C: Lock her zaman finally'de serbest bırakılır ───────────────────────

  it('C: başarılı işlem sonrası redis.eval (token-safe release) çağrılır (finally)', async () => {
    mockOutbox.findById.mockResolvedValueOnce(makeEvent());
    mockRedis.set.mockResolvedValueOnce('OK');

    await processor.handleDispatch({ data: { eventId: 'event-part-1', tenantId: 'tenant-1' } } as never);

    expect(mockRedis.eval).toHaveBeenCalledTimes(1);
    // eval(script, 1, lockKey, lockToken) — token UUID, key içerir
    const [, numkeys, lockKey] = mockRedis.eval.mock.calls[0] as [string, number, string, string];
    expect(numkeys).toBe(1);
    expect(lockKey).toMatch(/^event-partition-lock:/);
  });

  it('C: processEvent hatası durumunda da redis.eval çağrılır (finally)', async () => {
    const event = makeEvent();
    mockOutbox.findById.mockResolvedValueOnce(event);
    mockRedis.set.mockResolvedValueOnce('OK');

    // processEvent içinde patlat
    mockPreference.resolve.mockRejectedValueOnce(new Error('DB bağlantısı kesildi'));

    const job = { data: { eventId: 'event-part-1', tenantId: 'tenant-1' } } as never;

    await expect(processor.handleDispatch(job)).rejects.toThrow();

    // Lock yine de token-safe şekilde serbest bırakılmalı
    expect(mockRedis.eval).toHaveBeenCalledTimes(1);
  });

  // ── D: Lock key formatı ───────────────────────────────────────────────────

  it('D: lock key formatı "event-partition-lock:{partitionKey}" olmalı', async () => {
    const partKey = 'booking:uuid-789';
    mockOutbox.findById.mockResolvedValueOnce(makeEvent(partKey));
    mockRedis.set.mockResolvedValueOnce('OK');

    await processor.handleDispatch({ data: { eventId: 'event-part-1', tenantId: 'tenant-1' } } as never);

    // Lock value artık eventId değil, UUID token
    expect(mockRedis.set).toHaveBeenCalledWith(
      `event-partition-lock:${partKey}`,
      expect.any(String), // UUID lockToken
      'PX',
      30_000,
      'NX',
    );
    // Token eval'da da kullanılır
    const setToken   = mockRedis.set.mock.calls[0][1] as string;
    const evalArgs   = mockRedis.eval.mock.calls[0] as [string, number, string, string];
    expect(evalArgs[2]).toBe(`event-partition-lock:${partKey}`); // KEYS[1]
    expect(evalArgs[3]).toBe(setToken);                           // ARGV[1] = same token
  });

  // ── İki paralel dispatcher ────────────────────────────────────────────────

  it('iki paralel dispatcher, aynı partitionKey → biri işler, diğeri PARTITION_LOCKED', async () => {
    mockOutbox.findById.mockResolvedValue(makeEvent());

    // İlk dispatcher lock alır, ikincisi alamaz
    mockRedis.set
      .mockResolvedValueOnce('OK')   // dispatcher-1
      .mockResolvedValueOnce(null);  // dispatcher-2

    const job = { data: { eventId: 'event-part-1', tenantId: 'tenant-1' } } as never;

    const results = await Promise.allSettled([
      processor.handleDispatch(job),
      processor.handleDispatch(job),
    ]);

    const fulfilled = results.filter(r => r.status === 'fulfilled');
    const rejected  = results.filter(r => r.status === 'rejected');

    expect(fulfilled).toHaveLength(1);
    expect(rejected).toHaveLength(1);
    expect((rejected[0] as PromiseRejectedResult).reason.message).toContain('PARTITION_LOCKED');
    expect(mockOutbox.markProcessing).toHaveBeenCalledTimes(1);
  });

  // ── Terminal durumda lock alınmaz ─────────────────────────────────────────

  it('DISPATCHED event → lock alınmadan erken dön', async () => {
    const event = { ...makeEvent(), status: 'DISPATCHED' };
    mockOutbox.findById.mockResolvedValueOnce(event);

    await processor.handleDispatch({ data: { eventId: 'event-part-1', tenantId: 'tenant-1' } } as never);

    expect(mockRedis.set).not.toHaveBeenCalled();
    expect(mockRedis.eval).not.toHaveBeenCalled();
  });
});
