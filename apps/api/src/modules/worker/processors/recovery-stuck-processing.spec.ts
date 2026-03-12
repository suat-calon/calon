/**
 * TEST 1 — FAZ 24.8: Recovery Stuck PROCESSING + Max Attempts
 * ──────────────────────────────────────────────────────────────────────────────
 * RecoveryProcessor'ın iki kritik davranışını doğrular:
 *
 *   A. Stuck PROCESSING delivery < MAX_DELIVERY_ATTEMPTS:
 *      → markFailedWithRetry çağrılır, DLQ'ya GÖNDERİLMEZ
 *
 *   B. Stuck PROCESSING delivery ≥ MAX_DELIVERY_ATTEMPTS:
 *      → markPermanentFailure + dlqQueue.add('dlq', ...) çağrılır
 *      → DLQ payload: { originalQueue, deliveryId, tenantId, eventId, channel,
 *                       errorCode: 'MAX_ATTEMPTS_REACHED', errorMessage }
 *
 * MAX_DELIVERY_ATTEMPTS = 5 (retry-policy.ts)
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

// ── Yardımcı fabrika ──────────────────────────────────────────────────────────

function makeStuckDelivery(overrides: Partial<{
  id: string;
  tenantId: string;
  eventId: string;
  channel: string;
  attempts: number;
  recipient: string;
}> = {}) {
  return {
    id:       'del-stuck-1',
    tenantId: 'tenant-1',
    eventId:  'event-stuck-1',
    channel:  'SMS',
    attempts: 1,
    recipient: '+905001234567',
    payload:  { body: 'Test' },
    idempotencyKey: 'key-1',
    costEstimateMinor: null,
    ...overrides,
  };
}

// ── Mocks ─────────────────────────────────────────────────────────────────────

const mockOutbox = {
  findStuckProcessing: jest.fn().mockResolvedValue([]),
  markForRetry:        jest.fn().mockResolvedValue(undefined),
  markDelivered:       jest.fn().mockResolvedValue(undefined),
  markPartiallyDelivered: jest.fn().mockResolvedValue(undefined),
};

const mockDelivery = {
  findStuckProcessing:  jest.fn().mockResolvedValue([]),
  markFailedWithRetry:  jest.fn().mockResolvedValue(undefined),
  markPermanentFailure: jest.fn().mockResolvedValue(undefined),
};

const mockPrisma = {
  eventDelivery: { findMany: jest.fn().mockResolvedValue([]) },
  eventOutbox:   { findMany: jest.fn().mockResolvedValue([]) },
};

const makeQueue = () => ({ add: jest.fn().mockResolvedValue({ id: 'job-1' }) });
let mockDlqQueue: ReturnType<typeof makeQueue>;
let mockDispatchQueue: ReturnType<typeof makeQueue>;
let mockSmsQueue: ReturnType<typeof makeQueue>;
let mockEmailQueue: ReturnType<typeof makeQueue>;
let mockPushQueue: ReturnType<typeof makeQueue>;

// ── Test suite ────────────────────────────────────────────────────────────────

describe('RecoveryProcessor — Stuck PROCESSING (FAZ 24.8 Test 1)', () => {
  let processor: RecoveryProcessor;

  beforeEach(async () => {
    jest.clearAllMocks();

    mockDlqQueue      = makeQueue();
    mockDispatchQueue = makeQueue();
    mockSmsQueue      = makeQueue();
    mockEmailQueue    = makeQueue();
    mockPushQueue     = makeQueue();

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

    // Section 1 (stuck outbox events) → boş
    mockOutbox.findStuckProcessing.mockResolvedValue([]);
    // Section 4 (dispatched events) → boş
    mockPrisma.eventOutbox.findMany.mockResolvedValue([]);
    // Section 3 (failed ready for retry) → boş
    mockPrisma.eventDelivery.findMany.mockResolvedValue([]);
  });

  const makeJob = () => ({ data: { triggeredBy: 'test' } } as never);

  // ── A: < max attempts → retry (DLQ YOK) ─────────────────────────────────

  it(
    'A: stuck PROCESSING < MAX_DELIVERY_ATTEMPTS → markFailedWithRetry, DLQ YOK',
    async () => {
      const delivery = makeStuckDelivery({ attempts: MAX_DELIVERY_ATTEMPTS - 1 });
      mockDelivery.findStuckProcessing.mockResolvedValueOnce([delivery]);

      await processor.handleRecover(makeJob());

      expect(mockDelivery.markFailedWithRetry).toHaveBeenCalledTimes(1);
      expect(mockDelivery.markFailedWithRetry).toHaveBeenCalledWith(
        delivery.id,
        'STUCK_PROCESSING',
        expect.any(String),
        expect.any(Date),
      );
      expect(mockDelivery.markPermanentFailure).not.toHaveBeenCalled();
      expect(mockDlqQueue.add).not.toHaveBeenCalled();
    },
  );

  it(
    'A: stuck PROCESSING ile retry kuyruğa basılır (SMS)',
    async () => {
      const delivery = makeStuckDelivery({ attempts: 2, channel: 'SMS' });
      mockDelivery.findStuckProcessing.mockResolvedValueOnce([delivery]);

      await processor.handleRecover(makeJob());

      expect(mockSmsQueue.add).toHaveBeenCalledTimes(1);
      expect(mockSmsQueue.add).toHaveBeenCalledWith(
        'deliver',
        { deliveryId: delivery.id, tenantId: delivery.tenantId },
        expect.any(Object),
      );
    },
  );

  // ── B: ≥ max attempts → PERMANENT_FAILURE + DLQ ──────────────────────────

  it(
    'B: stuck PROCESSING ≥ MAX_DELIVERY_ATTEMPTS → markPermanentFailure',
    async () => {
      const delivery = makeStuckDelivery({ attempts: MAX_DELIVERY_ATTEMPTS });
      mockDelivery.findStuckProcessing.mockResolvedValueOnce([delivery]);

      await processor.handleRecover(makeJob());

      expect(mockDelivery.markPermanentFailure).toHaveBeenCalledTimes(1);
      expect(mockDelivery.markPermanentFailure).toHaveBeenCalledWith(
        delivery.id,
        'MAX_ATTEMPTS_REACHED',
        expect.stringContaining(`${MAX_DELIVERY_ATTEMPTS}`),
      );
    },
  );

  it(
    'B: stuck PROCESSING ≥ MAX_DELIVERY_ATTEMPTS → DLQ enqueue',
    async () => {
      const delivery = makeStuckDelivery({
        attempts: MAX_DELIVERY_ATTEMPTS,
        channel:  'EMAIL',
        eventId:  'event-max-1',
      });
      mockDelivery.findStuckProcessing.mockResolvedValueOnce([delivery]);

      await processor.handleRecover(makeJob());

      expect(mockDlqQueue.add).toHaveBeenCalledTimes(1);
      expect(mockDlqQueue.add).toHaveBeenCalledWith(
        'dlq',
        expect.objectContaining({
          originalQueue: QUEUE_NAMES.NOTIFICATION_EMAIL,
          deliveryId:    delivery.id,
          tenantId:      delivery.tenantId,
          eventId:       delivery.eventId,
          channel:       'EMAIL',
          errorCode:     'MAX_ATTEMPTS_REACHED',
          errorMessage:  expect.any(String),
        }),
      );
    },
  );

  it(
    'B: attempts > MAX_DELIVERY_ATTEMPTS da PERMANENT_FAILURE + DLQ tetiklenir',
    async () => {
      const delivery = makeStuckDelivery({ attempts: MAX_DELIVERY_ATTEMPTS + 2 });
      mockDelivery.findStuckProcessing.mockResolvedValueOnce([delivery]);

      await processor.handleRecover(makeJob());

      expect(mockDelivery.markPermanentFailure).toHaveBeenCalledTimes(1);
      expect(mockDlqQueue.add).toHaveBeenCalledTimes(1);
    },
  );

  it(
    'B: max attempts → markFailedWithRetry çağrılmaz (sadece PERMANENT)',
    async () => {
      const delivery = makeStuckDelivery({ attempts: MAX_DELIVERY_ATTEMPTS });
      mockDelivery.findStuckProcessing.mockResolvedValueOnce([delivery]);

      await processor.handleRecover(makeJob());

      expect(mockDelivery.markFailedWithRetry).not.toHaveBeenCalled();
    },
  );

  // ── Kanal → originalQueue mapping ────────────────────────────────────────

  it.each([
    ['SMS',   QUEUE_NAMES.NOTIFICATION_SMS],
    ['EMAIL', QUEUE_NAMES.NOTIFICATION_EMAIL],
    ['PUSH',  QUEUE_NAMES.NOTIFICATION_PUSH],
  ])(
    'B: channel=%s → originalQueue=%s',
    async (channel, expectedQueue) => {
      const delivery = makeStuckDelivery({ channel, attempts: MAX_DELIVERY_ATTEMPTS });
      mockDelivery.findStuckProcessing.mockResolvedValueOnce([delivery]);

      await processor.handleRecover(makeJob());

      expect(mockDlqQueue.add).toHaveBeenCalledWith(
        'dlq',
        expect.objectContaining({ originalQueue: expectedQueue, channel }),
      );
    },
  );

  // ── Birden fazla stuck delivery ───────────────────────────────────────────

  it(
    'birden fazla stuck delivery: max olanlar DLQ, diğerleri retry',
    async () => {
      const d1 = makeStuckDelivery({ id: 'del-1', attempts: 2 });                        // retry
      const d2 = makeStuckDelivery({ id: 'del-2', attempts: MAX_DELIVERY_ATTEMPTS });     // DLQ
      const d3 = makeStuckDelivery({ id: 'del-3', attempts: MAX_DELIVERY_ATTEMPTS + 1 }); // DLQ
      mockDelivery.findStuckProcessing.mockResolvedValueOnce([d1, d2, d3]);

      await processor.handleRecover(makeJob());

      expect(mockDelivery.markFailedWithRetry).toHaveBeenCalledTimes(1);
      expect(mockDelivery.markPermanentFailure).toHaveBeenCalledTimes(2);
      expect(mockDlqQueue.add).toHaveBeenCalledTimes(2);
    },
  );
});
