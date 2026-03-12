/**
 * Rate Limiting — Integration Tests  (MVP-EXIT-GATE §2)
 * ──────────────────────────────────────────────────────────────────────────────
 * Doğrulama hedefleri:
 *   1. /holds limiti (3/10s) → 4. istek 429 alır
 *   2. /book  limiti (2/10s) → 3. istek 429 alır
 *   3. @Throttle olmayan endpoint → 100/60s defaultla hiç 429 almaz
 *
 * Tasarım kararları:
 *   - Gerçek PublicController yerine ayrı RateLimitTestController kullanılır.
 *     Sebebi: public.controller.ts'deki HOLDS_LIMIT / BOOK_LIMIT sabitleri
 *             modül yükleme anında process.env okunarak belirlenir;
 *             test sırasında override edilemez.
 *   - Her suite kendi bağımsız Nest uygulamasını başlatır (fresh in-memory storage).
 *     Böylece bir suite'in sayacı diğerini etkilemez.
 *   - Throttler storage: in-memory (testlerde Redis gerekmez).
 *     Redis-backed storage'ın üretim entegrasyonu app.module.ts'de
 *     RedisThrottlerStorage ile ayrıca sağlanır.
 * ──────────────────────────────────────────────────────────────────────────────
 */

import {
  Controller,
  HttpCode,
  INestApplication,
  Post,
}                                          from '@nestjs/common';
import { APP_GUARD }                       from '@nestjs/core';
import { Test, TestingModule }             from '@nestjs/testing';
import { Throttle, ThrottlerGuard, ThrottlerModule } from '@nestjs/throttler';
import request                             from 'supertest';

// ── Test Controller ───────────────────────────────────────────────────────────
// Küçük limit değerleri → testlerde hızlıca sınıra ulaşılır

@Controller('__rl')
class RateLimitTestController {
  /** holds: 3 istek / 10 saniye */
  @Post('holds')
  @HttpCode(201)
  @Throttle({ default: { limit: 3, ttl: 10_000 } })
  holds(): { ok: true } { return { ok: true }; }

  /** book: 2 istek / 10 saniye */
  @Post('book')
  @HttpCode(201)
  @Throttle({ default: { limit: 2, ttl: 10_000 } })
  book(): { ok: true } { return { ok: true }; }

  /** throttle olmayan serbest endpoint (default: 100/60s) */
  @Post('free')
  @HttpCode(201)
  free(): { ok: true } { return { ok: true }; }
}

// ── Factory ───────────────────────────────────────────────────────────────────

async function buildTestApp(): Promise<{ app: INestApplication; http: ReturnType<INestApplication['getHttpServer']> }> {
  const moduleRef: TestingModule = await Test.createTestingModule({
    imports: [
      // In-memory throttler storage (testler için Redis gerekmez)
      ThrottlerModule.forRoot([{ name: 'default', limit: 100, ttl: 60_000 }]),
    ],
    controllers: [RateLimitTestController],
    providers: [
      // ThrottlerGuard'ı tüm endpoint'lere global olarak uygula
      { provide: APP_GUARD, useClass: ThrottlerGuard },
    ],
  }).compile();

  const app = moduleRef.createNestApplication();
  await app.init();

  return { app, http: app.getHttpServer() };
}

// ─────────────────────────────────────────────────────────────────────────────
// Suite 1 — /holds (limit = 3 / 10s)
// ─────────────────────────────────────────────────────────────────────────────

describe('Rate Limiting — POST /__rl/holds (limit=3)', () => {
  let app: INestApplication;
  let http: ReturnType<INestApplication['getHttpServer']>;

  beforeAll(async () => {
    ({ app, http } = await buildTestApp());
  });

  afterAll(async () => {
    await app.close();
  });

  it('ilk 3 istek HTTP 201 → 4. istek HTTP 429 (too many requests)', async () => {
    // İzin verilen istekler
    for (let i = 0; i < 3; i++) {
      await request(http)
        .post('/__rl/holds')
        .expect(201)
        .expect({ ok: true });
    }

    // Sınır aşıldı → 429
    await request(http)
      .post('/__rl/holds')
      .expect(429);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Suite 2 — /book (limit = 2 / 10s)
// ─────────────────────────────────────────────────────────────────────────────

describe('Rate Limiting — POST /__rl/book (limit=2)', () => {
  let app: INestApplication;
  let http: ReturnType<INestApplication['getHttpServer']>;

  beforeAll(async () => {
    ({ app, http } = await buildTestApp());
  });

  afterAll(async () => {
    await app.close();
  });

  it('ilk 2 istek HTTP 201 → 3. istek HTTP 429 (too many requests)', async () => {
    for (let i = 0; i < 2; i++) {
      await request(http)
        .post('/__rl/book')
        .expect(201)
        .expect({ ok: true });
    }

    await request(http)
      .post('/__rl/book')
      .expect(429);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Suite 3 — Serbest endpoint (default: 100 / 60s)
// ─────────────────────────────────────────────────────────────────────────────

describe('Rate Limiting — POST /__rl/free (@Throttle yok, default limit=100)', () => {
  let app: INestApplication;
  let http: ReturnType<INestApplication['getHttpServer']>;

  beforeAll(async () => {
    ({ app, http } = await buildTestApp());
  });

  afterAll(async () => {
    await app.close();
  });

  it('10 ardışık istek hepsi HTTP 201 alır (default limit aşılmaz)', async () => {
    for (let i = 0; i < 10; i++) {
      await request(http)
        .post('/__rl/free')
        .expect(201)
        .expect({ ok: true });
    }
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Suite 4 — Cross-endpoint izolasyonu
// ─────────────────────────────────────────────────────────────────────────────

describe('Rate Limiting — Cross-endpoint izolasyonu', () => {
  let app: INestApplication;
  let http: ReturnType<INestApplication['getHttpServer']>;

  beforeAll(async () => {
    ({ app, http } = await buildTestApp());
  });

  afterAll(async () => {
    await app.close();
  });

  it('/holds dolması /book sayacını etkilemez', async () => {
    // /holds limitini doldur
    for (let i = 0; i < 3; i++) {
      await request(http).post('/__rl/holds').expect(201);
    }
    await request(http).post('/__rl/holds').expect(429); // 4. istek → 429

    // /book sayacı bağımsız → hâlâ 2 istek yapılabilir
    for (let i = 0; i < 2; i++) {
      await request(http).post('/__rl/book').expect(201);
    }
    await request(http).post('/__rl/book').expect(429); // 3. istek → 429
  });
});
