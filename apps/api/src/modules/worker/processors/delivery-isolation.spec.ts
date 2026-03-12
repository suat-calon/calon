/**
 * TEST 5: Delivery Isolation — Bir Kanalın Başarısızlığı Diğerlerini Bloke Etmez
 * ──────────────────────────────────────────────────────────────────────────────
 * Aynı event için SMS başarısız olsa da EMAIL ve PUSH delivery'leri
 * kendi bağımsız state makinesiyle ilerler.
 *
 * Kapsam:
 *   - SMS FAILED → EMAIL ve PUSH hâlâ QUEUED/PROCESSING kalabilir
 *   - DISPATCHED event: aktif delivery varsa status değişmez
 *   - DISPATCHED event: tüm delivery'ler terminal → DELIVERED / PARTIALLY_DELIVERED
 *   - PERMANENT_FAILURE olan kanal hasPartialFailure = true yapar
 *
 * ÖNEMLİ — Mock çağrı sırası:
 *   handleRecover içinde Prisma sorguları şu sırayla gerçekleşir:
 *   1. eventDelivery.findMany   → findDeliveriesReadyForRetry()
 *   2. eventOutbox.findMany     → findDispatchedEventsWithTerminalDeliveries()
 *   3. eventDelivery.findMany   → findDispatchedEventsWithTerminalDeliveries()
 *   Her test bu sırayı mockResolvedValueOnce zinciriyle yansıtır.
 * ──────────────────────────────────────────────────────────────────────────────
 */

import { Test, TestingModule } from '@nestjs/testing';
import { getQueueToken }       from '@nestjs/bull';
import { RecoveryProcessor }   from './recovery.processor';
import { OutboxRepository }    from '../../event/outbox.repository';
import { DeliveryRepository }  from '../../delivery/delivery.repository';
import { PrismaService }       from '../../../common/prisma.service';
import { QUEUE_NAMES }         from '../../../common/queue/queue-names';

// ── Yardımcı ─────────────────────────────────────────────────────────────────

function makeDelivery(overrides: Partial<{
  id: string; eventId: string; tenantId: string;
  channel: string; status: string; attempts: number;
}> = {}) {
  return {
    id:       'del-1',
    eventId:  'event-1',
    tenantId: 'tenant-1',
    channel:  'SMS',
    status:   'FAILED',
    attempts: 1,
    ...overrides,
  };
}

// ── Test suite ────────────────────────────────────────────────────────────────

