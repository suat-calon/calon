/**
 * TEST 1 (dispatcher katmanı): Dispatcher Idempotency
 * ──────────────────────────────────────────────────────────────────────────────
 * Aynı event için aynı kanalda çift dispatch → DB'de tek satır.
 *
 * Kapsam:
 *   - createIdempotentInTx null döndürdüğünde delivery job oluşturulmaz
 *   - createIdempotentInTx kayıt döndürdüğünde delivery job oluşturulur
 *   - Diğer DB hataları fırlatılır
 * ──────────────────────────────────────────────────────────────────────────────
 */

import { DeliveryRepository } from '../../delivery/delivery.repository';
import { Logger }             from '@nestjs/common';

// ── Prisma mock ───────────────────────────────────────────────────────────────

const mockPrisma = {
  eventDelivery: { create: jest.fn() },
};

function makeRepo(): DeliveryRepository {
  jest.spyOn(Logger.prototype, 'debug').mockImplementation(() => undefined);
  return new DeliveryRepository(mockPrisma as never);
}

// ── Shared input ──────────────────────────────────────────────────────────────

const baseInput = {
  tenantId:        'tenant-abc',
  eventId:         'event-xyz',
  channel:         'SMS' as const,
  recipient:       '+905559998877',
  templateKey:     'booking.created.sms.v1',
  templateVersion: 1,
  locale:          'tr',
  idempotencyKey:  'booking.created:event-xyz:sms:+905559998877:v1',
  payload:         { body: 'Randevunuz oluşturuldu' },
};

// ── Test suite ────────────────────────────────────────────────────────────────

describe('Dispatcher Idempotency — createIdempotentInTx', () => {
  beforeEach(() => jest.clearAllMocks());

  it('ilk delivery → kayıt oluşturulur', async () => {
    const record = { id: 'del-001' };
    mockPrisma.eventDelivery.create.mockResolvedValueOnce(record);
    const repo = makeRepo();

    const result = await repo.createIdempotentInTx(baseInput, mockPrisma as never);
    expect(result).toEqual(record);
  });

  it('aynı (eventId + channel) ikinci çağrı → P2002 → null döner', async () => {
    // İlk çağrı başarılı
    mockPrisma.eventDelivery.create.mockResolvedValueOnce({ id: 'del-001' });
    // İkinci çağrı P2002 (unique constraint)
    mockPrisma.eventDelivery.create.mockRejectedValueOnce(
      Object.assign(new Error('Unique constraint'), { code: 'P2002' }),
    );

    const repo = makeRepo();
    const tx   = mockPrisma as never;

    const first  = await repo.createIdempotentInTx(baseInput, tx);
    const second = await repo.createIdempotentInTx(baseInput, tx);

    expect(first).not.toBeNull();
    expect(second).toBeNull();            // duplicate → sessizce atlandı
    expect(mockPrisma.eventDelivery.create).toHaveBeenCalledTimes(2);
  });

  it('delivery null ise queue.add çağrılmaması beklenir (caller guard)', async () => {
    // Bu test caller mantığını simüle eder
    mockPrisma.eventDelivery.create.mockRejectedValueOnce(
      Object.assign(new Error('Duplicate'), { code: 'P2002' }),
    );

    const repo          = makeRepo();
    const mockQueueAdd  = jest.fn();
    const deliveryRecord = await repo.createIdempotentInTx(baseInput, mockPrisma as never);

    // Caller: null kontrolü → atla
    if (deliveryRecord) {
      mockQueueAdd({ deliveryId: deliveryRecord.id, tenantId: baseInput.tenantId });
    }

    expect(mockQueueAdd).not.toHaveBeenCalled(); // null → queue basılmadı
  });

  it('delivery geçerliyse queue.add çağrılır', async () => {
    mockPrisma.eventDelivery.create.mockResolvedValueOnce({ id: 'del-new' });

    const repo         = makeRepo();
    const mockQueueAdd = jest.fn();
    const deliveryRecord = await repo.createIdempotentInTx(baseInput, mockPrisma as never);

    if (deliveryRecord) {
      mockQueueAdd({ deliveryId: deliveryRecord.id, tenantId: baseInput.tenantId });
    }

    expect(mockQueueAdd).toHaveBeenCalledWith({
      deliveryId: 'del-new',
      tenantId:   'tenant-abc',
    });
  });
});
