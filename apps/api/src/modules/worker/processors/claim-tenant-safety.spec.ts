/**
 * TEST 5: Atomik Claim — Tenant Safety
 * ──────────────────────────────────────────────────────────────────────────────
 * Güvenlik gereksinimleri:
 *   A. claimForProcessing yalnızca job.data.deliveryId ile çağrılır —
 *      başka bir ID veya tenant-derived değer enjekte edilemez.
 *
 *   B. claimForProcessing null döndüğünde (tenant-B'ye ait delivery UUID'si
 *      tenant-A worker'ında görünürse) provider.send() ÇAĞRILMAZ.
 *
 *   C. Farklı tenant'ların deliveryId'leri birbirini etkilemez:
 *      tenant-A delivery claim edilir → tenant-B delivery'ye dokunulmaz.
 *
 * UUID benzersizliği zaten çapraz-tenant erişimini engeller; bu testler,
 * processor'ın claim başarısız olduğunda kesinlikle geri döndüğünü doğrular.
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
    id:                'del-tenant-a-uuid',
    tenantId:          'tenant-a',
    eventId:           'event-tenant-a',
    channel:           'SMS',
    recipient:         '+905001111111',
    payload:           { body: 'Tenant A mesajı' },
    idempotencyKey:    'key-a',
    costEstimateMinor: null,
    attempts:          1,
    ...overrides,
  };
}

// ── Mocks ────────────────────────────────────────────────────────────────────

const mockProvider = {
  send: jest.fn().mockResolvedValue({
    providerMessageId: 'msg-a',
    provider:          'stub',
    costEstimateMinor: 0,
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

const mockOutbox = { markDelivered: jest.fn().mockResolvedValue(undefined) };

const mockProviders = { getSmsProvider: jest.fn().mockReturnValue(mockProvider) };

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

describe('SmsDeliveryProcessor — Tenant Safety (Test 5)', () => {
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

  // ── A: claimForProcessing yalnızca doğru deliveryId ile çağrılır ─────────

  it(
    'A: handleDeliver, claimForProcessing\'i tam olarak job.data.deliveryId ile çağırır',
    async () => {
      mockDelivery.claimForProcessing.mockResolvedValueOnce(null);

      const specificId = 'del-tenant-a-uuid-specific';
      const job = { data: { deliveryId: specificId, tenantId: 'tenant-a' } } as never;
      await processor.handleDeliver(job);

      expect(mockDelivery.claimForProcessing).toHaveBeenCalledTimes(1);
      expect(mockDelivery.claimForProcessing).toHaveBeenCalledWith(specificId);
    },
  );

  // ── B: claim null → provider.send() çağrılmaz (çapraz-tenant koruması) ──

  it(
    'B: claimForProcessing null döndüğünde provider.send() çağrılmaz',
    async () => {
      // Farklı tenant'ın delivery ID'si ile (veya terminal durum) → null
      mockDelivery.claimForProcessing.mockResolvedValueOnce(null);

      const job = { data: { deliveryId: 'del-tenant-b-uuid', tenantId: 'tenant-a' } } as never;
      await processor.handleDeliver(job);

      expect(mockProvider.send).not.toHaveBeenCalled();
      expect(mockDelivery.markSent).not.toHaveBeenCalled();
      expect(mockDelivery.markFailedWithRetry).not.toHaveBeenCalled();
      expect(mockDelivery.markPermanentFailure).not.toHaveBeenCalled();
    },
  );

  // ── C: iki farklı tenant delivery'si birbirini etkilemez ─────────────────

  it(
    'C: tenant-A ve tenant-B delivery\'leri birbirini etkilemez',
    async () => {
      // Her delivery kendi claim'ini alır; biri başarılı, diğeri null
      mockDelivery.claimForProcessing
        .mockImplementation(async (id: string) => {
          if (id === 'del-tenant-a-uuid') return makeClaimedRow();
          return null; // tenant-B'ye ait ID → eşleşmez
        });

      const jobA = { data: { deliveryId: 'del-tenant-a-uuid', tenantId: 'tenant-a' } } as never;
      const jobB = { data: { deliveryId: 'del-tenant-b-uuid', tenantId: 'tenant-b' } } as never;

      await Promise.all([
        processor.handleDeliver(jobA),
        processor.handleDeliver(jobB),
      ]);

      // Sadece tenant-A delivery'si işlendi
      expect(mockProvider.send).toHaveBeenCalledTimes(1);

      // claimForProcessing her iki ID ile de doğru şekilde çağrıldı
      expect(mockDelivery.claimForProcessing).toHaveBeenCalledWith('del-tenant-a-uuid');
      expect(mockDelivery.claimForProcessing).toHaveBeenCalledWith('del-tenant-b-uuid');
    },
  );

  it(
    'C: başarılı claim tenant-A verilerini kullanır (cross-tenant veri sızıntısı yok)',
    async () => {
      // tenant-A delivery claim edildiğinde, claimed.tenantId = 'tenant-a'
      // provider, job.data.tenantId ile çağrılır (tenant-A)
      mockDelivery.claimForProcessing.mockResolvedValueOnce(
        makeClaimedRow({ tenantId: 'tenant-a', recipient: '+905001111111' }),
      );

      const job = { data: { deliveryId: 'del-tenant-a-uuid', tenantId: 'tenant-a' } } as never;
      await processor.handleDeliver(job);

      // provider.send() tenant-A bilgileriyle çağrıldı
      expect(mockProvider.send).toHaveBeenCalledWith(
        expect.objectContaining({
          to:      '+905001111111',
          tenantId: 'tenant-a',
        }),
      );
    },
  );
});
