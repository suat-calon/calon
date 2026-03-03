/**
 * FAILED JOB SERVICE — Dead Letter Queue (DLQ) Persistence
 * ──────────────────────────────────────────────────────────────────────────────
 * Bull kuyruğundaki kalıcı başarısız job'ları (tüm retry'lar tükendikten sonra)
 * PostgreSQL'e kaydeder.
 *
 * Kullanım:
 *   Processor'daki @OnQueueFailed handler → job.attemptsMade === maxAttempts
 *   → FailedJobService.save() çağırır.
 * ──────────────────────────────────────────────────────────────────────────────
 */

import { Injectable, Logger } from '@nestjs/common';
import { Prisma }              from '@prisma/client';
import { PrismaService }       from '../prisma.service';

export interface SaveFailedJobParams {
  queueName: string;
  jobName:   string;
  jobId:     string;
  jobData:   Record<string, unknown>;
  errorMsg:  string;
  attempts:  number;
  tenantId?: string;
}

@Injectable()
export class FailedJobService {
  private readonly logger = new Logger(FailedJobService.name);

  constructor(private readonly prisma: PrismaService) {}

  /**
   * Kalıcı başarısız job'u DLQ tablosuna kaydeder.
   * Hata olursa yutulur (DLQ kaydı, asıl hatanın üstüne ekstra hata üretmemeli).
   */
  async save(params: SaveFailedJobParams): Promise<void> {
    try {
      await this.prisma.failedJob.create({
        data: {
          queueName: params.queueName,
          jobName:   params.jobName,
          jobId:     params.jobId,
          jobData:   params.jobData as Prisma.InputJsonValue,
          errorMsg:  params.errorMsg,
          attempts:  params.attempts,
          tenantId:  params.tenantId ?? null,
        },
      });

      this.logger.warn(
        `[DLQ] Job kalıcı olarak başarısız — kaydedildi: ` +
        `queue=${params.queueName} job=${params.jobName} id=${params.jobId} ` +
        `attempts=${params.attempts}`,
      );
    } catch (err) {
      // DLQ persist hatası sistem hatası değil — sadece log'la
      this.logger.error(
        `[DLQ] Kayıt hatası: ${String(err)} | ` +
        `queue=${params.queueName} job=${params.jobId}`,
      );
    }
  }
}
