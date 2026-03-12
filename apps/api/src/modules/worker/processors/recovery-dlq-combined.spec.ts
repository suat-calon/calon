/**
 * TEST 4 — FAZ 24.8: Recovery FAILED Max Attempts → DLQ
 * ──────────────────────────────────────────────────────────────────────────────
 * RecoveryProcessor — Bölüm 3 (retry zamanı gelmiş FAILED delivery'ler):
 *
 *   A. FAILED delivery < MAX_DELIVERY_ATTEMPTS → kanal queue'ya basılır
 *   B. FAILED delivery ≥ MAX_DELIVERY_ATTEMPTS → markPermanentFailure + DLQ
 *   C. DLQ payload doğrulaması: tüm zorunlu alanlar mevcut
 *   D. max attempts durumunda kanal queue'ya BASILMAZ
 *
 * Bu test, recovery'nin yalnızca "stuck PROCESSING" değil, aynı zamanda
 * "retry zamanı gelmiş ama max attempts'e ulaşmış FAILED" delivery'leri
 * de doğru şekilde DLQ'ya yönlendirdiğini doğrular.
 * ──────────────────────────────────────────────────────────────────────────────
 */

import { Test, TestingModule } from '@nestjs/testing';
import { getQueueToken }       from '@nestjs/bull';
import { RecoveryProcessor }   from './recovery.processor';
import { PrismaService }       from '../../../common/prisma.service';
import { OutboxRepository }    from '../../event/outbox.repository';
import { DeliveryRepository }  from '../../delivery/delivery.repository';
import { QUEUE_NAMES }         from '../../../common/queue/queue-names';
import { MAX_DELIVERY_ATTEMPTS } from '../../delivery/retry-policy';

// ── Fabrika ───────────────────────────────────────────────────────────────────

function makeFailedDelivery(overrides: Partial<{
  id: string;
  tenantId: string;
  eventId: string;
  channel: string;
  attempts: number;
  nextAttemptAt: Date;
}> = {}) {
  return {
    id:           'del-failed-1',
    tenantId:     'tenant-1',
    eventId:      'event-failed-1',
    channel:      'SMS',
    status:       'FAILED',
    attempts:     1,
    nextAttemptAt: new Date(Date.now() - 1000), // geçmişte
    recipient:    '+905001234567',
    payload:      { body: 'Retry test' },
    idempotencyKey: 'key-failed',
    costEstimateMinor: null,
    ...overrides,
  };
}

// ── Mocks ─────────────────────────────────────────────────────────────────────

const mockOutbox = {
  findStuckProcessing:    jest.fn().mockResolvedValue([]),
  markForRetry:           jest.fn().mockResolvedValue(undefined),
  markDelivered:          jest.fn().mockResolvedValue(undefined),
  markPartiallyDelivered: jest.fn().mockResolvedValue(undefined),
};

const mockDelivery = {
  findStuckProcessing:   jest.fn().mockResolvedValue([]),
  markFailedWithRetry:   jest.fn().mockResolvedValue(undefined),
  markPermanentFailure:  jest.fn().mockResolvedValue(undefined),
};

const mockPrisma = {
  eventDelivery: { findMany: jest.fn() },
  eventOutbox:   { findMany: jest.fn().mockResolvedValue([]) },
};

const makeQueue = () => ({ add: jest.fn().mockResolvedValue({ id: 'q-1' }) });

// ── Test suite ────────────────────────────────────────────────────────────────

