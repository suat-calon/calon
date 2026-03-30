/**
 * OUTBOX LISTENER SERVICE
 * ──────────────────────────────────────────────────────────────────────────────
 * PostgreSQL LISTEN/NOTIFY ile event_outbox INSERT'lerini anlık dinler.
 *
 * Akış:
 *   INSERT event_outbox (status=PENDING, scheduledFor <= NOW)
 *     → trg_notify_outbox_pending tetiklenir
 *     → pg_notify('outbox_pending_event', '{"eventId":"...","tenantId":"..."}')
 *     → Bu servis payload'ı parse eder
 *     → dispatchQueue.add('dispatch', ...) — idempotent jobId
 *
 * Neden native pg ve Prisma değil?
 *   Prisma PostgreSQL LISTEN/NOTIFY'ı desteklemez.
 *   LISTEN komutu kalıcı bir bağlantı gerektirir; connection pool ile uyumsuz.
 *
 * Reconnect politikası:
 *   Bağlantı koptuğunda exponential backoff ile yeniden bağlan.
 *   Max backoff: 30 saniye. Her başarılı bağlantıda sıfırla.
 *
 * Güvenlik:
 *   Payload sadece routing içerir (eventId + tenantId).
 *   Tam event verisi OutboxRepository üzerinden çekilir (DispatcherProcessor).
 * ──────────────────────────────────────────────────────────────────────────────
 */

import {
  Injectable,
  Logger,
  OnModuleInit,
  OnModuleDestroy,
} from '@nestjs/common';
import { InjectQueue } from '@nestjs/bull';
import { Queue }       from 'bull';
import { Client }      from 'pg';

import { QUEUE_NAMES } from '../../common/queue/queue-names';

/** pg_notify payload şeması */
interface OutboxNotifyPayload {
  eventId:  string;
  tenantId: string;
}

/** Reconnect için üstel geri çekilme sabitleri */
const RECONNECT_INITIAL_MS = 500;
const RECONNECT_MAX_MS      = 30_000;
const RECONNECT_MULTIPLIER  = 2;

@Injectable()
export class OutboxListenerService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(OutboxListenerService.name);

  /** Dedicated LISTEN bağlantısı — pool'a dahil değil */
  private client: Client | null = null;
  private destroyed  = false;
  private reconnectMs = RECONNECT_INITIAL_MS;

  constructor(
    @InjectQueue(QUEUE_NAMES.EVENT_DISPATCH)
    private readonly dispatchQueue: Queue,
  ) {}

  async onModuleInit(): Promise<void> {
    await this.connect();
  }

  async onModuleDestroy(): Promise<void> {
    this.destroyed = true;
    await this.disconnect();
  }

  // ──────────────────────────────────────────────────────────────────────────
  // Private: bağlantı yönetimi
  // ──────────────────────────────────────────────────────────────────────────

  private async connect(): Promise<void> {
    if (this.destroyed) return;

    const connectionString = process.env['DATABASE_URL'];
    if (!connectionString) {
      this.logger.error('[OutboxListener] DATABASE_URL tanımlı değil, LISTEN başlatılamadı');
      return;
    }

    this.client = new Client({
      connectionString,
      keepAlive:             true,
      keepAliveInitialDelayMillis: 10_000, // Neon idle ECONNRESET koruması
    });

    this.client.on('error', (err: Error) => {
      this.logger.error(`[OutboxListener] pg hatası: ${err.message}`);
      // 'end' event'i de tetiklenecek; orada reconnect başlatılır
    });

    this.client.on('end', () => {
      if (this.destroyed) return;
      this.logger.warn('[OutboxListener] Bağlantı kapandı, yeniden bağlanılıyor…');
      this.scheduleReconnect();
    });

    try {
      await this.client.connect();
      await this.client.query('LISTEN outbox_pending_event');

      // Başarılı bağlantıda backoff sıfırla
      this.reconnectMs = RECONNECT_INITIAL_MS;

      this.client.on('notification', (msg) => {
        if (msg.channel === 'outbox_pending_event' && msg.payload) {
          this.handleNotification(msg.payload).catch((err: Error) =>
            this.logger.error(`[OutboxListener] handleNotification hatası: ${err.message}`),
          );
        }
      });

      this.logger.log('[OutboxListener] LISTEN outbox_pending_event — hazır');
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err);
      this.logger.error(`[OutboxListener] Bağlantı kurulamadı: ${message}`);
      this.scheduleReconnect();
    }
  }

  private async disconnect(): Promise<void> {
    if (!this.client) return;
    try {
      await this.client.end();
    } catch {
      // Sessizce yut — zaten kapanıyoruz
    } finally {
      this.client = null;
    }
  }

  private scheduleReconnect(): void {
    if (this.destroyed) return;

    const delay = this.reconnectMs;
    this.reconnectMs = Math.min(
      this.reconnectMs * RECONNECT_MULTIPLIER,
      RECONNECT_MAX_MS,
    );

    this.logger.log(`[OutboxListener] ${delay}ms sonra yeniden bağlanılacak`);
    this.client = null; // eski referansı temizle

    setTimeout(() => {
      if (!this.destroyed) this.connect();
    }, delay);
  }

  // ──────────────────────────────────────────────────────────────────────────
  // Private: bildirim işleme
  // ──────────────────────────────────────────────────────────────────────────

  private async handleNotification(raw: string): Promise<void> {
    let payload: OutboxNotifyPayload;

    try {
      payload = JSON.parse(raw) as OutboxNotifyPayload;
    } catch {
      this.logger.warn(`[OutboxListener] Geçersiz payload, atlandı: ${raw}`);
      return;
    }

    const { eventId, tenantId } = payload;
    if (!eventId || !tenantId) {
      this.logger.warn(`[OutboxListener] Eksik alan: ${raw}`);
      return;
    }

    await this.dispatchQueue.add(
      'dispatch',
      { eventId, tenantId },
      {
        jobId:            `dispatch:${eventId}`, // idempotent: aynı event iki kez queue'ya girmez
        attempts:         1,
        removeOnComplete: 200,
        removeOnFail:     100,
      },
    );

    this.logger.debug(
      `[OutboxListener] → dispatch:${eventId} (tenant=${tenantId})`,
    );
  }
}
