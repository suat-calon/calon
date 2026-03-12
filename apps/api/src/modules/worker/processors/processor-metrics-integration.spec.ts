/**
 * MVP-GATE-1: Processor → MetricsService Integration
 * ──────────────────────────────────────────────────────────────────────────────
 * Her processor'ın doğru MetricsService metodunu çağırdığını doğrular.
 *
 *   A. SmsDeliveryProcessor
 *      - başarılı send  → incSmsSent()
 *      - provider hata  → incSmsFailed()
 *      - DLQ tetiklenir → incDlq()
 *
 *   B. DispatcherProcessor
 *      - başarılı dispatch → incEventDispatched()
 *      - hata / PARTITION_LOCKED değil → incEventDispatchFailed()
 *
 * Bu testler MetricsService'i spy ile kullanır; gerçek uygulama çalışır.
 * ──────────────────────────────────────────────────────────────────────────────
 */

import { Test, TestingModule }  from '@nestjs/testing';
import { getQueueToken }        from '@nestjs/bull';

import { SmsDeliveryProcessor } from './sms-delivery.processor';
import { DispatcherProcessor }  from './dispatcher.processor';

import { DeliveryRepository }      from '../../delivery/delivery.repository';
import { OutboxRepository }        from '../../event/outbox.repository';
import { ProviderRegistryService } from '../../provider/provider-registry.service';
import { CostPolicyEngine }        from '../../notification/cost-policy.engine';
import { FailedJobService }        from '../../../common/queue/failed-job.service';
import { PrismaService }           from '../../../common/prisma.service';
import { QUEUE_NAMES }             from '../../../common/queue/queue-names';
import { MetricsService }          from '../../../common/logging/metrics.service';
import { TemplateResolver }        from '../../notification/template.resolver';
import { PreferenceResolver }      from '../../notification/preference.resolver';
import { MAX_DELIVERY_ATTEMPTS }   from '../../delivery/retry-policy';

// ── Yardımcı: claimed delivery row ────────────────────────────────────────────

function makeClaimedRow(overrides: Partial<{
  id: string;
  channel: string;
  attempts: number;
  recipient: string;
  tenantId: string;
  eventId: string;
}> = {}) {
  return {
    id:                'del-metrics-1',
    tenantId:          'tenant-1',
    eventId:           'event-metrics-1',
    channel:           'SMS',
    recipient:         '+905001234567',
    payload:           { body: 'Metrics test mesajı' },
    idempotencyKey:    'key-metrics',
    costEstimateMinor: null,
    attempts:          1,
    ...overrides,
  };
}

// ── Yardımcı: outbox event ─────────────────────────────────────────────────────

function makeEvent(id = 'event-metrics') {
  return {
    id,
    tenantId:            'tenant-1',
    status:              'PENDING',
    partitionKey:        'booking:uuid-metrics',
    eventName:           'booking.created',
    payload:             { customerId: 'cust-1', customerPhone: '+905001234567' },
    scheduledFor:        new Date(),
    processingStartedAt: null,
    retryCount:          0,
    lastError:           null,
  };
}

// ── A: SmsDeliveryProcessor metrics ──────────────────────────────────────────

