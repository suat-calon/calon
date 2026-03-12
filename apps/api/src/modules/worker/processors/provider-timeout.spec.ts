/**
 * TEST 2 — FAZ 24.8: Provider Timeout Guard
 * ──────────────────────────────────────────────────────────────────────────────
 * SMS=10s, Email=15s, Push=10s — provider yanıt vermezse:
 *   → Promise.race → PROVIDER_TIMEOUT kodu ile reject
 *   → classifyFailure('PROVIDER_TIMEOUT') = TRANSIENT
 *   → markFailedWithRetry çağrılır (terminal DEĞİL)
 *   → provider.send() tamamlanmaz → markSent çağrılmaz
 *
 * Jest fake timers kullanılır: jest.useFakeTimers() + advanceTimersByTime().
 *
 * Pattern:
 *   1. jest.useFakeTimers()
 *   2. handleDeliver() — claimForProcessing çözülür (await Promise.resolve())
 *   3. jest.advanceTimersByTime(timeoutMs + 1) — setTimeout ateşlenir
 *   4. await handlePromise — catch bloğu tamamlanır
 *   5. jest.useRealTimers()
 * ──────────────────────────────────────────────────────────────────────────────
 */

import { Test, TestingModule } from '@nestjs/testing';
import { getQueueToken }       from '@nestjs/bull';

import { SmsDeliveryProcessor, SMS_PROVIDER_TIMEOUT_MS }
  from './sms-delivery.processor';
import { EmailDeliveryProcessor, EMAIL_PROVIDER_TIMEOUT_MS }
  from './email-delivery.processor';
import { PushDeliveryProcessor, PUSH_PROVIDER_TIMEOUT_MS }
  from './push-delivery.processor';

import { DeliveryRepository }      from '../../delivery/delivery.repository';
import { OutboxRepository }        from '../../event/outbox.repository';
import { ProviderRegistryService } from '../../provider/provider-registry.service';
import { CostPolicyEngine }        from '../../notification/cost-policy.engine';
import { FailedJobService }        from '../../../common/queue/failed-job.service';
import { QUEUE_NAMES }             from '../../../common/queue/queue-names';
import { MetricsService }          from '../../../common/logging/metrics.service';

// ── Yardımcılar ───────────────────────────────────────────────────────────────

function makeClaimedRow(channel: 'SMS' | 'EMAIL' | 'PUSH') {
  return {
    id:                'del-timeout-1',
    tenantId:          'tenant-1',
    eventId:           'event-timeout-1',
    channel,
    recipient:         channel === 'EMAIL' ? 'user@example.com' : channel === 'PUSH' ? 'token-xyz' : '+905001234567',
    payload:           { body: 'Timeout test mesajı', subject: 'Konu' },
    idempotencyKey:    'key-timeout',
    costEstimateMinor: null,
    attempts:          1,
  };
}

// ── Shared mock factory ───────────────────────────────────────────────────────

function buildMocks() {
  const mockDelivery = {
    claimForProcessing:  jest.fn().mockResolvedValue(makeClaimedRow('SMS')),
    markSent:            jest.fn().mockResolvedValue(undefined),
    markFailedWithRetry: jest.fn().mockResolvedValue(undefined),
    markPermanentFailure: jest.fn().mockResolvedValue(undefined),
    areAllDelivered:     jest.fn().mockResolvedValue(false),
    incrementUsage:      jest.fn().mockResolvedValue(undefined),
  };
  const mockOutbox = { markDelivered: jest.fn().mockResolvedValue(undefined) };
  const mockCostPolicy = {
    getCurrentPeriod: jest.fn().mockReturnValue({
      start: new Date('2026-03-01'),
      end:   new Date('2026-03-31'),
    }),
  };
  const mockFailedJobs = { save: jest.fn().mockResolvedValue(undefined) };
  const makeQueue = () => ({ add: jest.fn().mockResolvedValue({ id: 'q-1' }) });
  return { mockDelivery, mockOutbox, mockCostPolicy, mockFailedJobs, makeQueue };
}

const mockMetrics = {
  incSmsSent:    jest.fn(),
  incSmsFailed:  jest.fn(),
  incEmailSent:  jest.fn(),
  incEmailFailed: jest.fn(),
  incPushSent:   jest.fn(),
  incPushFailed: jest.fn(),
  incDlq:        jest.fn(),
};

