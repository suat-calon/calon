/**
 * TEST 6 — FAZ 24.8: DLQ Payload Validation
 * ──────────────────────────────────────────────────────────────────────────────
 * SMS, Email ve Push delivery processor'larının PERMANENT_FAILURE / max-attempts
 * durumunda DLQ'ya doğru payload ile iş eklediğini doğrular.
 *
 * Zorunlu DLQ payload alanları:
 *   - originalQueue  : kanalın queue adı (NOTIFICATION_SMS / EMAIL / PUSH)
 *   - deliveryId     : delivery ID (job.data.deliveryId)
 *   - tenantId       : tenant ID (job.data.tenantId)
 *   - eventId        : claimed.eventId (delivery record'dan)
 *   - channel        : claimed.channel ('SMS' | 'EMAIL' | 'PUSH')
 *   - errorCode      : hata kodu ('INVALID_PHONE' | 'PERMANENT_ERROR' | 'PROVIDER_TIMEOUT' vb.)
 *   - errorMessage   : insan-okunabilir hata mesajı (string)
 *
 * Test senaryoları:
 *   1. PERMANENT provider hatası (classifyFailure = 'PERMANENT') → DLQ
 *   2. Max attempts aşıldı (isMaxAttemptsReached = true) → DLQ
 *   3. TRANSIENT hatası (< max attempts) → DLQ YOK
 * ──────────────────────────────────────────────────────────────────────────────
 */

import { Test, TestingModule } from '@nestjs/testing';
import { getQueueToken }       from '@nestjs/bull';
import { SmsDeliveryProcessor }   from './sms-delivery.processor';
import { EmailDeliveryProcessor } from './email-delivery.processor';
import { PushDeliveryProcessor }  from './push-delivery.processor';
import { DeliveryRepository }      from '../../delivery/delivery.repository';
import { OutboxRepository }        from '../../event/outbox.repository';
import { ProviderRegistryService } from '../../provider/provider-registry.service';
import { CostPolicyEngine }        from '../../notification/cost-policy.engine';
import { FailedJobService }        from '../../../common/queue/failed-job.service';
import { QUEUE_NAMES }             from '../../../common/queue/queue-names';
import { MAX_DELIVERY_ATTEMPTS }   from '../../delivery/retry-policy';
import { MetricsService }          from '../../../common/logging/metrics.service';

// ── Sabitler ──────────────────────────────────────────────────────────────────

/** PERMANENT olarak sınıflandırılan bir hata kodu (retry-policy.ts PERMANENT_ERROR_CODES içinde) */
const PERMANENT_CODE = 'INVALID_PHONE';

// ── Fabrika ───────────────────────────────────────────────────────────────────

function makeClaimedRow(channel: 'SMS' | 'EMAIL' | 'PUSH', eventId = 'event-dlq-1', attempts = 1) {
  return {
    id:                'del-dlq-1',
    tenantId:          'tenant-1',
    eventId,
    channel,
    recipient:
      channel === 'EMAIL' ? 'user@example.com' :
      channel === 'PUSH'  ? 'push-token-xyz'   :
                            '+905001234567',
    payload:           { body: 'DLQ test mesajı', subject: 'DLQ Konu' },
    idempotencyKey:    'key-dlq',
    costEstimateMinor: null,
    attempts,
  };
}

// ── Shared mock factory ───────────────────────────────────────────────────────