describe('A: SmsDeliveryProcessor — MetricsService integration', () => {
  let processor:   SmsDeliveryProcessor;
  let realMetrics: MetricsService;
  let incSmsSent:  jest.SpyInstance;
  let incSmsFailed: jest.SpyInstance;
  let incDlq:      jest.SpyInstance;
  let outerModule: import('@nestjs/testing').TestingModule;

  const mockDelivery = {
    claimForProcessing:   jest.fn(),
    markSent:             jest.fn().mockResolvedValue(undefined),
    markFailedWithRetry:  jest.fn().mockResolvedValue(undefined),
    markPermanentFailure: jest.fn().mockResolvedValue(undefined),
    areAllDelivered:      jest.fn().mockResolvedValue(false),
    incrementUsage:       jest.fn().mockResolvedValue(undefined),
  };

  const mockOutbox    = { markDelivered: jest.fn().mockResolvedValue(undefined) };
  const mockCostPolicy = {
    getCurrentPeriod: jest.fn().mockReturnValue({
      start: new Date('2026-03-01'),
      end:   new Date('2026-03-31'),
    }),
  };
  const mockFailedJobs = { save: jest.fn().mockResolvedValue(undefined) };
  const makeQueue = () => ({ add: jest.fn().mockResolvedValue({ id: 'j1' }) });

  beforeEach(async () => {
    jest.clearAllMocks();
    realMetrics  = new MetricsService();
    incSmsSent   = jest.spyOn(realMetrics, 'incSmsSent');
    incSmsFailed = jest.spyOn(realMetrics, 'incSmsFailed');
    incDlq       = jest.spyOn(realMetrics, 'incDlq');

    outerModule = await Test.createTestingModule({
      providers: [
        SmsDeliveryProcessor,
        { provide: DeliveryRepository,      useValue: mockDelivery },
        { provide: OutboxRepository,        useValue: mockOutbox },
        { provide: ProviderRegistryService, useValue: { getSmsProvider: jest.fn() } },
        { provide: CostPolicyEngine,        useValue: mockCostPolicy },
        { provide: FailedJobService,        useValue: mockFailedJobs },
        { provide: getQueueToken(QUEUE_NAMES.NOTIFICATION_SMS), useValue: makeQueue() },
        { provide: getQueueToken(QUEUE_NAMES.NOTIFICATION_DLQ), useValue: makeQueue() },
        { provide: MetricsService,          useValue: realMetrics },
      ],
    }).compile();

    processor = outerModule.get(SmsDeliveryProcessor);
  });

  afterEach(async () => {
    await outerModule.close();
  });

  it('başarılı SMS gönderimi → incSmsSent() 1 kez çağrılır', async () => {
    mockDelivery.claimForProcessing.mockResolvedValueOnce(makeClaimedRow());

    // Provider başarılı
    const mockProvider = {
      send: jest.fn().mockResolvedValue({
        providerMessageId: 'msg-ok',
        provider:          'stub',
        costEstimateMinor: 5,
      }),
    };
    (processor as unknown as { providers: unknown }).providers =
      { getSmsProvider: () => mockProvider };

    // Re-build module with correct provider mock
    const mp = { getSmsProvider: jest.fn().mockReturnValue(mockProvider) };
    const m2: TestingModule = await Test.createTestingModule({
      providers: [
        SmsDeliveryProcessor,
        { provide: DeliveryRepository,      useValue: mockDelivery },
        { provide: OutboxRepository,        useValue: mockOutbox },
        { provide: ProviderRegistryService, useValue: mp },
        { provide: CostPolicyEngine,        useValue: mockCostPolicy },
        { provide: FailedJobService,        useValue: mockFailedJobs },
        { provide: getQueueToken(QUEUE_NAMES.NOTIFICATION_SMS), useValue: makeQueue() },
        { provide: getQueueToken(QUEUE_NAMES.NOTIFICATION_DLQ), useValue: makeQueue() },
        { provide: MetricsService,          useValue: realMetrics },
      ],
    }).compile();
    const proc2 = m2.get(SmsDeliveryProcessor);

    await proc2.handleDeliver({ data: { deliveryId: 'del-metrics-1', tenantId: 'tenant-1' } } as never);

    expect(incSmsSent).toHaveBeenCalledTimes(1);
    expect(incSmsFailed).not.toHaveBeenCalled();

    await m2.close();
  });

  it('provider hatası (TRANSIENT, attempts<max) → retry zamanlanır, incSmsFailed() çağrılmaz', async () => {
    // TRANSIENT hata: attempts=1, MAX_DELIVERY_ATTEMPTS=5 → kalıcı değil → retry
    // incSmsFailed() sadece PERMANENT veya max attempts'de çağrılır
    mockDelivery.claimForProcessing.mockResolvedValueOnce(makeClaimedRow({ attempts: 1 }));

    const failProvider = {
      send: jest.fn().mockRejectedValue({ code: 'PROVIDER_ERROR', message: 'Geçici arıza' }),
    };
    const mp = { getSmsProvider: jest.fn().mockReturnValue(failProvider) };

    const m2: TestingModule = await Test.createTestingModule({
      providers: [
        SmsDeliveryProcessor,
        { provide: DeliveryRepository,      useValue: mockDelivery },
        { provide: OutboxRepository,        useValue: mockOutbox },
        { provide: ProviderRegistryService, useValue: mp },
        { provide: CostPolicyEngine,        useValue: mockCostPolicy },
        { provide: FailedJobService,        useValue: mockFailedJobs },
        { provide: getQueueToken(QUEUE_NAMES.NOTIFICATION_SMS), useValue: makeQueue() },
        { provide: getQueueToken(QUEUE_NAMES.NOTIFICATION_DLQ), useValue: makeQueue() },
        { provide: MetricsService,          useValue: realMetrics },
      ],
    }).compile();
    const proc2 = m2.get(SmsDeliveryProcessor);

    await proc2.handleDeliver({ data: { deliveryId: 'del-metrics-1', tenantId: 'tenant-1' } } as never);

    // TRANSIENT → markFailedWithRetry çağrılır, metrik sayaçlarına dokunulmaz
    expect(incSmsFailed).not.toHaveBeenCalled();
    expect(incSmsSent).not.toHaveBeenCalled();

    await m2.close();
  });

  it('PERMANENT hata → incSmsFailed() + incDlq() her ikisi de çağrılır', async () => {
    mockDelivery.claimForProcessing.mockResolvedValueOnce(
      makeClaimedRow({ attempts: MAX_DELIVERY_ATTEMPTS }),
    );

    const failProvider = {
      send: jest.fn().mockRejectedValue({ code: 'INVALID_PHONE', message: 'Geçersiz no' }),
    };
    const mp = { getSmsProvider: jest.fn().mockReturnValue(failProvider) };
    const dlqQueue = { add: jest.fn().mockResolvedValue({ id: 'dlq-j1' }) };

    const m2: TestingModule = await Test.createTestingModule({
      providers: [
        SmsDeliveryProcessor,
        { provide: DeliveryRepository,      useValue: mockDelivery },
        { provide: OutboxRepository,        useValue: mockOutbox },
        { provide: ProviderRegistryService, useValue: mp },
        { provide: CostPolicyEngine,        useValue: mockCostPolicy },
        { provide: FailedJobService,        useValue: mockFailedJobs },
        { provide: getQueueToken(QUEUE_NAMES.NOTIFICATION_SMS), useValue: makeQueue() },
        { provide: getQueueToken(QUEUE_NAMES.NOTIFICATION_DLQ), useValue: dlqQueue },
        { provide: MetricsService,          useValue: realMetrics },
      ],
    }).compile();
    const proc2 = m2.get(SmsDeliveryProcessor);

    await proc2.handleDeliver({ data: { deliveryId: 'del-metrics-1', tenantId: 'tenant-1' } } as never);

    expect(incSmsFailed).toHaveBeenCalledTimes(1);
    expect(incDlq).toHaveBeenCalledTimes(1);
    expect(incSmsSent).not.toHaveBeenCalled();

    await m2.close();
  });

  it('claim null → hiçbir metrics çağrılmaz', async () => {
    mockDelivery.claimForProcessing.mockResolvedValueOnce(null);

    await processor.handleDeliver({ data: { deliveryId: 'del-metrics-1', tenantId: 'tenant-1' } } as never);

    expect(incSmsSent).not.toHaveBeenCalled();
    expect(incSmsFailed).not.toHaveBeenCalled();
    expect(incDlq).not.toHaveBeenCalled();
  });
});

