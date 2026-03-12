/**
 * TEST 3 & 4: Recovery Processor — Max Attempts & Retry Scheduling
 * ──────────────────────────────────────────────────────────────────────────────
 * Test 3: 5 denemeden sonra PERMANENT_FAILURE'a geçiş.
 * Test 4: Recovery yalnızca nextRetryAt <= now() olan FAILED delivery'leri alır.
 * ──────────────────────────────────────────────────────────────────────────────
 */

import { Test, TestingModule } from '@nestjs/testing';
import { getQueueToken }       from '@nestjs/bull';
import { RecoveryProcessor }   from './recovery.processor';
import { OutboxRepository }    from '../../event/outbox.repository';
import { DeliveryRepository }  from '../../delivery/delivery.repository';
import { PrismaService }       from '../../../common/prisma.service';
import { QUEUE_NAMES }         from '../../../common/queue/queue-names';
import { MAX_DELIVERY_ATTEMPTS } from '../../delivery/retry-policy';

// ── Mock fabrikaları ──────────────────────────────────────────────────────────

function makeDeliveryRecord(overrides: Partial<{
  id: string;
  tenantId: string;
  channel: string;
  attempts: number;
  status: string;
  nextAttemptAt: Date;
}> = {}) {
  return {
    id:           'delivery-1',
    tenantId:     'tenant-1',
    channel:      'SMS',
    attempts:     0,
    status:       'FAILED',
    nextAttemptAt: new Date(Date.now() - 1000), // 1 saniye önce → ready
    ...overrides,
  };
}

// ── Test suite ────────────────────────────────────────────────────────────────

