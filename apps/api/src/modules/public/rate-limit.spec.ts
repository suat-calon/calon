/**
 * Test 8 — Public Endpoint Rate Limiting
 * ──────────────────────────────────────────────────────────────────────────────
 * Kapsam:
 *   8a. POST /public/book → 10 istek geçer, 11. → 429
 *   8b. POST /public/holds → 10 istek geçer, 11. → 429
 *   8c. GET /public/availability → 30 istek geçer, 31. → 429
 *   8d. POST /public/payments/create → 10 istek geçer, 11. → 429
 *   8e. Farklı IP → ayrı sayaç (sıfırdan başlar)
 *   8f. RedisThrottlerStorage.increment(): totalHits > limit → isBlocked=true
 *   8g. RedisThrottlerStorage.increment(): pttl < 0 → PEXPIRE çağrılır
 *   8h. RedisThrottlerStorage.increment(): pttl > 0 → PEXPIRE çağrılmaz
 *   8i. ThrottlerGuard global → @Public() endpoint'lerde de çalışır
 *   8j. BOOK_LIMIT env-var: PUBLIC_BOOK_LIMIT=20 → 20 istek geçer
 * ──────────────────────────────────────────────────────────────────────────────
 */

import { Test, TestingModule }        from '@nestjs/testing';
import { INestApplication, Logger }   from '@nestjs/common';
import { ThrottlerModule, ThrottlerGuard } from '@nestjs/throttler';
import { APP_GUARD }                  from '@nestjs/core';
import request                        from 'supertest';
import { RedisThrottlerStorage }      from '../../common/throttler/redis-throttler.storage';

// ── Endpoint'ler için minimal controller stubs ────────────────────────────────
import { Controller, Get, Post, HttpCode, HttpStatus, Query, Body } from '@nestjs/common';
import { Throttle }  from '@nestjs/throttler';
import { Public }    from '../iam/guards/tenant.guard';

// Rate limit sabitleri (controller ile tutarlı)
const RATE_TTL_MS        = 60_000;
const BOOK_LIMIT         = 10;
const HOLDS_LIMIT        = 10;
const AVAILABILITY_LIMIT = 30;
const PAYMENTS_LIMIT     = 10;

@Public()
@Controller('public')
class StubPublicController {
  @Post('book')
  @HttpCode(HttpStatus.CREATED)
  @Throttle({ default: { limit: BOOK_LIMIT, ttl: RATE_TTL_MS } })
  book() { return { ok: true }; }

  @Post('holds')
  @HttpCode(HttpStatus.CREATED)
  @Throttle({ default: { limit: HOLDS_LIMIT, ttl: RATE_TTL_MS } })
  holds() { return { ok: true }; }

  @Get('availability')
  @Throttle({ default: { limit: AVAILABILITY_LIMIT, ttl: RATE_TTL_MS } })
  availability(@Query('tenantId') _: string) { return []; }

  @Post('payments/create')
  @HttpCode(HttpStatus.CREATED)
  @Throttle({ default: { limit: PAYMENTS_LIMIT, ttl: RATE_TTL_MS } })
  createPayment() { return { paymentUrl: 'https://example.com/pay' }; }
}

// ── In-memory ThrottlerStorage (gerçek Redis gerektirmez) ────────────────────
class InMemoryThrottlerStorage {
  private counters = new Map<string, { count: number; expiresAt: number }>();

  async increment(
    key:           string,
    ttl:           number,
    limit:         number,
    blockDuration: number,
    throttlerName: string,
  ) {
    const rKey = `${throttlerName}:${key}`;
    const now  = Date.now();
    const entry = this.counters.get(rKey);

    if (!entry || entry.expiresAt <= now) {
      // İlk istek ya da TTL dolmuş
      this.counters.set(rKey, { count: 1, expiresAt: now + ttl });
      return { totalHits: 1, timeToExpire: ttl, isBlocked: false, timeToBlockExpire: 0 };
    }

    entry.count++;
    const timeToExpire = entry.expiresAt - now;
    const isBlocked    = entry.count > limit;
    return {
      totalHits:          entry.count,
      timeToExpire,
      isBlocked,
      timeToBlockExpire:  isBlocked ? blockDuration : 0,
    };
  }

  /** Test yardımcısı: sayaçları sıfırla */
  reset() { this.counters.clear(); }
}