// ── B: DispatcherProcessor metrics ────────────────────────────────────────────

describe('B: DispatcherProcessor — MetricsService integration', () => {
  let realMetrics:         MetricsService;
  let incEventDispatched:  jest.SpyInstance;
  let incEventDispatchFailed: jest.SpyInstance;

  const mockPreference = {
    resolve: jest.fn().mockResolvedValue({ enabledChannels: [] }),
  };
  const mockPrisma = {
    $transaction: jest.fn().mockImplementation(async (fn: (tx: unknown) => unknown) => fn({})),
  };
  const mockFailedJobs = { save: jest.fn() };

  function buildDispatcher(outboxFindById: jest.Mock, redisMock: { set: jest.Mock; eval: jest.Mock }) {
    const smsQueue = { add: jest.fn().mockResolvedValue({ id: 'q-1' }), client: redisMock };
    const otherQueue = (extra?: object) => ({ add: jest.fn(), client: redisMock, ...extra });

    return Test.createTestingModule({
      providers: [
        DispatcherProcessor,
        { provide: PrismaService,       useValue: mockPrisma },
        { provide: OutboxRepository,    useValue: {
          findById:         outboxFindById,
          markProcessing:   jest.fn().mockResolvedValue(undefined),
          markDispatched:   jest.fn().mockResolvedValue(undefined),
          markForRetry:     jest.fn().mockResolvedValue(undefined),
          markDelivered:    jest.fn().mockResolvedValue(undefined),
          markDeadLettered: jest.fn().mockResolvedValue(undefined),
          isPartitionLocked: jest.fn().mockResolvedValue(false),
        } },
        { provide: DeliveryRepository,  useValue: { createIdempotentInTx: jest.fn().mockResolvedValue(null) } },
        { provide: PreferenceResolver,  useValue: mockPreference },
        { provide: TemplateResolver,    useValue: { resolveAndRender: jest.fn().mockResolvedValue(null) } },
        { provide: CostPolicyEngine,    useValue: {
          getCurrentPeriod: jest.fn().mockReturnValue({ start: new Date(), end: new Date() }),
          checkPolicy:      jest.fn().mockResolvedValue({ allowed: true }),
        } },
        { provide: FailedJobService,    useValue: mockFailedJobs },
        { provide: getQueueToken(QUEUE_NAMES.NOTIFICATION_SMS),   useValue: smsQueue },
        { provide: getQueueToken(QUEUE_NAMES.NOTIFICATION_EMAIL), useValue: otherQueue() },
        { provide: getQueueToken(QUEUE_NAMES.NOTIFICATION_PUSH),  useValue: otherQueue() },
        { provide: getQueueToken(QUEUE_NAMES.NOTIFICATION_DLQ),   useValue: { add: jest.fn() } },
        { provide: MetricsService,      useValue: realMetrics },
      ],
    }).compile();
  }

  beforeEach(() => {
    jest.clearAllMocks();
    realMetrics              = new MetricsService();
    incEventDispatched       = jest.spyOn(realMetrics, 'incEventDispatched');
    incEventDispatchFailed   = jest.spyOn(realMetrics, 'incEventDispatchFailed');
  });

  it('başarılı dispatch → incEventDispatched() çağrılır', async () => {
    const redisMock = {
      set:  jest.fn().mockResolvedValue('OK'),
      eval: jest.fn().mockResolvedValue(1),
    };
    const findById = jest.fn().mockResolvedValue(makeEvent());
    const module = await buildDispatcher(findById, redisMock);
    const proc = module.get(DispatcherProcessor);

    // enabledChannels: ['SMS'] → processEvent erken dönmez, incEventDispatched() çağrılır
    // (template null → kanal atlanır ama markDispatched + metric yine çağrılır)
    mockPreference.resolve.mockResolvedValueOnce({ enabledChannels: ['SMS'] });

    await proc.handleDispatch({ data: { eventId: 'event-metrics', tenantId: 'tenant-1' } } as never);

    expect(incEventDispatched).toHaveBeenCalledTimes(1);
    expect(incEventDispatchFailed).not.toHaveBeenCalled();

    await module.close();
  });

  it('DISPATCHED (terminal) event → metrics çağrılmaz', async () => {
    const redisMock = { set: jest.fn(), eval: jest.fn() };
    const findById  = jest.fn().mockResolvedValue({ ...makeEvent(), status: 'DISPATCHED' });
    const module = await buildDispatcher(findById, redisMock);
    const proc = module.get(DispatcherProcessor);

    await proc.handleDispatch({ data: { eventId: 'event-metrics', tenantId: 'tenant-1' } } as never);

    expect(incEventDispatched).not.toHaveBeenCalled();
    expect(incEventDispatchFailed).not.toHaveBeenCalled();

    await module.close();
  });

  it('PARTITION_LOCKED → ne dispatched ne dispatchFailed sayılır', async () => {
    const redisMock = {
      set:  jest.fn().mockResolvedValue(null), // lock alınamadı
      eval: jest.fn(),
    };
    const findById = jest.fn().mockResolvedValue(makeEvent());
    const module = await buildDispatcher(findById, redisMock);
    const proc = module.get(DispatcherProcessor);

    await expect(
      proc.handleDispatch({ data: { eventId: 'event-metrics', tenantId: 'tenant-1' } } as never),
    ).rejects.toThrow('PARTITION_LOCKED');

    expect(incEventDispatched).not.toHaveBeenCalled();
    // PARTITION_LOCKED beklenen davranış — genel dispatchFailed sayılmaz
    expect(incEventDispatchFailed).not.toHaveBeenCalled();

    await module.close();
  });
});
