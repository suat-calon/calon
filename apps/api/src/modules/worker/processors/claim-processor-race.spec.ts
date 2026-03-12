/**
 * TEST 1: Atomik Claim — Double Worker Race
 * ──────────────────────────────────────────────────────────────────────────────
 * İki paralel worker aynı deliveryId için handleDeliver() çağırır.
 * claimForProcessing: ilk çağrı → ClaimedDelivery döner, ikinci → null.
 * Beklenen: provider.send() yalnızca 1 kez çağrılmalı.
 *
 * Bu test, önceki non-atomik pattern'in (findById → status check → markProcessing)
 * neden yetersiz olduğunu ve claimForProcessing'in nasıl race'i önlediğini doğrular.
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
    id:                'delivery-race',
    tenantId:          'tenant-1',
    eventId:           'event-1',
    channel:           'SMS',
    recipient:         '+905001234567',
    payload:           { body: 'Rezervasyon onaylandı' },
    idempotencyKey:    'booking.created:event-1:sms:+905:v1',
    costEstimateMinor: 5,
    attempts:          1,
    ...overrides,
  };
}

// ── Mock bağımlılıklar ────────────────────────────────────────────────────────

const mockProvider = {
  send: jest.fn().mockResolvedValue({
    providerMessageId: 'msg-1',
    provider:          'stub',
    costEstimateMinor: 5,
  }),
};

const mockDelivery = {
  claimForProcessing: jest.fn(),
  markSent:           jest.fn().mockResolvedValue(undefined),
  markFailedWithRetry: jest.fn().mockResolvedValue(undefined),
  markPermanentFailure: jest.fn().mockResolvedValue(undefined),
  areAllDelivered:    jest.fn().mockResolvedValue(false),
  incrementUsage:     jest.fn().mockResolvedValue(undefined),
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

const mockFailedJobs = {
  save: jest.fn().mockResolvedValue(undefined),
};

const makeQueue = () => ({ add: jest.fn().mockResolvedValue({ id: 'job-1' }) });

const mockMetrics = {
  incSmsSent:   jest.fn(),
  incSmsFailed: jest.fn(),
  incDlq:       jest.fn(),
};

// ── Test suite ────────────────────────────────────────────────────────────────

describe('SmsDeliveryProcessor — Double Worker Race (Test 1)', () => {
  let processor: SmsDeliveryProcessor;

  beforeEach(async () => {
    jest.clearAllMocks();

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        SmsDeliveryProcessor,
        { provide: DeliveryRepository,    useValue: mockDelivery },
        { provide: OutboxRepository,      useValue: mockOutbox },
        { provide: ProviderRegistryService, useValue: mockProviders },
        { provide: CostPolicyEngine,      useValue: mockCostPolicy },
        { provide: FailedJobService,      useValue: mockFailedJobs },
        { provide: getQueueToken(QUEUE_NAMES.NOTIFICATION_SMS), useValue: makeQueue() },
        { provide: getQueueToken(QUEUE_NAMES.NOTIFICATION_DLQ), useValue: makeQueue() },
        { provide: MetricsService,                              useValue: mockMetrics },
      ],
    }).compile();

    processor = module.get(SmsDeliveryProcessor);
  });

  it(
    'iki paralel worker aynı deliveryId → provider.send() yalnızca 1 kez çağrılır',
    async () => {
      // İlk claim başarılı → worker-1 satırı alır
      // İkinci claim başarısız → worker-2 erken döner
      mockDelivery.claimForProcessing
        .mockResolvedValueOnce(makeClaimedRow())   // worker-1 kazanır
        .mockResolvedValueOnce(null);              // worker-2 kaybeder

      const job = { data: { deliveryId: 'delivery-race', tenantId: 'tenant-1' } } as never;

      // İki worker aynı anda çağırır
      await Promise.all([
        processor.handleDeliver(job),
        processor.handleDeliver(job),
      ]);

      expect(mockProvider.send).toHaveBeenCalledTimes(1);
      expect(mockDelivery.claimForProcessing).toHaveBeenCalledTimes(2);
      expect(mockDelivery.claimForProcessing).toHaveBeenCalledWith('delivery-race');
    },
  );

  it(
    'claim başarısız olan worker markSent/markFailedWithRetry çağırmaz',
    async () => {
      mockDelivery.claimForProcessing
        .mockResolvedValueOnce(makeClaimedRow()) // worker-1
        .mockResolvedValueOnce(null);             // worker-2

      const job = { data: { deliveryId: 'delivery-race', tenantId: 'tenant-1' } } as never;
      await Promise.all([
        processor.handleDeliver(job),
        processor.handleDeliver(job),
      ]);

      // Sadece 1 markSent çağrısı olmalı (worker-1'den)
      expect(mockDelivery.markSent).toHaveBeenCalledTimes(1);
      expect(mockDelivery.markFailedWithRetry).not.toHaveBeenCalled();
    },
  );

  it(
    'üç eşzamanlı worker → yalnızca ilk claim başarılı → send 1 kez',
    async () => {
      mockDelivery.claimForProcessing
        .mockResolvedValueOnce(makeClaimedRow()) // worker-1
        .mockResolvedValueOnce(null)              // worker-2
        .mockResolvedValueOnce(null);             // worker-3

      const job = { data: { deliveryId: 'delivery-race', tenantId: 'tenant-1' } } as never;
      await Promise.all([
        processor.handleDeliver(job),
        processor.handleDeliver(job),
        processor.handleDeliver(job),
      ]);

      expect(mockProvider.send).toHaveBeenCalledTimes(1);
    },
  );
});
