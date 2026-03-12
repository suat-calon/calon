/**
 * TEMPLATE RESOLVER
 * ──────────────────────────────────────────────────────────────────────────────
 * Kanal + event + locale + tenant kombinasyonu için en uygun template'i bulur.
 * Öncelik: tenant-specific > global (null tenantId)
 * Hardcoded template kaosu YASAKTIR.
 *
 * Render: Mustache-benzeri {{variableName}} interpolasyonu.
 * ──────────────────────────────────────────────────────────────────────────────
 */

import { Injectable, Logger } from '@nestjs/common';
import { NotificationChannel }       from '@prisma/client';
import { PrismaService }             from '../../common/prisma.service';

export interface ResolvedTemplate {
  templateKey:     string;
  templateVersion: number;
  providerHint?:   string;
  subject?:        string; // email için
  body:            string; // render edilmiş body
}

@Injectable()
export class TemplateResolver {
  private readonly logger = new Logger(TemplateResolver.name);

  constructor(private readonly prisma: PrismaService) {}

  /**
   * Template resolve et ve render et.
   * Tenant-specific template yoksa global default kullanılır.
   *
   * @param tenantId   Tenant UUID
   * @param eventName  "booking.created" gibi
   * @param channel    SMS | EMAIL | PUSH
   * @param locale     "tr" | "en"
   * @param variables  Template değişkenleri
   */
  async resolveAndRender(
    tenantId:  string,
    eventName: string,
    channel:   NotificationChannel,
    locale:    string,
    variables: Record<string, string>,
  ): Promise<ResolvedTemplate | null> {
    // Tenant-specific template önce, sonra global fallback
    const template = await this.prisma.notificationTemplate.findFirst({
      where: {
        channel,
        eventName,
        locale,
        isActive: true,
        OR: [
          { tenantId },
          { tenantId: null },
        ],
      },
      orderBy: [
        // Tenant-specific önce (null tenantId → sona)
        { tenantId: { sort: 'desc', nulls: 'last' } },
        { version:  'desc' },
      ],
    });

    if (!template) {
      this.logger.warn(
        `[TemplateResolver] Template bulunamadı: ` +
        `eventName=${eventName} channel=${channel} locale=${locale} tenantId=${tenantId}`,
      );
      return null;
    }

    const renderedBody = this.interpolate(template.bodyTemplate, variables);
    const renderedSubject = template.subjectTemplate
      ? this.interpolate(template.subjectTemplate, variables)
      : undefined;

    return {
      templateKey:     template.templateKey,
      templateVersion: template.version,
      providerHint:    template.providerHint ?? undefined,
      subject:         renderedSubject,
      body:            renderedBody,
    };
  }

  /**
   * Basit {{key}} interpolasyonu.
   * Bilinmeyen değişkenler boş string bırakılır (güvenli fallback).
   */
  private interpolate(
    template:  string,
    variables: Record<string, string>,
  ): string {
    return template.replace(
      /\{\{(\w+)\}\}/g,
      (_, key: string) => variables[key] ?? '',
    );
  }
}
