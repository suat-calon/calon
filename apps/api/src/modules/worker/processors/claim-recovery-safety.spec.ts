/**
 * TEST 4: Recovery Duplicate Enqueue Safety
 * ──────────────────────────────────────────────────────────────────────────────
 * Recovery processor aynı FAILED delivery'yi kuyruğa iki kez basabilir.
 * (Örn: cron + pg_notify aynı anda tetiklenirse, veya cron bir önceki çalışmada
 *  nextAttemptAt güncellenmemiş bir delivery'yi tekrar görürse.)
 *
 * Beklenen: İki işçi aynı deliveryId'yi işlese de, yalnızca biri claim edebilir;
 * provider.send() 1 kez çağrılır.
 *
 * Sequential (art arda) senaryoyu da kapsar: worker job'u bitirir, recovery
 * aynı delivery'yi (şimdi PROCESSING veya SENT) tekrar kuyruğa basar → ikinci
 * çağrı claim edemez → send tekrar edilmez.
 * ──────────────────────────────────────────────────────────────────────────────
 */

import { Test, TestingModule } from '@nestjs/testing';
import { getQueueToken }       from '@nestjs/bull';
import { SmsDeliveryProcessor } from './sms-delivery.processor';
import { DeliveryRepository }   from '../../delivery/delivery.repository';
import { OutboxRepository }     from '../../event/outbox.repository';
import { ProviderRegistryService } from '../../provider/provider-registry.service';
import { CostPolicyEngine }     from '../../notification/cost-policy.engine';
import { FailedJobService }     from '../../../common/queue/failed-job.service';
import { QUEUE_NAMES }          from '../../../common/queue/queue-names';
import { MetricsService }       from '../../../common/logging/metrics.service';

// ── Yardımcılar ───────────────────────────────────────────────────────────────

function makeClaimedRow(overrides: Partial<{
  id: string;
  tenantId: string;
  eventId: string;
  channel: string;
  recipient: string;
  payload: unknown;
  idempotencyKey: string;
  costEstimateMinor: number | null;
  attempts: number;
}> = {}) {
  return {
    id:                'delivery-dup',
    tenantId:          'tenant-1',
    eventId:           'event-1',
    channel:           'SMS',
    recipient:         '+905001234567',
    payload:           { body: 'Hatırlatma mesajı' },
    idempotencyKey:    'booking.reminder:event-1:sms:+905:v1',
    costEstimateMinor: 5,
    attempts:          2, // FAILED → PROCESSING (2. deneme)
    ...overrides,
  };
}

// ── Mocks ────────────────────────────────────────────────────────────────────

const mockProvider = {
  send: jest.fn().mockResolvedValue({
    providerMessageId: 'msg-recovery',
    provider:          'stub',
    costEstimateMinor: 5,
  }),
};

const mockDelivery = {
  claimForProcessing:  jest.fn(),
  markSent:            jest.fn().mockResolvedValue(undefined),
  markFailedWithRetry: jest.fn().mockResolvedValue(undefined),
  markPermanentFailure: jest.fn().mockResolvedValue(undefined),
  areAllDelivered:     jest.fn().mockResolvedValue(false),
  incrementUsage:      jest.fn().mockResolvedValue(undefined),
};

const mockOutbox = {
  markDelivered: jest.fn().mockResolvedValue(undefined),
};

const mockProviders = {
  getSmsProvider: jest.fn().mockReturnValue(mockProvider),
};

const mockCostPolicy = {
  getCurrentPeriod: jest.fn().mockReturnValue({
    start: new Date('2026-03-01'),
    end:   new Date('2026-03-31'),
  }),
};

const mockFailedJobs = { save: jest.fn().mockResolvedValue(undefined) };
const makeQueue = () => ({ add: jest.fn().mockResolvedValue({ id: 'job-1' }) });

const mockMetrics = {
  incSmsSent:   jest.fn(),
  incSmsFailed: jest.fn(),
  incDlq:       jest.fn(),
};

// ── Test suite ────────────────────────────────────────────────────────────────

describe('SmsDeliveryProcessor — Recovery Duplicate Enqueue Safety (Test 4)', () => {
  let processor: SmsDeliveryProcessor;

  beforeEach(async () => {
    jest.clearAllMocks();

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
        { provide: MetricsService,                              useValue: mockMetrics },
      ],
    }).compile();

    processor = module.get(SmsDeliveryProcessor);
  });

  it(
    'aynı delivery iki kez kuyruğa basılır (paralel) → provider.send() 1 kez',
    async () => {
      // Recovery iki job ekledi; biri claim eder, diğeri null alır
      mockDelivery.claimForProcessing
        .mockResolvedValueOnce(makeClaimedRow())
        .mockResolvedValueOnce(null);

      const job = { data: { deliveryId: 'delivery-dup', tenantId: 'tenant-1' } } as never;
      await Promise.all([
        processor.handleDeliver(job),
        processor.handleDeliver(job),
      ]);

      expect(mockProvider.send).toHaveBeenCalledTimes(1);
    },
  );

  it(
    'aynı delivery iki kez kuyruğa basılır (sıralı) → provider.send() 1 kez',
    async () => {
      // İlk işleme başarılı; ikinci çağrıda delivery PROCESSING/SENT → claim null
      mockDelivery.claimForProcessing
        .mockResolvedValueOnce(makeClaimedRow()) // 1. job başarılı
        .mockResolvedValueOnce(null);             // 2. job (recovery duplicate): null

      const job = { data: { deliveryId: 'delivery-dup', tenantId: 'tenant-1' } } as never;

      await processor.handleDeliver(job);  // 1. işleme
      await processor.handleDeliver(job);  // 2. işleme (duplicate)

      expect(mockProvider.send).toHaveBeenCalledTimes(1);
      expect(mockDelivery.markSent).toHaveBeenCalledTimes(1);
    },
  );

  it(
    'recovery duplicate: ikinci çağrıda markSent/markFailedWithRetry çağrılmaz',
    async () => {
      mockDelivery.claimForProcessing
        .mockResolvedValueOnce(makeClaimedRow())
        .mockResolvedValueOnce(null);

      const job = { data: { deliveryId: 'delivery-dup', tenantId: 'tenant-1' } } as never;
      await Promise.all([
        processor.handleDeliver(job),
        processor.handleDeliver(job),
      ]);

      expect(mockDelivery.markSent).toHaveBeenCalledTimes(1);
      expect(mockDelivery.markFailedWithRetry).not.toHaveBeenCalled();
      expect(mockDelivery.markPermanentFailure).not.toHaveBeenCalled();
    },
  );
});