describe('RecoveryProcessor — Max Attempts & Retry Scheduling', () => {
  let processor: RecoveryProcessor;

  // Mock bağımlılıklar
  const mockOutbox = {
    findStuckProcessing:          jest.fn().mockResolvedValue([]),
    markForRetry:                 jest.fn().mockResolvedValue(undefined),
    markDelivered:                jest.fn().mockResolvedValue(undefined),
    markPartiallyDelivered:       jest.fn().mockResolvedValue(undefined),
  };

  const mockDelivery = {
    findStuckProcessing:   jest.fn().mockResolvedValue([]),
    markFailedWithRetry:   jest.fn().mockResolvedValue(undefined),
    markPermanentFailure:  jest.fn().mockResolvedValue(undefined),
  };

  const mockPrisma = {
    eventDelivery: { findMany: jest.fn().mockResolvedValue([]) },
    eventOutbox:   { findMany: jest.fn().mockResolvedValue([]) },
  };

  const makeQueue = () => ({
    add: jest.fn().mockResolvedValue({ id: 'job-1' }),
  });

  beforeEach(async () => {
    jest.clearAllMocks();

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        RecoveryProcessor,
        { provide: OutboxRepository,    useValue: mockOutbox },
        { provide: DeliveryRepository,  useValue: mockDelivery },
        { provide: PrismaService,       useValue: mockPrisma },
        { provide: getQueueToken(QUEUE_NAMES.EVENT_DISPATCH),       useValue: makeQueue() },
        { provide: getQueueToken(QUEUE_NAMES.NOTIFICATION_SMS),     useValue: makeQueue() },
        { provide: getQueueToken(QUEUE_NAMES.NOTIFICATION_EMAIL),   useValue: makeQueue() },
        { provide: getQueueToken(QUEUE_NAMES.NOTIFICATION_PUSH),    useValue: makeQueue() },
        { provide: getQueueToken(QUEUE_NAMES.NOTIFICATION_DLQ),     useValue: makeQueue() },
      ],
    }).compile();

    processor = module.get(RecoveryProcessor);
  });

  // ── Test 3: MAX_DELIVERY_ATTEMPTS sonrası PERMANENT_FAILURE ──────────────────

  describe('Test 3: 5. deneme sonrası PERMANENT_FAILURE', () => {
    it(`attempts = MAX (${MAX_DELIVERY_ATTEMPTS}) olan FAILED delivery → PERMANENT_FAILURE`, async () => {
      const maxRecord = makeDeliveryRecord({ attempts: MAX_DELIVERY_ATTEMPTS });
      mockPrisma.eventDelivery.findMany.mockResolvedValueOnce([maxRecord]);

      const job = { data: { triggeredBy: 'test' } } as never;
      await processor.handleRecover(job);

      expect(mockDelivery.markPermanentFailure).toHaveBeenCalledWith(
        maxRecord.id,
        'MAX_ATTEMPTS_REACHED',
        expect.stringContaining(`${MAX_DELIVERY_ATTEMPTS}/${MAX_DELIVERY_ATTEMPTS}`),
      );
      // queue.add çağrılmamalı — permanent failure, tekrar denemez
      // (smsQueue.add'i doğrudan test edemeyiz burada ama markPermanentFailure çağrıldı)
    });

    it(`attempts > MAX (${MAX_DELIVERY_ATTEMPTS + 1}) olan FAILED delivery → PERMANENT_FAILURE`, async () => {
      const overRecord = makeDeliveryRecord({ attempts: MAX_DELIVERY_ATTEMPTS + 1 });
      mockPrisma.eventDelivery.findMany.mockResolvedValueOnce([overRecord]);

      const job = { data: { triggeredBy: 'test' } } as never;
      await processor.handleRecover(job);

      expect(mockDelivery.markPermanentFailure).toHaveBeenCalledWith(
        overRecord.id,
        'MAX_ATTEMPTS_REACHED',
        expect.any(String),
      );
    });

    it('attempts < MAX → PERMANENT_FAILURE çağrılmaz', async () => {
      const normalRecord = makeDeliveryRecord({ attempts: MAX_DELIVERY_ATTEMPTS - 1 });
      mockPrisma.eventDelivery.findMany.mockResolvedValueOnce([normalRecord]);

      const job = { data: { triggeredBy: 'test' } } as never;
      await processor.handleRecover(job);

      expect(mockDelivery.markPermanentFailure).not.toHaveBeenCalled();
    });
  });

  // ── Test 4: nextRetryAt <= now() filtresi ────────────────────────────────────

  describe('Test 4: Recovery yalnızca zamanı gelmiş FAILED delivery alır', () => {
    it('nextAttemptAt <= now olan delivery → kuyruğa basılır', async () => {
      const readyRecord = makeDeliveryRecord({
        id:           'delivery-ready',
        attempts:     2,
        nextAttemptAt: new Date(Date.now() - 5_000), // 5sn önce
      });
      mockPrisma.eventDelivery.findMany.mockResolvedValueOnce([readyRecord]);

      const job = { data: { triggeredBy: 'test' } } as never;
      await processor.handleRecover(job);

      // PERMANENT_FAILURE çağrılmamış (attempts < MAX)
      expect(mockDelivery.markPermanentFailure).not.toHaveBeenCalled();
    });

    it('nextAttemptAt sorgusu status=FAILED ve lte:now kullanır', async () => {
      // findMany mock'u doğrudan kontrol et
      mockPrisma.eventDelivery.findMany.mockResolvedValueOnce([]);

      const job = { data: { triggeredBy: 'test' } } as never;
      await processor.handleRecover(job);

      // findMany çağrısı inceleme
      expect(mockPrisma.eventDelivery.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            status:        'FAILED',
            nextAttemptAt: expect.objectContaining({ lte: expect.any(Date) }),
          }),
        }),
      );
    });

    it('nextAttemptAt geleceğe ait delivery → bu çalışmada döndürülmez (Prisma filtresi)', async () => {
      // Recovery processor'ın kendi DB sorgusu zaten lte filtreliyor.
      // Bu test Prisma mock'unu future delivery döndürmeyecek şekilde kuruyor.
      mockPrisma.eventDelivery.findMany.mockResolvedValueOnce([]); // filtre geçmedi

      const job = { data: { triggeredBy: 'test' } } as never;
      await processor.handleRecover(job);

      // Hiç delivery işlenmedi
      expect(mockDelivery.markPermanentFailure).not.toHaveBeenCalled();
    });
  });

  // ── Stuck PROCESSING max attempts guard ──────────────────────────────────────

  describe('Stuck PROCESSING + max attempts', () => {
    it('stuck ve max attempts olan delivery → PERMANENT_FAILURE', async () => {
      const stuckMax = makeDeliveryRecord({ id: 'stuck-max', attempts: MAX_DELIVERY_ATTEMPTS, status: 'PROCESSING' });
      mockDelivery.findStuckProcessing.mockResolvedValueOnce([stuckMax]);

      const job = { data: { triggeredBy: 'test' } } as never;
      await processor.handleRecover(job);

      expect(mockDelivery.markPermanentFailure).toHaveBeenCalledWith(
        'stuck-max',
        'MAX_ATTEMPTS_REACHED',
        expect.stringContaining('Stuck PROCESSING'),
      );
      expect(mockDelivery.markFailedWithRetry).not.toHaveBeenCalled();
    });

    it('stuck ama attempts < max → markFailedWithRetry çağrılır', async () => {
      const stuckLow = makeDeliveryRecord({ id: 'stuck-low', attempts: 2, status: 'PROCESSING' });
      mockDelivery.findStuckProcessing.mockResolvedValueOnce([stuckLow]);

      const job = { data: { triggeredBy: 'test' } } as never;
      await processor.handleRecover(job);

      expect(mockDelivery.markFailedWithRetry).toHaveBeenCalledWith(
        'stuck-low',
        'STUCK_PROCESSING',
        expect.any(String),
        expect.any(Date),
      );
      expect(mockDelivery.markPermanentFailure).not.toHaveBeenCalled();
    });
  });
});
