/**
 * TEST 2 & 3: DeliveryRepository.claimForProcessing — Atomik Claim
 * ──────────────────────────────────────────────────────────────────────────────
 * Test 2: PROCESSING durumundaki delivery → claimForProcessing null döner.
 * Test 3: DELIVERED (terminal) durumundaki delivery → claimForProcessing null döner.
 *
 * Mekanizma: SQL WHERE status IN ('PENDING','FAILED') — diğer durumlar eşleşmez,
 * RETURNING boş döner, method null döndürür.
 *
 * Ayrıca:
 *   - Başarılı claim → ClaimedDelivery döner (attempts artırılmış)
 *   - deliveryId → SQL parametresi olarak geçer
 * ──────────────────────────────────────────────────────────────────────────────
 */

import { Logger }             from '@nestjs/common';
import { DeliveryRepository } from './delivery.repository';

// ── Prisma mock ───────────────────────────────────────────────────────────────

const mockPrisma = {
  eventDelivery: {
    create:     jest.fn(),
    update:     jest.fn(),
    findUnique: jest.fn(),
    findMany:   jest.fn(),
    count:      jest.fn(),
  },
  notificationUsage: { upsert: jest.fn() },
  $queryRaw: jest.fn(),
};

// ── Yardımcı: claimed row fabrikası ──────────────────────────────────────────

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
    id:                'delivery-1',
    tenantId:          'tenant-1',
    eventId:           'event-1',
    channel:           'SMS',
    recipient:         '+905001234567',
    payload:           { body: 'Test mesajı' },
    idempotencyKey:    'booking.created:event-1:sms:+905:v1',
    costEstimateMinor: 5,
    attempts:          1, // artırılmış
    ...overrides,
  };
}

// ── Test kurulum ──────────────────────────────────────────────────────────────

function makeRepo(): DeliveryRepository {
  const repo = new DeliveryRepository(mockPrisma as never);
  jest.spyOn(Logger.prototype, 'debug').mockImplementation(() => undefined);
  return repo;
}

// ── Test suite ────────────────────────────────────────────────────────────────

describe('DeliveryRepository.claimForProcessing — Atomik Claim', () => {
  beforeEach(() => jest.clearAllMocks());

  // ── Başarılı claim ───────────────────────────────────────────────────────

  it('PENDING/FAILED → başarılı claim: ClaimedDelivery döner', async () => {
    const row = makeClaimedRow({ attempts: 1 });
    mockPrisma.$queryRaw.mockResolvedValueOnce([row]);

    const repo   = makeRepo();
    const result = await repo.claimForProcessing('delivery-1');

    expect(result).not.toBeNull();
    expect(result?.id).toBe('delivery-1');
    expect(result?.attempts).toBe(1); // SQL tarafından artırılmış
    expect(result?.channel).toBe('SMS');
    expect(mockPrisma.$queryRaw).toHaveBeenCalledTimes(1);
  });

  it('claim başarılı → attempts değeri SQL tarafından artırılmış gelir', async () => {
    // 2. deneme: attempts başlangıçta 1, SQL +1 → 2 döner
    const row = makeClaimedRow({ attempts: 2 });
    mockPrisma.$queryRaw.mockResolvedValueOnce([row]);

    const repo   = makeRepo();
    const result = await repo.claimForProcessing('delivery-1');

    expect(result?.attempts).toBe(2);
  });

  // ── TEST 2: PROCESSING durumu → null ────────────────────────────────────

  describe('Test 2: PROCESSING durumu → claimForProcessing null döner', () => {
    it(
      'PROCESSING delivery → SQL WHERE status IN (PENDING,FAILED) eşleşmez → null',
      async () => {
        // Delivery PROCESSING durumunda; SQL UPDATE hiçbir satır güncellemez
        mockPrisma.$queryRaw.mockResolvedValueOnce([]); // boş RETURNING

        const repo   = makeRepo();
        const result = await repo.claimForProcessing('delivery-processing');

        expect(result).toBeNull();
        expect(mockPrisma.$queryRaw).toHaveBeenCalledTimes(1);
      },
    );
  });

  // ── TEST 3: Terminal durum (DELIVERED/SENT/CANCELLED/PERMANENT_FAILURE) ──

  describe('Test 3: Terminal durum → claimForProcessing null döner', () => {
    it(
      'DELIVERED delivery → SQL eşleşmez → null',
      async () => {
        mockPrisma.$queryRaw.mockResolvedValueOnce([]); // boş RETURNING

        const repo   = makeRepo();
        const result = await repo.claimForProcessing('delivery-delivered');

        expect(result).toBeNull();
      },
    );

    it(
      'SENT delivery → null',
      async () => {
        mockPrisma.$queryRaw.mockResolvedValueOnce([]);

        const repo   = makeRepo();
        const result = await repo.claimForProcessing('delivery-sent');

        expect(result).toBeNull();
      },
    );

    it(
      'PERMANENT_FAILURE delivery → null',
      async () => {
        mockPrisma.$queryRaw.mockResolvedValueOnce([]);

        const repo   = makeRepo();
        const result = await repo.claimForProcessing('delivery-perm-fail');

        expect(result).toBeNull();
      },
    );

    it(
      'CANCELLED delivery → null',
      async () => {
        mockPrisma.$queryRaw.mockResolvedValueOnce([]);

        const repo   = makeRepo();
        const result = await repo.claimForProcessing('delivery-cancelled');

        expect(result).toBeNull();
      },
    );
  });

  // ── SQL parametresi doğrulama ────────────────────────────────────────────

  it('claimForProcessing deliveryId\'yi SQL parametresi olarak geçer', async () => {
    mockPrisma.$queryRaw.mockResolvedValueOnce([]);

    const repo = makeRepo();
    await repo.claimForProcessing('specific-uuid-123');

    // $queryRaw tagged template olarak çağrıldı: ilk arg string array, sonraki parametre deliveryId
    const callArgs = mockPrisma.$queryRaw.mock.calls[0];
    // Tagged template: callArgs[0] = TemplateStringsArray, callArgs[1] = deliveryId
    expect(callArgs[1]).toBe('specific-uuid-123');
  });
});