// ── SMS Timeout Suite ─────────────────────────────────────────────────────────

describe('SmsDeliveryProcessor — Provider Timeout Guard (FAZ 24.8 Test 2)', () => {
  afterEach(() => jest.useRealTimers());

  it(`SMS_PROVIDER_TIMEOUT_MS sabitinin değeri ${SMS_PROVIDER_TIMEOUT_MS} olmalı`, () => {
    expect(SMS_PROVIDER_TIMEOUT_MS).toBe(10_000);
  });

  it('SMS provider zaman aşımında markFailedWithRetry çağrılır (terminal değil)', async () => {
    jest.useFakeTimers();
    const { mockDelivery, mockOutbox, mockCostPolicy, mockFailedJobs, makeQueue } = buildMocks();

    mockDelivery.claimForProcessing.mockResolvedValue(makeClaimedRow('SMS'));

    // Provider hiç yanıt vermiyor
    const mockProvider = { send: jest.fn().mockReturnValue(new Promise(() => {})) };
    const mockProviders = { getSmsProvider: jest.fn().mockReturnValue(mockProvider) };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        SmsDeliveryProcessor,
        { provide: DeliveryRepository,      useValue: mockDelivery },
        { provide: OutboxRepository,        useValue: mockOutbox },
        { provide: ProviderRegistryService, useValue: mockProviders },
        { provide: CostPolicyEngine,        useValue: mockCostPolicy },
        { provide: FailedJobService,        useValue: mockFailedJobs },
        { provide: getQueueToken(QUEUE_NAMES.NOTIFICATION_SMS), useValue: makeQueue() },
        { provide: getQueueToken(QUEUE_NAMES.NOTIFICATION_DLQ), useValue: makeQueue() },
        { provide: MetricsService, useValue: mockMetrics },
      ],
    }).compile();

    const processor = module.get(SmsDeliveryProcessor);
    const job = { data: { deliveryId: 'del-timeout-1', tenantId: 'tenant-1' } } as never;

    const handlePromise = processor.handleDeliver(job);

    // claimForProcessing çözülmesini bekle ve setTimeout'u kaydet
    await Promise.resolve();
    await Promise.resolve();

    // Timeout'u ateşle
    jest.advanceTimersByTime(SMS_PROVIDER_TIMEOUT_MS + 1);

    await handlePromise;

    expect(mockDelivery.markSent).not.toHaveBeenCalled();
    expect(mockDelivery.markPermanentFailure).not.toHaveBeenCalled();
    expect(mockDelivery.markFailedWithRetry).toHaveBeenCalledTimes(1);
    expect(mockDelivery.markFailedWithRetry).toHaveBeenCalledWith(
      'del-timeout-1',
      'PROVIDER_TIMEOUT',
      expect.stringContaining('10s'),
      expect.any(Date),
    );
  });

  it('SMS timeout → DLQ\'ya gönderilmez (TRANSIENT sınıf, < max attempts)', async () => {
    jest.useFakeTimers();
    const { mockDelivery, mockOutbox, mockCostPolicy, mockFailedJobs, makeQueue } = buildMocks();

    mockDelivery.claimForProcessing.mockResolvedValue(makeClaimedRow('SMS'));

    const dlqQueue = makeQueue();
    const mockProvider = { send: jest.fn().mockReturnValue(new Promise(() => {})) };
    const mockProviders = { getSmsProvider: jest.fn().mockReturnValue(mockProvider) };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        SmsDeliveryProcessor,
        { provide: DeliveryRepository,      useValue: mockDelivery },
        { provide: OutboxRepository,        useValue: mockOutbox },
        { provide: ProviderRegistryService, useValue: mockProviders },
        { provide: CostPolicyEngine,        useValue: mockCostPolicy },
        { provide: FailedJobService,        useValue: mockFailedJobs },
        { provide: getQueueToken(QUEUE_NAMES.NOTIFICATION_SMS), useValue: makeQueue() },
        { provide: getQueueToken(QUEUE_NAMES.NOTIFICATION_DLQ), useValue: dlqQueue },
        { provide: MetricsService, useValue: mockMetrics },
      ],
    }).compile();

    const processor = module.get(SmsDeliveryProcessor);
    const job = { data: { deliveryId: 'del-timeout-1', tenantId: 'tenant-1' } } as never;

    const handlePromise = processor.handleDeliver(job);
    await Promise.resolve();
    await Promise.resolve();
    jest.advanceTimersByTime(SMS_PROVIDER_TIMEOUT_MS + 1);
    await handlePromise;

    expect(dlqQueue.add).not.toHaveBeenCalled();
  });

  it('SMS: timeout olmadan normal gönderimde markSent çağrılır', async () => {
    const { mockDelivery, mockOutbox, mockCostPolicy, mockFailedJobs, makeQueue } = buildMocks();
    mockDelivery.claimForProcessing.mockResolvedValue(makeClaimedRow('SMS'));

    const mockProvider = {
      send: jest.fn().mockResolvedValue({
        providerMessageId: 'msg-ok',
        provider:          'stub',
        costEstimateMinor: 5,
      }),
    };
    const mockProviders = { getSmsProvider: jest.fn().mockReturnValue(mockProvider) };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        SmsDeliveryProcessor,
        { provide: DeliveryRepository,      useValue: mockDelivery },
        { provide: OutboxRepository,        useValue: mockOutbox },
        { provide: ProviderRegistryService, useValue: mockProviders },
        { provide: CostPolicyEngine,        useValue: mockCostPolicy },
        { provide: FailedJobService,        useValue: mockFailedJobs },
        { provide: getQueueToken(QUEUE_NAMES.NOTIFICATION_SMS), useValue: makeQueue() },
        { provide: getQueueToken(QUEUE_NAMES.NOTIFICATION_DLQ), useValue: makeQueue() },
        { provide: MetricsService, useValue: mockMetrics },
      ],
    }).compile();

    const processor = module.get(SmsDeliveryProcessor);
    await processor.handleDeliver({ data: { deliveryId: 'del-timeout-1', tenantId: 'tenant-1' } } as never);

    expect(mockDelivery.markSent).toHaveBeenCalledTimes(1);
    expect(mockDelivery.markFailedWithRetry).not.toHaveBeenCalled();
  });
});

