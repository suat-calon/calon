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
 * Neden DATABASE_DIRECT_URL?
 *   LISTEN/NOTIFY, PgBouncer transaction-mode pooler ile UYUMSUZDUR.
 *   Neon pooler (`-pooler` host) bağlantıları multipleks eder ve LISTEN
 *   subscription'larını sessizce kaybeder → periyodik ECONNRESET.
 *   Bu servis Neon direct endpoint'e bağlanır (session-aware, persistent).
 *   Yoksa DATABASE_URL'den `-pooler` suffix'ini otomatik çıkarır.
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

/** ConnTrace log prefix — tüm bağlantı olaylarında kaynak tespiti için */
const TAG = '[ConnTrace][OutboxListener]';

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
  // Private: bağlantı URL çözümleme
  // ──────────────────────────────────────────────────────────────────────────

  /**
   * LISTEN/NOTIFY için direct (non-pooler) connection string döndürür.
   *
   * Öncelik:
   *   1. DATABASE_DIRECT_URL (açıkça tanımlı direct endpoint)
   *   2. DATABASE_URL'den `-pooler` suffix'ini otomatik çıkar
   *   3. DATABASE_URL olduğu gibi (pooler değilse)
   *
   * Neon pooler hostname pattern: `ep-xxx-pooler.region.neon.tech`
   * Neon direct hostname pattern: `ep-xxx.region.neon.tech`
   */
  private resolveDirectUrl(): string | null {
    // Tercih 1: Açıkça tanımlı direct URL
    const directUrl = process.env['DATABASE_DIRECT_URL'];
    if (directUrl) {
      this.logger.log(`${TAG} DATABASE_DIRECT_URL kullanılıyor (direct endpoint)`);
      return directUrl;
    }

    const rawUrl = process.env['DATABASE_URL'];
    if (!rawUrl) return null;

    // Tercih 2: Pooler hostname'den `-pooler` suffix'ini çıkar
    if (rawUrl.includes('-pooler')) {
      const derived = rawUrl.replace(/-pooler(?=\.)/, '');
      this.logger.warn(
        `${TAG} DATABASE_DIRECT_URL tanımlı değil — DATABASE_URL'den pooler suffix çıkarıldı (auto-derive)`,
      );
      return derived;
    }

    // Tercih 3: URL zaten direct endpoint
    return rawUrl;
  }

  // ──────────────────────────────────────────────────────────────────────────
  // Private: bağlantı yönetimi
  // ──────────────────────────────────────────────────────────────────────────

  private async connect(): Promise<void> {
    if (this.destroyed) return;

    const rawUrl = this.resolveDirectUrl();
    if (!rawUrl) {
      this.logger.error(`${TAG} DATABASE_URL tanımlı değil, LISTEN başlatılamadı`);
      return;
    }

    // Normalize sslmode=require → sslmode=verify-full to suppress pg-connection-string
    // deprecation warning. This does NOT change behavior — pg already treats 'require'
    // as 'verify-full'. Making it explicit silences the warning.
    const connectionString = rawUrl.replace(
      /([?&])sslmode=require(?=&|$)/,
      '$1sslmode=verify-full',
    );

    this.client = new Client({
      connectionString,
      keepAlive:             true,
      keepAliveInitialDelayMillis: 10_000, // Neon idle ECONNRESET koruması
    });

    // ── Lifecycle event logging (ConnTrace) ────────────────────────────────
    // Tüm bağlantı olaylarını prefix ile logla → ECONNRESET kaynağı görünür olsun.
    this.client.on('error', (err: Error) => {
      const code = (err as NodeJS.ErrnoException).code;
      if (code === 'ECONNRESET' || code === 'ETIMEDOUT') {
        this.logger.warn(`${TAG} error: ${code} — reconnect bekliyor`);
      } else {
        this.logger.error(`${TAG} error: ${err.message}`);
      }
    });

    this.client.on('end', () => {
      this.logger.warn(`${TAG} end — bağlantı kapandı`);
      if (this.destroyed) return;
      this.scheduleReconnect();
    });

    try {
      await this.client.connect();

      // ── Socket-level error suppression ──────────────────────────────────
      // pg.Client iç yapısında `connection.stream` raw TCP socket'tir.
      // Bu socket'e error handler eklenmezse Node.js unhandled error olarak
      // stderr'e yazar (prefix'siz `Error: read ECONNRESET` çıktısı).
      // Client 'error' event'i zaten yukarıda handle edildiği için burada
      // sadece log prefix ile gösterip asıl handling'i client event'e bırakıyoruz.
      //
      // pg 8.x iç yapı: Client → Connection → stream (net.Socket)
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const pgAny = this.client as any;
      const conn   = pgAny?.connection;
      const stream = conn?.stream as NodeJS.EventEmitter | undefined;
      if (stream && typeof stream.on === 'function') {
        stream.on('error', (err: Error) => {
          const code = (err as NodeJS.ErrnoException).code ?? 'UNKNOWN';
          this.logger.warn(`${TAG} stream-error: ${code} (client handler'a delege edildi)`);
        });
      } else {
        this.logger.warn(`${TAG} stream referansı bulunamadı — raw socket errors stderr'e düşebilir`);
      }

      await this.client.query('LISTEN outbox_pending_event');

      // Başarılı bağlantıda backoff sıfırla
      this.reconnectMs = RECONNECT_INITIAL_MS;

      this.client.on('notification', (msg) => {
        if (msg.channel === 'outbox_pending_event' && msg.payload) {
          this.handleNotification(msg.payload).catch((err: Error) =>
            this.logger.error(`${TAG} handleNotification hatası: ${err.message}`),
          );
        }
      });

      this.logger.log(`${TAG} LISTEN outbox_pending_event — hazır (direct endpoint)`);
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err);
      this.logger.error(`${TAG} Bağlantı kurulamadı: ${message}`);
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

    this.logger.log(`${TAG} reconnect: ${delay}ms sonra yeniden bağlanılacak`);
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
      this.logger.warn(`${TAG} Geçersiz payload, atlandı: ${raw}`);
      return;
    }

    const { eventId, tenantId } = payload;
    if (!eventId || !tenantId) {
      this.logger.warn(`${TAG} Eksik alan: ${raw}`);
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