function buildMocks(channel: 'SMS' | 'EMAIL' | 'PUSH', claimedRow: ReturnType<typeof makeClaimedRow>) {
  const mockDelivery = {
    claimForProcessing:   jest.fn().mockResolvedValue(claimedRow),
    markSent:             jest.fn().mockResolvedValue(undefined),
    markFailedWithRetry:  jest.fn().mockResolvedValue(undefined),
    markPermanentFailure: jest.fn().mockResolvedValue(undefined),
    areAllDelivered:      jest.fn().mockResolvedValue(false),
    incrementUsage:       jest.fn().mockResolvedValue(undefined),
  };
  const mockOutbox = { markDelivered: jest.fn().mockResolvedValue(undefined) };
  const mockCostPolicy = {
    getCurrentPeriod: jest.fn().mockReturnValue({
      start: new Date('2026-03-01'),
      end:   new Date('2026-03-31'),
    }),
  };
  const mockFailedJobs = { save: jest.fn().mockResolvedValue(undefined) };
  const dlqQueue = { add: jest.fn().mockResolvedValue({ id: 'dlq-job-1' }) };
  const makeQueue = () => ({ add: jest.fn().mockResolvedValue({ id: 'q-1' }) });

  const sendFn = jest.fn();
  const mockProvider = { send: sendFn };
  const mockProviders =
    channel === 'SMS'   ? { getSmsProvider:   jest.fn().mockReturnValue(mockProvider) } :
    channel === 'EMAIL' ? { getEmailProvider: jest.fn().mockReturnValue(mockProvider) } :
                          { getPushProvider:  jest.fn().mockReturnValue(mockProvider) };

  return { mockDelivery, mockOutbox, mockCostPolicy, mockFailedJobs, dlqQueue, makeQueue, sendFn, mockProviders };
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

async function buildSmsProcessor(
  mocks: ReturnType<typeof buildMocks>,
): Promise<{ processor: SmsDeliveryProcessor; dlqQueue: typeof mocks.dlqQueue }> {
  const module: TestingModule = await Test.createTestingModule({
    providers: [
      SmsDeliveryProcessor,
      { provide: DeliveryRepository,      useValue: mocks.mockDelivery },
      { provide: OutboxRepository,        useValue: mocks.mockOutbox },
      { provide: ProviderRegistryService, useValue: mocks.mockProviders },
      { provide: CostPolicyEngine,        useValue: mocks.mockCostPolicy },
      { provide: FailedJobService,        useValue: mocks.mockFailedJobs },
      { provide: getQueueToken(QUEUE_NAMES.NOTIFICATION_SMS), useValue: mocks.makeQueue() },
      { provide: getQueueToken(QUEUE_NAMES.NOTIFICATION_DLQ), useValue: mocks.dlqQueue },
      { provide: MetricsService, useValue: mockMetrics },
    ],
  }).compile();
  return { processor: module.get(SmsDeliveryProcessor), dlqQueue: mocks.dlqQueue };
}

async function buildEmailProcessor(
  mocks: ReturnType<typeof buildMocks>,
): Promise<{ processor: EmailDeliveryProcessor; dlqQueue: typeof mocks.dlqQueue }> {
  const module: TestingModule = await Test.createTestingModule({
    providers: [
      EmailDeliveryProcessor,
      { provide: DeliveryRepository,      useValue: mocks.mockDelivery },
      { provide: OutboxRepository,        useValue: mocks.mockOutbox },
      { provide: ProviderRegistryService, useValue: mocks.mockProviders },
      { provide: CostPolicyEngine,        useValue: mocks.mockCostPolicy },
      { provide: FailedJobService,        useValue: mocks.mockFailedJobs },
      { provide: getQueueToken(QUEUE_NAMES.NOTIFICATION_DLQ), useValue: mocks.dlqQueue },
      { provide: MetricsService, useValue: mockMetrics },
    ],
  }).compile();
  return { processor: module.get(EmailDeliveryProcessor), dlqQueue: mocks.dlqQueue };
}

async function buildPushProcessor(
  mocks: ReturnType<typeof buildMocks>,
): Promise<{ processor: PushDeliveryProcessor; dlqQueue: typeof mocks.dlqQueue }> {
  const module: TestingModule = await Test.createTestingModule({
    providers: [
      PushDeliveryProcessor,
      { provide: DeliveryRepository,      useValue: mocks.mockDelivery },
      { provide: OutboxRepository,        useValue: mocks.mockOutbox },
      { provide: ProviderRegistryService, useValue: mocks.mockProviders },
      { provide: CostPolicyEngine,        useValue: mocks.mockCostPolicy },
      { provide: FailedJobService,        useValue: mocks.mockFailedJobs },
      { provide: getQueueToken(QUEUE_NAMES.NOTIFICATION_DLQ), useValue: mocks.dlqQueue },
      { provide: MetricsService, useValue: mockMetrics },
    ],
  }).compile();
  return { processor: module.get(PushDeliveryProcessor), dlqQueue: mocks.dlqQueue };
}

// ── SMS DLQ Payload Tests ─────────────────────────────────────────────────────

describe('SmsDeliveryProcessor — DLQ Payload Validation (FAZ 24.8 Test 6)', () => {
  it('1: PERMANENT hata → DLQ payload tüm zorunlu alanları içerir', async () => {
    const claimed = makeClaimedRow('SMS', 'event-sms-1');
    const mocks = buildMocks('SMS', claimed);
    mocks.sendFn.mockRejectedValueOnce({ code: PERMANENT_CODE, message: 'Geçersiz telefon numarası' });

    const { processor, dlqQueue } = await buildSmsProcessor(mocks);
    await processor.handleDeliver({ data: { deliveryId: 'del-dlq-1', tenantId: 'tenant-1' } } as never);

    expect(dlqQueue.add).toHaveBeenCalledTimes(1);
    const payload = dlqQueue.add.mock.calls[0][1];

    expect(payload).toMatchObject({
      originalQueue: QUEUE_NAMES.NOTIFICATION_SMS,
      deliveryId:    'del-dlq-1',
      tenantId:      'tenant-1',
      eventId:       'event-sms-1',
      channel:       'SMS',
      errorCode:     PERMANENT_CODE,
      errorMessage:  'Geçersiz telefon numarası',
    });
  });

  it('1: DLQ payload "error" alanı OLMAMALI (errorMessage kullanılmalı)', async () => {
    const mocks = buildMocks('SMS', makeClaimedRow('SMS'));
    mocks.sendFn.mockRejectedValueOnce({ code: PERMANENT_CODE, message: 'hata' });

    const { processor, dlqQueue } = await buildSmsProcessor(mocks);
    await processor.handleDeliver({ data: { deliveryId: 'del-dlq-1', tenantId: 'tenant-1' } } as never);

    const payload = dlqQueue.add.mock.calls[0][1];
    expect(payload).not.toHaveProperty('error');
    expect(payload).toHaveProperty('errorMessage');
    expect(payload).toHaveProperty('errorCode');
  });

  it('2: max attempts aşıldı → DLQ enqueue (errorCode korunur)', async () => {
    // attempts >= MAX_DELIVERY_ATTEMPTS → isMaxAttemptsReached = true → PERMANENT path
    const claimed = makeClaimedRow('SMS', 'event-sms-max', MAX_DELIVERY_ATTEMPTS);
    const mocks = buildMocks('SMS', claimed);
    mocks.sendFn.mockRejectedValueOnce({ code: 'PROVIDER_ERROR', message: 'Geçici arıza' });

    const { processor, dlqQueue } = await buildSmsProcessor(mocks);
    await processor.handleDeliver({ data: { deliveryId: 'del-dlq-1', tenantId: 'tenant-1' } } as never);

    expect(dlqQueue.add).toHaveBeenCalledTimes(1);
    const payload = dlqQueue.add.mock.calls[0][1];
    expect(payload.channel).toBe('SMS');
    expect(payload.eventId).toBe('event-sms-max');
  });

  it('3: TRANSIENT hata < max attempts → DLQ YOK', async () => {
    const claimed = makeClaimedRow('SMS', 'event-sms-trans', 1);
    const mocks = buildMocks('SMS', claimed);
    // PROVIDER_ERROR is TRANSIENT, attempts=1 < MAX_DELIVERY_ATTEMPTS
    mocks.sendFn.mockRejectedValueOnce({ code: 'PROVIDER_ERROR', message: 'Geçici hata' });

    const { processor, dlqQueue } = await buildSmsProcessor(mocks);
    await processor.handleDeliver({ data: { deliveryId: 'del-dlq-1', tenantId: 'tenant-1' } } as never);

    expect(dlqQueue.add).not.toHaveBeenCalled();
  });
});

// ── Email DLQ Payload Tests ───────────────────────────────────────────────────

describe('EmailDeliveryProcessor — DLQ Payload Validation (FAZ 24.8 Test 6)', () => {
  it('1: PERMANENT hata → DLQ payload tüm zorunlu alanları içerir', async () => {
    const claimed = makeClaimedRow('EMAIL', 'event-email-1');
    const mocks = buildMocks('EMAIL', claimed);
    mocks.sendFn.mockRejectedValueOnce({ code: PERMANENT_CODE, message: 'Email bounced' });

    const { processor, dlqQueue } = await buildEmailProcessor(mocks);
    await processor.handleDeliver({ data: { deliveryId: 'del-dlq-1', tenantId: 'tenant-1' } } as never);

    expect(dlqQueue.add).toHaveBeenCalledTimes(1);
    const payload = dlqQueue.add.mock.calls[0][1];

    expect(payload).toMatchObject({
      originalQueue: QUEUE_NAMES.NOTIFICATION_EMAIL,
      deliveryId:    'del-dlq-1',
      tenantId:      'tenant-1',
      eventId:       'event-email-1',
      channel:       'EMAIL',
      errorCode:     PERMANENT_CODE,
      errorMessage:  'Email bounced',
    });
  });

  it('1: Email DLQ payload "error" alanı OLMAMALI', async () => {
    const mocks = buildMocks('EMAIL', makeClaimedRow('EMAIL'));
    mocks.sendFn.mockRejectedValueOnce({ code: PERMANENT_CODE, message: 'hata' });

    const { processor, dlqQueue } = await buildEmailProcessor(mocks);
    await processor.handleDeliver({ data: { deliveryId: 'del-dlq-1', tenantId: 'tenant-1' } } as never);

    const payload = dlqQueue.add.mock.calls[0][1];
    expect(payload).not.toHaveProperty('error');
    expect(payload).toHaveProperty('errorMessage');
  });

  it('3: Email TRANSIENT hata < max attempts → DLQ YOK', async () => {
    const mocks = buildMocks('EMAIL', makeClaimedRow('EMAIL', 'ev-1', 1));
    mocks.sendFn.mockRejectedValueOnce({ code: 'PROVIDER_ERROR', message: 'Geçici' });

    const { processor, dlqQueue } = await buildEmailProcessor(mocks);
    await processor.handleDeliver({ data: { deliveryId: 'del-dlq-1', tenantId: 'tenant-1' } } as never);

    expect(dlqQueue.add).not.toHaveBeenCalled();
  });
});

// ── Push DLQ Payload Tests ────────────────────────────────────────────────────

describe('PushDeliveryProcessor — DLQ Payload Validation (FAZ 24.8 Test 6)', () => {
  it('1: PERMANENT hata → DLQ payload tüm zorunlu alanları içerir', async () => {
    const claimed = makeClaimedRow('PUSH', 'event-push-1');
    const mocks = buildMocks('PUSH', claimed);
    mocks.sendFn.mockRejectedValueOnce({ code: PERMANENT_CODE, message: 'Invalid token' });

    const { processor, dlqQueue } = await buildPushProcessor(mocks);
    await processor.handleDeliver({ data: { deliveryId: 'del-dlq-1', tenantId: 'tenant-1' } } as never);

    expect(dlqQueue.add).toHaveBeenCalledTimes(1);
    const payload = dlqQueue.add.mock.calls[0][1];

    expect(payload).toMatchObject({
      originalQueue: QUEUE_NAMES.NOTIFICATION_PUSH,
      deliveryId:    'del-dlq-1',
      tenantId:      'tenant-1',
      eventId:       'event-push-1',
      channel:       'PUSH',
      errorCode:     PERMANENT_CODE,
      errorMessage:  'Invalid token',
    });
  });

  it('1: Push DLQ payload "error" alanı OLMAMALI', async () => {
    const mocks = buildMocks('PUSH', makeClaimedRow('PUSH'));
    mocks.sendFn.mockRejectedValueOnce({ code: PERMANENT_CODE, message: 'hata' });

    const { processor, dlqQueue } = await buildPushProcessor(mocks);
    await processor.handleDeliver({ data: { deliveryId: 'del-dlq-1', tenantId: 'tenant-1' } } as never);

    const payload = dlqQueue.add.mock.calls[0][1];
    expect(payload).not.toHaveProperty('error');
    expect(payload).toHaveProperty('errorMessage');
    expect(payload).toHaveProperty('errorCode');
  });

  it('2: Push max attempts aşıldı (attempts=MAX) → DLQ', async () => {
    const claimed = makeClaimedRow('PUSH', 'event-push-max', MAX_DELIVERY_ATTEMPTS);
    const mocks = buildMocks('PUSH', claimed);
    mocks.sendFn.mockRejectedValueOnce({ code: 'PROVIDER_ERROR', message: 'Push failed' });

    const { processor, dlqQueue } = await buildPushProcessor(mocks);
    await processor.handleDeliver({ data: { deliveryId: 'del-dlq-1', tenantId: 'tenant-1' } } as never);

    expect(dlqQueue.add).toHaveBeenCalledTimes(1);
    expect(dlqQueue.add.mock.calls[0][1].channel).toBe('PUSH');
  });

  it('3: Push TRANSIENT hata < max → DLQ YOK', async () => {
    const mocks = buildMocks('PUSH', makeClaimedRow('PUSH', 'ev-1', 1));
    mocks.sendFn.mockRejectedValueOnce({ code: 'PROVIDER_ERROR', message: 'Geçici' });

    const { processor, dlqQueue } = await buildPushProcessor(mocks);
    await processor.handleDeliver({ data: { deliveryId: 'del-dlq-1', tenantId: 'tenant-1' } } as never);

    expect(dlqQueue.add).not.toHaveBeenCalled();
  });

  // ── Cross-channel eventId/channel doğrulaması ─────────────────────────────

  it('her kanal kendi channel değerini DLQ\'ya yazar', async () => {
    for (const ch of ['SMS', 'EMAIL', 'PUSH'] as const) {
      jest.clearAllMocks();

      const claimed = makeClaimedRow(ch, `event-${ch.toLowerCase()}`);
      const mocks = buildMocks(ch, claimed);
      mocks.sendFn.mockRejectedValueOnce({ code: PERMANENT_CODE, message: 'err' });

      let proc: SmsDeliveryProcessor | EmailDeliveryProcessor | PushDeliveryProcessor;
      let dlqQueue: ReturnType<typeof buildMocks>['dlqQueue'];

      if (ch === 'SMS') {
        ({ processor: proc, dlqQueue } = await buildSmsProcessor(mocks));
      } else if (ch === 'EMAIL') {
        ({ processor: proc, dlqQueue } = await buildEmailProcessor(mocks));
      } else {
        ({ processor: proc, dlqQueue } = await buildPushProcessor(mocks));
      }

      await (proc as SmsDeliveryProcessor).handleDeliver(
        { data: { deliveryId: 'del-dlq-1', tenantId: 'tenant-1' } } as never,
      );

      expect(dlqQueue.add.mock.calls[0][1].channel).toBe(ch);
      expect(dlqQueue.add.mock.calls[0][1].eventId).toBe(`event-${ch.toLowerCase()}`);
    }
  });
});
