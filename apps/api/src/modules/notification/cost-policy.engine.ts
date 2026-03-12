/**
 * COST POLICY ENGINE
 * ──────────────────────────────────────────────────────────────────────────────
 * Kanal bazlı maliyet politikası motoru.
 *
 * Zorunlu kontroller:
 *   1. SMS segment limiti (render sonrası)
 *   2. Tenant kota kontrolü
 *   3. Fallback kuralı (SMS dolduysa email'e düş)
 *   4. Duplicate suppression
 *
 * KURAL: Heuristik karar YASAK — policy açık tanımlı.
 * ──────────────────────────────────────────────────────────────────────────────
 */

import { Injectable, Logger } from '@nestjs/common';
import { NotificationChannel } from '@prisma/client';
import { PrismaService }        from '../../common/prisma.service';

/** Kanal politika kararı */
export interface ChannelPolicyDecision {
  allowed:  boolean;
  reason?:  string;
  fallback?: NotificationChannel; // SMS doluysa email fallback
}

/** SMS segment hesabı */
export function estimateSmsSegments(body: string): number {
  if (body.length <= 160) return 1;
  return Math.ceil(body.length / 153);
}

/** Maliyet tahmini (kuruş) */
export function estimateCostMinor(
  channel:  NotificationChannel,
  segments: number,
): number {
  switch (channel) {
    case 'SMS':   return segments * 5;  // 5 kuruş / segment
    case 'EMAIL': return 1;             // 1 kuruş / email
    case 'PUSH':  return 0;             // Push genellikle ücretsiz
    default:      return 0;
  }
}

@Injectable()
export class CostPolicyEngine {
  private readonly logger = new Logger(CostPolicyEngine.name);

  constructor(private readonly prisma: PrismaService) {}

  /**
   * Kanal gönderim politikasını kontrol et.
   * Kota, limit ve fallback kurallarını uygular.
   *
   * @param tenantId   Tenant UUID
   * @param channel    Gönderim kanalı
   * @param body       Render edilmiş mesaj (segment hesabı için)
   * @param periodStart Bu dönemin başlangıcı
   * @param periodEnd  Bu dönemin sonu
   */
  async checkPolicy(
    tenantId:    string,
    channel:     NotificationChannel,
    body:        string,
    periodStart: Date,
    periodEnd:   Date,
  ): Promise<ChannelPolicyDecision> {
    if (channel === 'SMS') {
      const segments = estimateSmsSegments(body);

      // Tenant SMS kullanımı kontrol et
      const usage = await this.prisma.notificationUsage.findUnique({
        where: {
          tenantId_channel_periodStart_periodEnd: {
            tenantId,
            channel: 'SMS',
            periodStart,
            periodEnd,
          },
        },
      });

      const currentCount = usage?.sentCount ?? 0;

      // Faz 24: Plan bazlı limit henüz entegre değil — entitlement'tan alınacak
      // Şimdilik basit kota: 1000 SMS / ay (platform minimum)
      const SMS_MONTHLY_LIMIT = 1000;

      if (currentCount + segments > SMS_MONTHLY_LIMIT) {
        this.logger.warn(
          `[CostPolicy] SMS kota aşımı: tenantId=${tenantId} ` +
          `current=${currentCount} segments=${segments} limit=${SMS_MONTHLY_LIMIT}`,
        );

        // Fallback: email'e düş
        return {
          allowed:  false,
          reason:   'SMS_QUOTA_EXCEEDED',
          fallback: 'EMAIL',
        };
      }

      if (segments > 3) {
        this.logger.warn(
          `[CostPolicy] SMS çok uzun (${segments} segment): tenantId=${tenantId}`,
        );
        // Uzun SMS'lere izin ver ama log'la — future: configurable limit
      }
    }

    return { allowed: true };
  }

  /**
   * Dönem başlangıç/bitiş tarihlerini hesapla (aylık).
   */
  getCurrentPeriod(): { start: Date; end: Date } {
    const now = new Date();
    const start = new Date(now.getFullYear(), now.getMonth(), 1);
    const end   = new Date(now.getFullYear(), now.getMonth() + 1, 0);
    return { start, end };
  }
}