describe('RecoveryProcessor — FAILED Max Attempts + DLQ (FAZ 24.8 Test 4)', () => {
  let processor: RecoveryProcessor;
  let mockDlqQueue: ReturnType<typeof makeQueue>;
  let mockSmsQueue: ReturnType<typeof makeQueue>;
  let mockEmailQueue: ReturnType<typeof makeQueue>;
  let mockPushQueue: ReturnType<typeof makeQueue>;
  let mockDispatchQueue: ReturnType<typeof makeQueue>;

  beforeEach(async () => {
    jest.clearAllMocks();

    mockDlqQueue      = makeQueue();
    mockSmsQueue      = makeQueue();
    mockEmailQueue    = makeQueue();
    mockPushQueue     = makeQueue();
    mockDispatchQueue = makeQueue();

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        RecoveryProcessor,
        { provide: PrismaService,      useValue: mockPrisma },
        { provide: OutboxRepository,   useValue: mockOutbox },
        { provide: DeliveryRepository, useValue: mockDelivery },
        { provide: getQueueToken(QUEUE_NAMES.EVENT_DISPATCH),      useValue: mockDispatchQueue },
        { provide: getQueueToken(QUEUE_NAMES.NOTIFICATION_SMS),    useValue: mockSmsQueue },
        { provide: getQueueToken(QUEUE_NAMES.NOTIFICATION_EMAIL),  useValue: mockEmailQueue },
        { provide: getQueueToken(QUEUE_NAMES.NOTIFICATION_PUSH),   useValue: mockPushQueue },
        { provide: getQueueToken(QUEUE_NAMES.NOTIFICATION_DLQ),    useValue: mockDlqQueue },
      ],
    }).compile();

    processor = module.get(RecoveryProcessor);

    // Sections 1, 2 boş
    mockOutbox.findStuckProcessing.mockResolvedValue([]);
    mockDelivery.findStuckProcessing.mockResolvedValue([]);
    // Section 4 boş
    mockPrisma.eventOutbox.findMany.mockResolvedValue([]);
  });

  const makeJob = () => ({ data: { triggeredBy: 'test' } } as never);

  // ── A: < max attempts → retry kuyruğa ────────────────────────────────────

  it('A: FAILED < MAX_DELIVERY_ATTEMPTS → SMS kuyruğa basılır', async () => {
    const del = makeFailedDelivery({ attempts: 2, channel: 'SMS' });
    mockPrisma.eventDelivery.findMany.mockResolvedValueOnce([del]);

    await processor.handleRecover(makeJob());

    expect(mockSmsQueue.add).toHaveBeenCalledWith(
      'deliver',
      { deliveryId: del.id, tenantId: del.tenantId },
      expect.any(Object),
    );
    expect(mockDelivery.markPermanentFailure).not.toHaveBeenCalled();
    expect(mockDlqQueue.add).not.toHaveBeenCalled();
  });

  it('A: FAILED < max → EMAIL kuyruğa basılır', async () => {
    const del = makeFailedDelivery({ attempts: 3, channel: 'EMAIL' });
    mockPrisma.eventDelivery.findMany.mockResolvedValueOnce([del]);

    await processor.handleRecover(makeJob());

    expect(mockEmailQueue.add).toHaveBeenCalledTimes(1);
  });

  // ── B: ≥ max attempts → PERMANENT_FAILURE + DLQ ──────────────────────────

  it('B: FAILED ≥ MAX_DELIVERY_ATTEMPTS → markPermanentFailure', async () => {
    const del = makeFailedDelivery({ attempts: MAX_DELIVERY_ATTEMPTS });
    mockPrisma.eventDelivery.findMany.mockResolvedValueOnce([del]);

    await processor.handleRecover(makeJob());

    expect(mockDelivery.markPermanentFailure).toHaveBeenCalledTimes(1);
    expect(mockDelivery.markPermanentFailure).toHaveBeenCalledWith(
      del.id,
      'MAX_ATTEMPTS_REACHED',
      expect.stringContaining(`${MAX_DELIVERY_ATTEMPTS}`),
    );
  });

  it('B: FAILED ≥ MAX_DELIVERY_ATTEMPTS → DLQ enqueue', async () => {
    const del = makeFailedDelivery({ attempts: MAX_DELIVERY_ATTEMPTS, channel: 'PUSH', eventId: 'event-push-1' });
    mockPrisma.eventDelivery.findMany.mockResolvedValueOnce([del]);

    await processor.handleRecover(makeJob());

    expect(mockDlqQueue.add).toHaveBeenCalledTimes(1);
    expect(mockDlqQueue.add).toHaveBeenCalledWith('dlq', expect.objectContaining({
      originalQueue: QUEUE_NAMES.NOTIFICATION_PUSH,
      deliveryId:    del.id,
      tenantId:      del.tenantId,
      eventId:       del.eventId,
      channel:       'PUSH',
      errorCode:     'MAX_ATTEMPTS_REACHED',
      errorMessage:  expect.any(String),
    }));
  });

  // ── C: DLQ payload doğrulaması ────────────────────────────────────────────

  it('C: DLQ payload tüm zorunlu alanları içerir', async () => {
    const del = makeFailedDelivery({
      id:       'del-payload-check',
      tenantId: 'tenant-payload',
      eventId:  'event-payload',
      channel:  'EMAIL',
      attempts: MAX_DELIVERY_ATTEMPTS,
    });
    mockPrisma.eventDelivery.findMany.mockResolvedValueOnce([del]);

    await processor.handleRecover(makeJob());

    const dlqCall = mockDlqQueue.add.mock.calls[0][1];

    expect(dlqCall).toHaveProperty('originalQueue');
    expect(dlqCall).toHaveProperty('deliveryId', del.id);
    expect(dlqCall).toHaveProperty('tenantId', del.tenantId);
    expect(dlqCall).toHaveProperty('eventId', del.eventId);
    expect(dlqCall).toHaveProperty('channel', 'EMAIL');
    expect(dlqCall).toHaveProperty('errorCode', 'MAX_ATTEMPTS_REACHED');
    expect(dlqCall).toHaveProperty('errorMessage');
    expect(typeof dlqCall.errorMessage).toBe('string');
    expect(dlqCall.errorMessage.length).toBeGreaterThan(0);
  });

  // ── D: Max attempts → kanal queue'ya BASILMAZ ────────────────────────────

  it('D: FAILED max attempts → kanal queue (SMS/EMAIL/PUSH) çağrılmaz', async () => {
    const del = makeFailedDelivery({ attempts: MAX_DELIVERY_ATTEMPTS });
    mockPrisma.eventDelivery.findMany.mockResolvedValueOnce([del]);

    await processor.handleRecover(makeJob());

    expect(mockSmsQueue.add).not.toHaveBeenCalled();
    expect(mockEmailQueue.add).not.toHaveBeenCalled();
    expect(mockPushQueue.add).not.toHaveBeenCalled();
  });

  // ── Kanal mapping ─────────────────────────────────────────────────────────

  it.each([
    ['SMS',   QUEUE_NAMES.NOTIFICATION_SMS],
    ['EMAIL', QUEUE_NAMES.NOTIFICATION_EMAIL],
    ['PUSH',  QUEUE_NAMES.NOTIFICATION_PUSH],
  ])(
    'channel=%s → originalQueue=%s DLQ\'da',
    async (channel, expectedQueue) => {
      const del = makeFailedDelivery({ channel, attempts: MAX_DELIVERY_ATTEMPTS });
      mockPrisma.eventDelivery.findMany.mockResolvedValueOnce([del]);

      await processor.handleRecover(makeJob());

      expect(mockDlqQueue.add).toHaveBeenCalledWith(
        'dlq',
        expect.objectContaining({ originalQueue: expectedQueue }),
      );
    },
  );

  // ── Karışık batch: bazıları retry, bazıları DLQ ───────────────────────────

  it('karışık batch: retry + DLQ doğru ayrıştırılır', async () => {
    const d1 = makeFailedDelivery({ id: 'del-r1', attempts: 2 });
    const d2 = makeFailedDelivery({ id: 'del-r2', attempts: 3, channel: 'EMAIL' });
    const d3 = makeFailedDelivery({ id: 'del-d1', attempts: MAX_DELIVERY_ATTEMPTS });
    const d4 = makeFailedDelivery({ id: 'del-d2', attempts: MAX_DELIVERY_ATTEMPTS + 3, channel: 'PUSH' });
    mockPrisma.eventDelivery.findMany.mockResolvedValueOnce([d1, d2, d3, d4]);

    await processor.handleRecover(makeJob());

    // 2 retry kanal queue'ya basılır
    expect(mockSmsQueue.add).toHaveBeenCalledTimes(1);
    expect(mockEmailQueue.add).toHaveBeenCalledTimes(1);
    // 2 DLQ
    expect(mockDelivery.markPermanentFailure).toHaveBeenCalledTimes(2);
    expect(mockDlqQueue.add).toHaveBeenCalledTimes(2);
  });
});