describe('Delivery Isolation — Cross-Channel Independence', () => {
  let processor: RecoveryProcessor;

  const mockOutbox = {
    findStuckProcessing:    jest.fn().mockResolvedValue([]),
    markForRetry:           jest.fn().mockResolvedValue(undefined),
    markDelivered:          jest.fn().mockResolvedValue(undefined),
    markPartiallyDelivered: jest.fn().mockResolvedValue(undefined),
  };

  const mockDelivery = {
    findStuckProcessing:  jest.fn().mockResolvedValue([]),
    markFailedWithRetry:  jest.fn().mockResolvedValue(undefined),
    markPermanentFailure: jest.fn().mockResolvedValue(undefined),
  };

  // eventDelivery.findMany ve eventOutbox.findMany için ayrı mock fonksiyonları
  const mockEventDeliveryFindMany = jest.fn();
  const mockEventOutboxFindMany   = jest.fn();

  const mockPrisma = {
    eventDelivery: { findMany: mockEventDeliveryFindMany },
    eventOutbox:   { findMany: mockEventOutboxFindMany },
  };

  const makeQueue = () => ({ add: jest.fn().mockResolvedValue({ id: 'j1' }) });

  beforeEach(async () => {
    jest.clearAllMocks();
    // Default: boş dizi döner
    mockEventDeliveryFindMany.mockResolvedValue([]);
    mockEventOutboxFindMany.mockResolvedValue([]);

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        RecoveryProcessor,
        { provide: OutboxRepository,   useValue: mockOutbox },
        { provide: DeliveryRepository, useValue: mockDelivery },
        { provide: PrismaService,      useValue: mockPrisma },
        { provide: getQueueToken(QUEUE_NAMES.EVENT_DISPATCH),     useValue: makeQueue() },
        { provide: getQueueToken(QUEUE_NAMES.NOTIFICATION_SMS),   useValue: makeQueue() },
        { provide: getQueueToken(QUEUE_NAMES.NOTIFICATION_EMAIL), useValue: makeQueue() },
        { provide: getQueueToken(QUEUE_NAMES.NOTIFICATION_PUSH),  useValue: makeQueue() },
        { provide: getQueueToken(QUEUE_NAMES.NOTIFICATION_DLQ),   useValue: makeQueue() },
      ],
    }).compile();

    processor = module.get(RecoveryProcessor);
  });

  it('SMS FAILED + EMAIL QUEUED → event hâlâ DISPATCHED kalır (güncellenmez)', async () => {
    // Çağrı sırası:
    //   1. eventDelivery.findMany (findDeliveriesReadyForRetry) → []
    //   2. eventOutbox.findMany   (findDispatchedEvents)        → [event-1]
    //   3. eventDelivery.findMany (delivery statuses)           → [sms=PERMANENT_FAILURE, email=QUEUED]
    mockEventDeliveryFindMany
      .mockResolvedValueOnce([])   // step 1
      .mockResolvedValueOnce([     // step 3
        makeDelivery({ id: 'del-sms',   channel: 'SMS',   status: 'PERMANENT_FAILURE' }),
        makeDelivery({ id: 'del-email', channel: 'EMAIL', status: 'QUEUED'            }),
      ]);
    mockEventOutboxFindMany
      .mockResolvedValueOnce([{ id: 'event-1' }]); // step 2

    const job = { data: { triggeredBy: 'test' } } as never;
    await processor.handleRecover(job);

    // Aktif delivery (EMAIL=QUEUED) olduğundan event status değişmemeli
    expect(mockOutbox.markDelivered).not.toHaveBeenCalled();
    expect(mockOutbox.markPartiallyDelivered).not.toHaveBeenCalled();
  });

  it('tüm delivery\'ler terminal + PERMANENT_FAILURE var → PARTIALLY_DELIVERED', async () => {
    // SMS=PERMANENT_FAILURE (başarısız), EMAIL=DELIVERED (başarılı)
    mockEventDeliveryFindMany
      .mockResolvedValueOnce([])   // findDeliveriesReadyForRetry → boş
      .mockResolvedValueOnce([     // delivery statuses
        makeDelivery({ id: 'del-sms',   eventId: 'event-2', channel: 'SMS',   status: 'PERMANENT_FAILURE' }),
        makeDelivery({ id: 'del-email', eventId: 'event-2', channel: 'EMAIL', status: 'DELIVERED'         }),
      ]);
    mockEventOutboxFindMany
      .mockResolvedValueOnce([{ id: 'event-2' }]);

    const job = { data: { triggeredBy: 'test' } } as never;
    await processor.handleRecover(job);

    expect(mockOutbox.markPartiallyDelivered).toHaveBeenCalledWith('event-2');
    expect(mockOutbox.markDelivered).not.toHaveBeenCalled();
  });

  it('tüm delivery\'ler DELIVERED → DELIVERED', async () => {
    mockEventDeliveryFindMany
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([
        makeDelivery({ id: 'del-sms',   eventId: 'event-3', channel: 'SMS',   status: 'DELIVERED' }),
        makeDelivery({ id: 'del-email', eventId: 'event-3', channel: 'EMAIL', status: 'DELIVERED' }),
      ]);
    mockEventOutboxFindMany
      .mockResolvedValueOnce([{ id: 'event-3' }]);

    const job = { data: { triggeredBy: 'test' } } as never;
    await processor.handleRecover(job);

    expect(mockOutbox.markDelivered).toHaveBeenCalledWith('event-3');
    expect(mockOutbox.markPartiallyDelivered).not.toHaveBeenCalled();
  });

  it('farklı event\'lerin delivery\'leri birbirini etkilemez', async () => {
    // Event-A: SMS=FAILED (aktif!) + EMAIL=DELIVERED → güncelleme YOK
    // Event-B: SMS=DELIVERED + EMAIL=DELIVERED → DELIVERED
    mockEventDeliveryFindMany
      .mockResolvedValueOnce([])   // findDeliveriesReadyForRetry → boş
      .mockResolvedValueOnce([     // delivery statuses (her iki event birlikte)
        makeDelivery({ id: 'del-A-sms',   eventId: 'event-A', channel: 'SMS',   status: 'FAILED'    }),
        makeDelivery({ id: 'del-A-email', eventId: 'event-A', channel: 'EMAIL', status: 'DELIVERED' }),
        makeDelivery({ id: 'del-B-sms',   eventId: 'event-B', channel: 'SMS',   status: 'DELIVERED' }),
        makeDelivery({ id: 'del-B-email', eventId: 'event-B', channel: 'EMAIL', status: 'DELIVERED' }),
      ]);
    mockEventOutboxFindMany
      .mockResolvedValueOnce([{ id: 'event-A' }, { id: 'event-B' }]);

    const job = { data: { triggeredBy: 'test' } } as never;
    await processor.handleRecover(job);

    // Event-A aktif delivery nedeniyle güncellenmemeli
    expect(mockOutbox.markDelivered).not.toHaveBeenCalledWith('event-A');
    expect(mockOutbox.markPartiallyDelivered).not.toHaveBeenCalledWith('event-A');

    // Event-B tamamen tamamlanmış → DELIVERED
    expect(mockOutbox.markDelivered).toHaveBeenCalledWith('event-B');
  });
});