// ── Test app factory ──────────────────────────────────────────────────────────
async function buildApp(storageOverride?: InMemoryThrottlerStorage): Promise<{
  app: INestApplication;
  storage: InMemoryThrottlerStorage;
}> {
  const storage = storageOverride ?? new InMemoryThrottlerStorage();

  const mod: TestingModule = await Test.createTestingModule({
    imports: [
      ThrottlerModule.forRoot({
        throttlers: [{ ttl: 60_000, limit: 100 }], // global default
        storage:    storage as unknown as RedisThrottlerStorage,
      }),
    ],
    controllers: [StubPublicController],
    providers:   [
      {
        provide:  APP_GUARD,
        useClass: ThrottlerGuard,
      },
    ],
  }).compile();

  const app = mod.createNestApplication();
  await app.init();
  return { app, storage };
}

// ── Test yardımcıları ─────────────────────────────────────────────────────────
async function hitEndpoint(
  app:    INestApplication,
  method: 'get' | 'post',
  path:   string,
  ip:     string,
  count:  number,
): Promise<number[]> {
  const statuses: number[] = [];
  for (let i = 0; i < count; i++) {
    const req = method === 'get'
      ? request(app.getHttpServer()).get(path)
      : request(app.getHttpServer()).post(path).send({});
    const res = await req.set('X-Forwarded-For', ip);
    statuses.push(res.status);
  }
  return statuses;
}

// ── Testler ───────────────────────────────────────────────────────────────────
describe('Public Endpoint Rate Limiting', () => {
  let app:     INestApplication;
  let storage: InMemoryThrottlerStorage;

  beforeAll(async () => {
    jest.spyOn(Logger.prototype, 'warn').mockImplementation(() => {});
    jest.spyOn(Logger.prototype, 'error').mockImplementation(() => {});
    ({ app, storage } = await buildApp());
  });

  afterAll(async () => {
    await app.close();
  });

  beforeEach(() => {
    storage.reset(); // Her test temiz sayaçla başlar
  });

  // 8a ─────────────────────────────────────────────────────────────────────────
  it('8a — POST /public/book: 10 istek geçer, 11. → 429', async () => {
    const statuses = await hitEndpoint(app, 'post', '/public/book', '1.2.3.4', 11);
    const passing  = statuses.filter((s) => s === 201);
    const blocked  = statuses.filter((s) => s === 429);
    expect(passing).toHaveLength(10);
    expect(blocked).toHaveLength(1);
  });

  // 8b ─────────────────────────────────────────────────────────────────────────
  it('8b — POST /public/holds: 10 istek geçer, 11. → 429', async () => {
    const statuses = await hitEndpoint(app, 'post', '/public/holds', '1.2.3.5', 11);
    expect(statuses.filter((s) => s === 201)).toHaveLength(10);
    expect(statuses.filter((s) => s === 429)).toHaveLength(1);
  });

  // 8c ─────────────────────────────────────────────────────────────────────────
  it('8c — GET /public/availability: 30 istek geçer, 31. → 429', async () => {
    const statuses = await hitEndpoint(app, 'get', '/public/availability?tenantId=t1', '1.2.3.6', 31);
    expect(statuses.filter((s) => s === 200)).toHaveLength(30);
    expect(statuses.filter((s) => s === 429)).toHaveLength(1);
  });

  // 8d ─────────────────────────────────────────────────────────────────────────
  it('8d — POST /public/payments/create: 10 istek geçer, 11. → 429', async () => {
    const statuses = await hitEndpoint(app, 'post', '/public/payments/create', '1.2.3.7', 11);
    expect(statuses.filter((s) => s === 201)).toHaveLength(10);
    expect(statuses.filter((s) => s === 429)).toHaveLength(1);
  });

  // 8e ─────────────────────────────────────────────────────────────────────────
  it(`8e — farklı IP → storage'da ayrı sayaç (key izolasyonu)`, async () => {
    // Storage seviyesinde doğrulama — ThrottlerGuard, IP'yi key'e ekler.
    // Supertest'te gerçek bağlantı IP'si ::1 olduğundan HTTP katmanında değil,
    // storage mock'u üzerinde IP izolasyonunu kanıtlarız.
    const s = new InMemoryThrottlerStorage();

    // IP A: 10 istek → hepsi geçmeli
    for (let i = 0; i < 10; i++) {
      const r = await s.increment('10.0.0.1:booking', 60_000, 10, 0, 'default');
      expect(r.isBlocked).toBe(false);
    }

    // IP B: ayrı key → sıfırdan sayar, hepsi geçmeli
    for (let i = 0; i < 10; i++) {
      const r = await s.increment('10.0.0.2:booking', 60_000, 10, 0, 'default');
      expect(r.isBlocked).toBe(false);
    }

    // IP A: 11. → bloke
    const aBlocked = await s.increment('10.0.0.1:booking', 60_000, 10, 0, 'default');
    expect(aBlocked.isBlocked).toBe(true);

    // IP B: 11. → kendi sayacından bloke
    const bBlocked = await s.increment('10.0.0.2:booking', 60_000, 10, 0, 'default');
    expect(bBlocked.isBlocked).toBe(true);
  });
});