// ── Email Timeout Suite ───────────────────────────────────────────────────────

describe('EmailDeliveryProcessor — Provider Timeout Guard (FAZ 24.8 Test 2)', () => {
  afterEach(() => jest.useRealTimers());

  it(`EMAIL_PROVIDER_TIMEOUT_MS sabitinin değeri ${EMAIL_PROVIDER_TIMEOUT_MS} olmalı`, () => {
    expect(EMAIL_PROVIDER_TIMEOUT_MS).toBe(15_000);
  });

  it('Email provider zaman aşımında markFailedWithRetry çağrılır', async () => {
    jest.useFakeTimers();
    const { mockDelivery, mockOutbox, mockCostPolicy, mockFailedJobs, makeQueue } = buildMocks();

    mockDelivery.claimForProcessing.mockResolvedValue(makeClaimedRow('EMAIL'));

    const mockProvider = { send: jest.fn().mockReturnValue(new Promise(() => {})) };
    const mockProviders = { getEmailProvider: jest.fn().mockReturnValue(mockProvider) };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        EmailDeliveryProcessor,
        { provide: DeliveryRepository,      useValue: mockDelivery },
        { provide: OutboxRepository,        useValue: mockOutbox },
        { provide: ProviderRegistryService, useValue: mockProviders },
        { provide: CostPolicyEngine,        useValue: mockCostPolicy },
        { provide: FailedJobService,        useValue: mockFailedJobs },
        { provide: getQueueToken(QUEUE_NAMES.NOTIFICATION_DLQ), useValue: makeQueue() },
        { provide: MetricsService, useValue: mockMetrics },
      ],
    }).compile();

    const processor = module.get(EmailDeliveryProcessor);
    const job = { data: { deliveryId: 'del-timeout-1', tenantId: 'tenant-1' } } as never;

    const handlePromise = processor.handleDeliver(job);
    await Promise.resolve();
    await Promise.resolve();
    jest.advanceTimersByTime(EMAIL_PROVIDER_TIMEOUT_MS + 1);
    await handlePromise;

    expect(mockDelivery.markSent).not.toHaveBeenCalled();
    expect(mockDelivery.markPermanentFailure).not.toHaveBeenCalled();
    expect(mockDelivery.markFailedWithRetry).toHaveBeenCalledTimes(1);
    expect(mockDelivery.markFailedWithRetry).toHaveBeenCalledWith(
      'del-timeout-1',
      'PROVIDER_TIMEOUT',
      expect.stringContaining('15s'),
      expect.any(Date),
    );
  });

  it('Email: timeout olmadan normal gönderimde markSent çağrılır', async () => {
    const { mockDelivery, mockOutbox, mockCostPolicy, mockFailedJobs, makeQueue } = buildMocks();
    mockDelivery.claimForProcessing.mockResolvedValue(makeClaimedRow('EMAIL'));

    const mockProvider = {
      send: jest.fn().mockResolvedValue({
        providerMessageId: 'msg-email-ok',
        provider:          'stub-email',
        costEstimateMinor: 0,
      }),
    };
    const mockProviders = { getEmailProvider: jest.fn().mockReturnValue(mockProvider) };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        EmailDeliveryProcessor,
        { provide: DeliveryRepository,      useValue: mockDelivery },
        { provide: OutboxRepository,        useValue: mockOutbox },
        { provide: ProviderRegistryService, useValue: mockProviders },
        { provide: CostPolicyEngine,        useValue: mockCostPolicy },
        { provide: FailedJobService,        useValue: mockFailedJobs },
        { provide: getQueueToken(QUEUE_NAMES.NOTIFICATION_DLQ), useValue: makeQueue() },
        { provide: MetricsService, useValue: mockMetrics },
      ],
    }).compile();

    const processor = module.get(EmailDeliveryProcessor);
    await processor.handleDeliver({ data: { deliveryId: 'del-timeout-1', tenantId: 'tenant-1' } } as never);

    expect(mockDelivery.markSent).toHaveBeenCalledTimes(1);
  });
});

