/**
 * PaymentService (finance) — AuditLog transaction safety
 * ────────────────────────────────────────────────────────
 * Doğrulama hedefleri (Bug #1 fix):
 *   1. takeDeposit: auditLog.create tx istemcisi üzerinden çağrılır (this.prisma değil)
 *   2. checkout:    auditLog.create tx istemcisi üzerinden çağrılır
 *   3. takeDeposit: tx içinde hata → tüm çağrılar atılır (rollback path)
 *
 * Teknik not:
 *   withTenantTransaction mock'u txContext.run ile sarılır; bu sayede
 *   getActiveTxClient(prisma) → txStub döner (fallback değil).
 *   auditLog.create'in txStub'da çağrıldığı doğrulanır.
 */

import { Test }                 from '@nestjs/testing';
import { BadRequestException, NotFoundException } from '@nestjs/common';
import { AppointmentStatus }    from '@calon/database';
import { getQueueToken }        from '@nestjs/bull';

import { PaymentService }       from './payment.service';
import { PrismaService }        from '../../common/prisma.service';
import { LedgerService }        from './ledger.service';
import { PAYMENT_REPO }         from './payment.repository.interface';
import { txContext }             from '../../common/tx.context';
import { QUEUE_NAMES }          from '../../common/redis.module';

// ── Sabitler ──────────────────────────────────────────────────────────────────

const TENANT_ID = 'aaaaaaaa-0000-0000-0000-000000000001';
const APPT_ID   = 'bbbbbbbb-0000-0000-0000-000000000001';

const MOCK_APPT = {
  id:          APPT_ID,
  tenantId:    TENANT_ID,
  status:      AppointmentStatus.PENDING,
  isDeleted:   false,
  depositPaid: null,
  totalPrice:  null,
};

// ── Builder ───────────────────────────────────────────────────────────────────

