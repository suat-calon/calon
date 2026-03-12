/**
 * TEST 1: Delivery Idempotency
 * ──────────────────────────────────────────────────────────────────────────────
 * createIdempotentInTx, UNIQUE constraint (P2002) üzerinde çift kayıt oluşturmaz.
 *
 * Kapsam:
 *   - P2002 hatası → null döner (sessiz)
 *   - Farklı hata → fırlatılır
 *   - Başarılı kayıt → delivery nesnesi döner
 * ──────────────────────────────────────────────────────────────────────────────
 */

import { Logger } from '@nestjs/common';
import { DeliveryRepository, CreateDeliveryInput } from './delivery.repository';

// ── Prisma mock ──────────────────────────────────────────────────────────────

const mockPrisma = {
  eventDelivery: {
    create:     jest.fn(),
    update:     jest.fn(),
    findUnique: jest.fn(),
    findMany:   jest.fn(),
    count:      jest.fn(),
  },
  notificationUsage: {
    upsert: jest.fn(),
  },
};

// ── Test kurulum ─────────────────────────────────────────────────────────────

function makeRepo(): DeliveryRepository {
  const repo = new DeliveryRepository(mockPrisma as never);
  // Logger'ı sustur
  jest.spyOn(Logger.prototype, 'debug').mockImplementation(() => undefined);
  return repo;
}

const baseInput: CreateDeliveryInput = {
  tenantId:        'tenant-1',
  eventId:         'event-1',
  channel:         'SMS',
  recipient:       '+905001234567',
  templateKey:     'booking.created.sms.v1',
  templateVersion: 1,
  locale:          'tr',
  idempotencyKey:  'booking.created:event-1:sms:+905001234567:v1',
  payload:         { body: 'Test mesajı' },
};

// ── Test suite ───────────────────────────────────────────────────────────────

describe('DeliveryRepository.createIdempotentInTx — Idempotency', () => {
  beforeEach(() => jest.clearAllMocks());

  it('başarılı INSERT → delivery kaydı döner', async () => {
    const record = { id: 'delivery-uuid-1' };
    mockPrisma.eventDelivery.create.mockResolvedValueOnce(record);

    const repo = makeRepo();
    const tx   = mockPrisma as never;
    const result = await repo.createIdempotentInTx(baseInput, tx);

    expect(result).toEqual(record);
    expect(mockPrisma.eventDelivery.create).toHaveBeenCalledTimes(1);
  });

  it('P2002 (duplicate) → null döner, hata fırlatılmaz', async () => {
    const p2002 = Object.assign(new Error('Unique constraint failed'), { code: 'P2002' });
    mockPrisma.eventDelivery.create.mockRejectedValueOnce(p2002);

    const repo   = makeRepo();
    const tx     = mockPrisma as never;
    const result = await repo.createIdempotentInTx(baseInput, tx);

    expect(result).toBeNull();
    expect(mockPrisma.eventDelivery.create).toHaveBeenCalledTimes(1);
  });

  it('P2002 dışı hata → fırlatılır', async () => {
    const dbErr = Object.assign(new Error('Connection lost'), { code: 'P1001' });
    mockPrisma.eventDelivery.create.mockRejectedValueOnce(dbErr);

    const repo = makeRepo();
    const tx   = mockPrisma as never;

    await expect(repo.createIdempotentInTx(baseInput, tx)).rejects.toThrow('Connection lost');
  });

  it('farklı kanallar için ayrı kayıt oluşturulabilir', async () => {
    const record1 = { id: 'delivery-sms' };
    const record2 = { id: 'delivery-email' };
    mockPrisma.eventDelivery.create
      .mockResolvedValueOnce(record1)
      .mockResolvedValueOnce(record2);

    const repo = makeRepo();
    const tx   = mockPrisma as never;

    const r1 = await repo.createIdempotentInTx({ ...baseInput, channel: 'SMS',   idempotencyKey: 'k1' }, tx);
    const r2 = await repo.createIdempotentInTx({ ...baseInput, channel: 'EMAIL', idempotencyKey: 'k2' }, tx);

    expect(r1?.id).toBe('delivery-sms');
    expect(r2?.id).toBe('delivery-email');
    expect(mockPrisma.eventDelivery.create).toHaveBeenCalledTimes(2);
  });
});