// ── Push Timeout Suite ────────────────────────────────────────────────────────

describe('PushDeliveryProcessor — Provider Timeout Guard (FAZ 24.8 Test 2)', () => {
  afterEach(() => jest.useRealTimers());

  it(`PUSH_PROVIDER_TIMEOUT_MS sabitinin değeri ${PUSH_PROVIDER_TIMEOUT_MS} olmalı`, () => {
    expect(PUSH_PROVIDER_TIMEOUT_MS).toBe(10_000);
  });

  it('Push provider zaman aşımında markFailedWithRetry çağrılır', async () => {
    jest.useFakeTimers();
    const { mockDelivery, mockOutbox, mockCostPolicy, mockFailedJobs, makeQueue } = buildMocks();

    mockDelivery.claimForProcessing.mockResolvedValue(makeClaimedRow('PUSH'));

    const mockProvider = { send: jest.fn().mockReturnValue(new Promise(() => {})) };
    const mockProviders = { getPushProvider: jest.fn().mockReturnValue(mockProvider) };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        PushDeliveryProcessor,
        { provide: DeliveryRepository,      useValue: mockDelivery },
        { provide: OutboxRepository,        useValue: mockOutbox },
        { provide: ProviderRegistryService, useValue: mockProviders },
        { provide: CostPolicyEngine,        useValue: mockCostPolicy },
        { provide: FailedJobService,        useValue: mockFailedJobs },
        { provide: getQueueToken(QUEUE_NAMES.NOTIFICATION_DLQ), useValue: makeQueue() },
        { provide: MetricsService, useValue: mockMetrics },
      ],
    }).compile();

    const processor = module.get(PushDeliveryProcessor);
    const job = { data: { deliveryId: 'del-timeout-1', tenantId: 'tenant-1' } } as never;

    const handlePromise = processor.handleDeliver(job);
    await Promise.resolve();
    await Promise.resolve();
    jest.advanceTimersByTime(PUSH_PROVIDER_TIMEOUT_MS + 1);
    await handlePromise;

    expect(mockDelivery.markSent).not.toHaveBeenCalled();
    expect(mockDelivery.markPermanentFailure).not.toHaveBeenCalled();
    expect(mockDelivery.markFailedWithRetry).toHaveBeenCalledTimes(1);
    expect(mockDelivery.markFailedWithRetry).toHaveBeenCalledWith(
      'del-timeout-1',
      'PROVIDER_TIMEOUT',
      expect.stringContaining('10s'),
      expect.any(Date),
    );
  });
});