async function buildModule(overrides: {
  findAppointmentById?: jest.Mock;
  updateAppointmentDeposit?: jest.Mock;
  checkoutAppointment?: jest.Mock;
  ledgerRecord?: jest.Mock;
}) {
  const txStub = {
    auditLog: { create: jest.fn().mockResolvedValue({}) },
  };

  // withTenantTransaction mock: fn() içinde txContext set edilir
  // getActiveTxClient(prisma) → txStub döner (not this.prisma)
  const withTenantTransaction = jest.fn().mockImplementation(
    (fn: () => Promise<unknown>) => txContext.run({ tx: txStub as any }, fn),
  );

  const prismaStub = { withTenantTransaction };

  const paymentRepoStub = {
    findAppointmentById:      overrides.findAppointmentById      ?? jest.fn().mockResolvedValue(MOCK_APPT),
    updateAppointmentDeposit: overrides.updateAppointmentDeposit ?? jest.fn().mockResolvedValue(MOCK_APPT),
    checkoutAppointment:      overrides.checkoutAppointment      ?? jest.fn().mockResolvedValue({ ...MOCK_APPT, status: AppointmentStatus.COMPLETED }),
  };

  const ledgerSpy = overrides.ledgerRecord ?? jest.fn().mockResolvedValue({ id: 'ledger-1' });

  const mod = await Test.createTestingModule({
    providers: [
      PaymentService,
      { provide: PrismaService,  useValue: prismaStub },
      { provide: LedgerService,  useValue: { record: ledgerSpy } },
      { provide: PAYMENT_REPO,   useValue: paymentRepoStub },
      { provide: getQueueToken(QUEUE_NAMES.STOCK_DEDUCT), useValue: { add: jest.fn() } },
    ],
  }).compile();

  return {
    svc:        mod.get(PaymentService),
    txStub,
    ledgerSpy,
    paymentRepoStub,
    prismaStub,
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// Suite 1 — takeDeposit: auditLog tx safety
// ─────────────────────────────────────────────────────────────────────────────

describe('PaymentService — takeDeposit: auditLog tx safety (Bug #1)', () => {

  it('auditLog.create tx istemcisi (txStub) üzerinden çağrılır, this.prisma değil', async () => {
    const { svc, txStub, prismaStub } = await buildModule({});

    await svc.takeDeposit(TENANT_ID, APPT_ID, { amount: 100 });

    expect(txStub.auditLog.create).toHaveBeenCalledTimes(1);
    // prismaStub'ın doğrudan auditLog özelliği yoktur — çağrılırsa test hata verir
    expect((prismaStub as any).auditLog).toBeUndefined();
  });

  it('auditLog.create "DEPOSIT_TAKEN" action ile çağrılır', async () => {
    const { svc, txStub } = await buildModule({});

    await svc.takeDeposit(TENANT_ID, APPT_ID, { amount: 200 });

    expect(txStub.auditLog.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ action: 'DEPOSIT_TAKEN' }),
      }),
    );
  });

  it('updateAppointmentDeposit hata fırlatırsa → takeDeposit hata fırlatır, auditLog çağrılmaz', async () => {
    const { svc, txStub } = await buildModule({
      updateAppointmentDeposit: jest.fn().mockRejectedValue(new Error('DB bağlantı hatası')),
    });

    await expect(
      svc.takeDeposit(TENANT_ID, APPT_ID, { amount: 100 }),
    ).rejects.toThrow('DB bağlantı hatası');

    // auditLog, updateAppointmentDeposit'ten SONRA çağrılır — hata varsa ulaşılmaz
    expect(txStub.auditLog.create).not.toHaveBeenCalled();
  });

  it('randevu bulunamazsa → NotFoundException, ledger çağrılmaz', async () => {
    const { svc, ledgerSpy } = await buildModule({
      findAppointmentById: jest.fn().mockResolvedValue(null),
    });

    await expect(
      svc.takeDeposit(TENANT_ID, APPT_ID, { amount: 100 }),
    ).rejects.toBeInstanceOf(NotFoundException);

    expect(ledgerSpy).not.toHaveBeenCalled();
  });

  it('kapalı randevu (COMPLETED) → BadRequestException, ledger çağrılmaz', async () => {
    const { svc, ledgerSpy } = await buildModule({
      findAppointmentById: jest.fn().mockResolvedValue({
        ...MOCK_APPT, status: AppointmentStatus.COMPLETED,
      }),
    });

    await expect(
      svc.takeDeposit(TENANT_ID, APPT_ID, { amount: 100 }),
    ).rejects.toBeInstanceOf(BadRequestException);

    expect(ledgerSpy).not.toHaveBeenCalled();
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Suite 2 — Ledger failure → transaction rolls back, auditLog not persisted
// ─────────────────────────────────────────────────────────────────────────────

describe('PaymentService — takeDeposit: ledger failure rollback', () => {

  it('ledger.record hata fırlatırsa → takeDeposit hata fırlatır', async () => {
    const { svc } = await buildModule({
      ledgerRecord: jest.fn().mockRejectedValue(new Error('ledger DB hatası')),
    });

    await expect(
      svc.takeDeposit(TENANT_ID, APPT_ID, { amount: 100 }),
    ).rejects.toThrow('ledger DB hatası');
  });

  it('ledger.record hata fırlatırsa → auditLog.create çağrılmaz', async () => {
    const { svc, txStub } = await buildModule({
      ledgerRecord: jest.fn().mockRejectedValue(new Error('ledger hatası')),
    });

    await expect(
      svc.takeDeposit(TENANT_ID, APPT_ID, { amount: 100 }),
    ).rejects.toThrow();

    // ledger.record (step 3) auditLog.create'ten (step 5) önce gelir
    // → ledger hata verince auditLog'a asla ulaşılmaz
    expect(txStub.auditLog.create).not.toHaveBeenCalled();
  });

  it('ledger.record hata fırlatırsa → updateAppointmentDeposit çağrılmaz', async () => {
    const updateSpy = jest.fn().mockResolvedValue(MOCK_APPT);
    const { svc } = await buildModule({
      ledgerRecord:             jest.fn().mockRejectedValue(new Error('ledger hatası')),
      updateAppointmentDeposit: updateSpy,
    });

    await expect(
      svc.takeDeposit(TENANT_ID, APPT_ID, { amount: 100 }),
    ).rejects.toThrow();

    expect(updateSpy).not.toHaveBeenCalled();
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Suite 3 — Partial transaction: step-by-step atomicity
// ─────────────────────────────────────────────────────────────────────────────

describe('PaymentService — takeDeposit: partial transaction atomicity', () => {

  it('step 3 (ledger) başarılı, step 4 (deposit update) hata → step 5 (auditLog) çağrılmaz', async () => {
    const { svc, txStub } = await buildModule({
      updateAppointmentDeposit: jest.fn().mockRejectedValue(new Error('deposit update hatası')),
    });

    await expect(
      svc.takeDeposit(TENANT_ID, APPT_ID, { amount: 100 }),
    ).rejects.toThrow('deposit update hatası');

    expect(txStub.auditLog.create).not.toHaveBeenCalled();
  });

  it('step 5 (auditLog) hata fırlatırsa → takeDeposit hata döner', async () => {
    const { svc, txStub } = await buildModule({});
    txStub.auditLog.create.mockRejectedValue(new Error('auditLog yazma hatası'));

    await expect(
      svc.takeDeposit(TENANT_ID, APPT_ID, { amount: 100 }),
    ).rejects.toThrow('auditLog yazma hatası');
  });

  it('tüm adımlar başarılı → takeDeposit { appointment, ledgerEntry } döner', async () => {
    const { svc } = await buildModule({});

    const result = await svc.takeDeposit(TENANT_ID, APPT_ID, { amount: 150 });

    expect(result).toHaveProperty('appointment');
    expect(result).toHaveProperty('ledgerEntry');
  });

  it('checkout: step 3 (ledger) hata → auditLog ve checkoutAppointment çağrılmaz', async () => {
    const checkoutSpy = jest.fn();
    const { svc, txStub } = await buildModule({
      findAppointmentById: jest.fn().mockResolvedValue({
        ...MOCK_APPT, status: AppointmentStatus.IN_SERVICE,
      }),
      checkoutAppointment: checkoutSpy,
      ledgerRecord:        jest.fn().mockRejectedValue(new Error('ledger yazma hatası')),
    });

    await expect(
      svc.checkout(TENANT_ID, APPT_ID, { amount: 500, paymentMethod: 'PAYMENT_CASH' }),
    ).rejects.toThrow('ledger yazma hatası');

    expect(checkoutSpy).not.toHaveBeenCalled();
    expect(txStub.auditLog.create).not.toHaveBeenCalled();
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Suite 4 — checkout: auditLog tx safety
// ─────────────────────────────────────────────────────────────────────────────

describe('PaymentService — checkout: auditLog tx safety (Bug #1 — Suite 4)', () => {

  it('auditLog.create tx istemcisi (txStub) üzerinden çağrılır', async () => {
    const { svc, txStub } = await buildModule({
      findAppointmentById: jest.fn().mockResolvedValue({
        ...MOCK_APPT, status: AppointmentStatus.IN_SERVICE,
      }),
    });

    await svc.checkout(TENANT_ID, APPT_ID, { amount: 500, paymentMethod: 'PAYMENT_CASH' });

    expect(txStub.auditLog.create).toHaveBeenCalledTimes(1);
    expect(txStub.auditLog.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ action: AppointmentStatus.COMPLETED }),
      }),
    );
  });

  it('checkoutAppointment hata fırlatırsa → checkout hata fırlatır, auditLog çağrılmaz', async () => {
    const { svc, txStub } = await buildModule({
      findAppointmentById: jest.fn().mockResolvedValue({
        ...MOCK_APPT, status: AppointmentStatus.IN_SERVICE,
      }),
      checkoutAppointment: jest.fn().mockRejectedValue(new Error('constraint violation')),
    });

    await expect(
      svc.checkout(TENANT_ID, APPT_ID, { amount: 500, paymentMethod: 'PAYMENT_CASH' }),
    ).rejects.toThrow('constraint violation');

    expect(txStub.auditLog.create).not.toHaveBeenCalled();
  });
});