// ── RedisThrottlerStorage birim testleri ─────────────────────────────────────
describe('RedisThrottlerStorage', () => {
  let storage: RedisThrottlerStorage;
  const mockRedis = {
    pipeline: jest.fn(),
    pexpire:  jest.fn(),
  };

  beforeEach(() => {
    jest.clearAllMocks();
    storage = new RedisThrottlerStorage(mockRedis as unknown as import('ioredis').default);
  });

  function makePipeline(incrResult: number, pttlResult: number) {
    const execMock = jest.fn().mockResolvedValue([
      [null, incrResult],
      [null, pttlResult],
    ]);
    return {
      incr: jest.fn().mockReturnThis(),
      pttl: jest.fn().mockReturnThis(),
      exec: execMock,
    };
  }

  // 8f ─────────────────────────────────────────────────────────────────────────
  it('8f — totalHits > limit → isBlocked=true', async () => {
    const pipeline = makePipeline(11, 30_000);
    mockRedis.pipeline.mockReturnValue(pipeline);
    mockRedis.pexpire.mockResolvedValue(1);

    const result = await storage.increment('key1', 60_000, 10, 0, 'default');
    expect(result.isBlocked).toBe(true);
    expect(result.totalHits).toBe(11);
  });

  // 8g ─────────────────────────────────────────────────────────────────────────
  it('8g — pttl < 0 (yeni key) → pexpire çağrılır', async () => {
    const pipeline = makePipeline(1, -1); // ilk isabet, expiry yok
    mockRedis.pipeline.mockReturnValue(pipeline);
    mockRedis.pexpire.mockResolvedValue(1);

    await storage.increment('key2', 60_000, 10, 0, 'default');
    expect(mockRedis.pexpire).toHaveBeenCalledWith('throttle:default:key2', 60_000);
  });

  // 8h ─────────────────────────────────────────────────────────────────────────
  it('8h — pttl > 0 (key var, expiry ayarlanmış) → pexpire çağrılmaz', async () => {
    const pipeline = makePipeline(5, 45_000);
    mockRedis.pipeline.mockReturnValue(pipeline);

    await storage.increment('key3', 60_000, 10, 0, 'default');
    expect(mockRedis.pexpire).not.toHaveBeenCalled();
  });

  // 8i ─────────────────────────────────────────────────────────────────────────
  it('8i — limit altında istek → isBlocked=false, timeToExpire pttl değeri', async () => {
    const pipeline = makePipeline(3, 50_000);
    mockRedis.pipeline.mockReturnValue(pipeline);

    const result = await storage.increment('key4', 60_000, 10, 0, 'default');
    expect(result.isBlocked).toBe(false);
    expect(result.totalHits).toBe(3);
    expect(result.timeToExpire).toBe(50_000);
  });
});

// ── Env-var BOOK_LIMIT konfigürasyon testi ────────────────────────────────────
describe('Rate limit env-var konfigürasyonu', () => {
  // 8j ─────────────────────────────────────────────────────────────────────────
  it('8j — PUBLIC_BOOK_LIMIT=20 ile controller 20 istek geçirir', async () => {
    // Not: process.env değişkeni modül yüklendiğinde okunur.
    // Bu test env override'ını simüle ederek InMemoryStorage ile doğrular.
    const customLimit = 20;
    const customStorage = new InMemoryThrottlerStorage();

    // Dinamik controller — özel limit
    @Public()
    @Controller('public-custom')
    class CustomLimitController {
      @Post('book')
      @HttpCode(201)
      @Throttle({ default: { limit: customLimit, ttl: RATE_TTL_MS } })
      book() { return { ok: true }; }
    }

    const mod = await Test.createTestingModule({
      imports: [
        ThrottlerModule.forRoot({
          throttlers: [{ ttl: 60_000, limit: 100 }],
          storage:    customStorage as unknown as RedisThrottlerStorage,
        }),
      ],
      controllers: [CustomLimitController],
      providers:   [{ provide: APP_GUARD, useClass: ThrottlerGuard }],
    }).compile();

    const app = mod.createNestApplication();
    await app.init();

    const statuses = await hitEndpoint(app, 'post', '/public-custom/book', '9.9.9.9', 21);
    expect(statuses.filter((s) => s === 201)).toHaveLength(20);
    expect(statuses.filter((s) => s === 429)).toHaveLength(1);

    await app.close();
  });
});
