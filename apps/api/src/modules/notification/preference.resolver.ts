/**
 * PREFERENCE RESOLVER
 * ──────────────────────────────────────────────────────────────────────────────
 * Event bazlı kanal enable/disable ve reminder offset resolve eder.
 * Öncelik: customer-specific > tenant-specific > platform default
 *
 * KURAL: Heuristik karar YASAK — policy açık tanımlı ve deterministik.
 * ──────────────────────────────────────────────────────────────────────────────
 */

import { Injectable, Logger } from '@nestjs/common';
import { PreferenceScope, NotificationChannel } from '@prisma/client';
import { PrismaService }                         from '../../common/prisma.service';

/** Çözümlenmiş kanal tercihleri */
export interface ResolvedPreference {
  smsEnabled:            boolean;
  emailEnabled:          boolean;
  pushEnabled:           boolean;
  reminderOffsetMinutes: number;
  enabledChannels:       NotificationChannel[];
}

/** Platform varsayılan tercih (DB'de kayıt yoksa) */
const PLATFORM_DEFAULTS: ResolvedPreference = {
  smsEnabled:            true,
  emailEnabled:          true,
  pushEnabled:           false,
  reminderOffsetMinutes: 120,
  enabledChannels:       ['SMS', 'EMAIL'],
};

@Injectable()
export class PreferenceResolver {
  private readonly logger = new Logger(PreferenceResolver.name);

  constructor(private readonly prisma: PrismaService) {}

  /**
   * Event için aktif kanalları ve tercihleri çöz.
   *
   * @param tenantId     Tenant UUID
   * @param eventName    "booking.created" | "booking.reminder.due" | ...
   * @param scopeId      Customer/Staff UUID (opsiyonel — customer preference için)
   * @param scopeType    TENANT | CUSTOMER | STAFF
   */
  async resolve(
    tenantId:  string,
    eventName: string,
    scopeId?:  string,
    scopeType: PreferenceScope = 'TENANT',
  ): Promise<ResolvedPreference> {
    // Customer/Staff preference önce
    if (scopeId && scopeType !== 'TENANT') {
      const specific = await this.prisma.notificationPreference.findUnique({
        where: {
          tenantId_scopeType_scopeId_eventName: {
            tenantId,
            scopeType,
            scopeId,
            eventName,
          },
        },
      });

      if (specific) {
        return this.buildResult(specific);
      }
    }

    // Tenant preference fallback
    const tenantPref = await this.prisma.notificationPreference.findUnique({
      where: {
        tenantId_scopeType_scopeId_eventName: {
          tenantId,
          scopeType: 'TENANT',
          scopeId:   tenantId, // Tenant preference'da scopeId = tenantId
          eventName,
        },
      },
    });

    if (tenantPref) {
      return this.buildResult(tenantPref);
    }

    // Platform default
    this.logger.debug(
      `[PreferenceResolver] Preference bulunamadı, platform default kullanılıyor: ` +
      `tenantId=${tenantId} eventName=${eventName}`,
    );
    return { ...PLATFORM_DEFAULTS };
  }

  private buildResult(
    pref: {
      smsEnabled:            boolean;
      emailEnabled:          boolean;
      pushEnabled:           boolean;
      reminderOffsetMinutes: number;
    },
  ): ResolvedPreference {
    const enabledChannels: NotificationChannel[] = [];
    if (pref.smsEnabled)   enabledChannels.push('SMS');
    if (pref.emailEnabled) enabledChannels.push('EMAIL');
    if (pref.pushEnabled)  enabledChannels.push('PUSH');

    return {
      smsEnabled:            pref.smsEnabled,
      emailEnabled:          pref.emailEnabled,
      pushEnabled:           pref.pushEnabled,
      reminderOffsetMinutes: pref.reminderOffsetMinutes,
      enabledChannels,
    };
  }
}
