/**
 * REFERRAL PROCESSOR — Faz 18: Viral Growth Engine
 * ──────────────────────────────────────────────────────────────────────────────
 * Queue: REFERRAL_PROCESS ('referral-process')
 * Job:   'process-referral'
 *
 * Akış:
 *   1. referralCode ile aynı tenant'ta referrer müşteriyi bul
 *   2. Fraud shield: self-referral engelle (referrer === referred)
 *   3. Referral kaydını P2002-güvenli oluştur (@@unique[referrer, referred])
 *   4. LoyaltyService.earnFromReferral() ile 50 puan ver
 *
 * Hata yönetimi:
 *   • P2002 → sessizce geç (zaten işlendi — idempotent)
 *   • Diğer hatalar → BullMQ 3 kez retry, ardından DLQ (FailedJob)
 * ──────────────────────────────────────────────────────────────────────────────
 */

import { Processor, Process, OnQueueFailed } from '@nestjs/bull';
import { Logger }                             from '@nestjs/common';
import { Job }                                from 'bull';
import { Prisma }                             from '@prisma/client';

import { PrismaService }                 from '../../common/prisma.service';
import { tenantContext }                 from '../../common/tenant.context';
import { QUEUE_NAMES }                   from '../../common/queue/queue-names';
import { FailedJobService }              from '../../common/queue/failed-job.service';
import { LoyaltyService }               from '../loyalty/loyalty.service';
import { type ReferralJobPayload }      from './public.service';

// ── Sabitler ──────────────────────────────────────────────────────────────────
const REFERRAL_POINTS = 50;

// ── Yardımcı ──────────────────────────────────────────────────────────────────
function isUniqueViolation(err: unknown): boolean {
  return (
    err instanceof Prisma.PrismaClientKnownRequestError &&
    err.code === 'P2002'
  );
}

// ── Processor ─────────────────────────────────────────────────────────────────

@Processor(QUEUE_NAMES.REFERRAL_PROCESS)
export class ReferralProcessor {
  private readonly logger = new Logger(ReferralProcessor.name);

  constructor(
    private readonly prisma:      PrismaService,
    private readonly loyalty:     LoyaltyService,
    private readonly failedJobs:  FailedJobService,
  ) {}

  @Process('process-referral')
  async handleProcessReferral(job: Job<ReferralJobPayload>): Promise<void> {
    const { tenantId, referredCustomerId, referralCode, appointmentId } = job.data;

    this.logger.debug(
      `[Referral] İşleniyor: appt=${appointmentId} | code=${referralCode}`,
    );

    // ── 1. Referrer'ı aynı tenant içinde bul ────────────────────────────────
    // tenantId filtresi: cross-tenant referral engellenir
    const referrer = await new Promise<{ id: string } | null>((resolve, reject) => {
      tenantContext.run(
        { tenantId, userId: 'referral-processor', userRole: 'PUBLIC' },
        () =>
          this.prisma.customer
            .findFirst({
              where:  { referralCode, tenantId, isDeleted: false },
              select: { id: true },
            })
            .then(resolve)
            .catch(reject),
      );
    });

    if (!referrer) {
      this.logger.warn(`[Referral] Geçersiz referral kodu: ${referralCode}`);
      return; // Sessizce bitir — retry gerekmez
    }

    // ── 2. Fraud shield: self-referral engelle ──────────────────────────────
    if (referrer.id === referredCustomerId) {
      this.logger.warn(
        `[Referral] Self-referral engellendi: customerId=${referredCustomerId}`,
      );
      return;
    }

    // ── 3. Referral kaydı oluştur (P2002 = idempotent, sessiz) ─────────────
    let referralId: string;

    try {
      const referral = await new Promise<{ id: string }>((resolve, reject) => {
        tenantContext.run(
          { tenantId, userId: 'referral-processor', userRole: 'PUBLIC' },
          () =>
            this.prisma.referral
              .create({
                data: {
                  tenantId,
                  referrerCustomerId: referrer.id,
                  referredCustomerId,
                  appointmentId,
                  awardedPoints: REFERRAL_POINTS,
                },
                select: { id: true },
              })
              .then(resolve)
              .catch(reject),
        );
      });

      referralId = referral.id;
    } catch (err) {
      if (isUniqueViolation(err)) {
        this.logger.debug(
          `[Referral] Zaten işlendi (P2002): referrer=${referrer.id} → referred=${referredCustomerId}`,
        );
        return;
      }
      throw err;
    }

    // ── 4. Referrer'a loyalty puanı ver ─────────────────────────────────────
    await this.loyalty.earnFromReferral({
      tenantId,
      customerId:     referrer.id,
      referralId,
      points:         REFERRAL_POINTS,
      idempotencyKey: `referral:${referralId}`,
    });

    this.logger.log(
      `[Referral] ✓ ${REFERRAL_POINTS} puan verildi | referrerId=${referrer.id} | referralId=${referralId}`,
    );
  }

  @OnQueueFailed()
  async onFailed(job: Job<ReferralJobPayload>, err: Error): Promise<void> {
    this.logger.error(
      `[Referral] Job başarısız: jobId=${job.id} | ${err.message}`,
      err.stack,
    );

    await this.failedJobs.save({
      tenantId:  job.data.tenantId,
      queueName: QUEUE_NAMES.REFERRAL_PROCESS,
      jobName:   job.name,
      jobId:     String(job.id),
      jobData:   job.data as unknown as Record<string, unknown>,
      errorMsg:  err.message,
      attempts:  job.attemptsMade,
    });
  }
}
