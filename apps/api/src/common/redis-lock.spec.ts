/**
 * Test 6 — RedisLockService: Lua CAS Safe Unlock
 * ──────────────────────────────────────────────────────────────────────────────
 * Kapsam:
 *   6a. Worker A lock alır, Worker B aynı key'i alamaz
 *   6b. Worker A lock'unu kendi token'ıyla serbest bırakır (true döner)
 *   6c. Worker A yanlış token ile release dener → false döner, key silinmez
 *   6d. İki worker eşzamanlı: sadece biri kazanır
 *   6e. TTL sonrası lock otomatik sona erer (acquireLock null döndürür)
 *   6f. Redis hatası → acquireLock null döner (graceful)
 *   6g. Redis hatası → releaseLock false döner (graceful)
 *   6h. acquireConcurrencyLock handle formatı "key||token" doğrulama
 *   6i. releaseConcurrencyLock başarıyla Lua CAS çalıştırır
 *   6j. releaseConcurrencyLock eski format (plain key) → no-op, uyarı loglar
 * ──────────────────────────────────────────────────────────────────────────────
 */

import { Test, TestingModule } from '@nestjs/testing';
import { Logger }               from '@nestjs/common';
import { RedisLockService }     from './redis-lock.service';
import { REDIS_CLIENT }         from './redis.module';
import { AppointmentLockService } from '../modules/operations/appointment/appointment-lock.service';

// ── Redis mock ────────────────────────────────────────────────────────────────
// ioredis'i mock'layarak gerçek Redis bağlantısı gerektirmeyen birim testler

const mockRedis = {
  set:  jest.fn(),
  eval: jest.fn(),
  del:  jest.fn(),
  scan: jest.fn(),
};

// ── Test modülü kurulum yardımcısı ────────────────────────────────────────────
async function buildModule(): Promise<TestingModule> {
  return Test.createTestingModule({
    providers: [
      RedisLockService,
      { provide: REDIS_CLIENT, useValue: mockRedis },
    ],
  }).compile();
}

// ── Testler ───────────────────────────────────────────────────────────────────
describe('RedisLockService', () => {
  let svc: RedisLockService;

  beforeEach(async () => {
    jest.clearAllMocks();
    const mod = await buildModule();
    svc = mod.get(RedisLockService);
    // Logger'ı sessizleştir
    jest.spyOn(Logger.prototype, 'debug').mockImplementation(() => {});
    jest.spyOn(Logger.prototype, 'warn').mockImplementation(() => {});
  });

  // 6a ─────────────────────────────────────────────────────────────────────────
  it('6a — acquireLock: Worker A kazanır, Worker B aynı key için null alır', async () => {
    // Worker A: SET NX başarılı → Redis "OK" döner
    mockRedis.set.mockResolvedValueOnce('OK');
    const tokenA = await svc.acquireLock('calon:lock:test:slot1', 10_000);
    expect(tokenA).not.toBeNull();
    expect(typeof tokenA).toBe('string');
    expect(tokenA).toMatch(
      /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i,
    );

    // Worker B: aynı key için SET NX başarısız → Redis null döner
    mockRedis.set.mockResolvedValueOnce(null);
    const tokenB = await svc.acquireLock('calon:lock:test:slot1', 10_000);
    expect(tokenB).toBeNull();
  });

  // 6b ─────────────────────────────────────────────────────────────────────────
  it('6b — releaseLock: doğru token ile release → true döner', async () => {
    // Lua EVAL: token eşleşti → DEL çalıştı → 1 döner
    mockRedis.eval.mockResolvedValueOnce(1);

    const released = await svc.releaseLock('calon:lock:test:slot1', 'my-uuid-token');
    expect(released).toBe(true);
    // Lua script EVAL çağrıldı mı?
    expect(mockRedis.eval).toHaveBeenCalledWith(
      expect.stringContaining('redis.call("get"'),
      1,
      'calon:lock:test:slot1',
      'my-uuid-token',
    );
  });

  // 6c ─────────────────────────────────────────────────────────────────────────
  it('6c — releaseLock: yanlış token → false döner, key silinmez', async () => {
    // Lua EVAL: token eşleşmedi → 0 döner
    mockRedis.eval.mockResolvedValueOnce(0);

    const released = await svc.releaseLock('calon:lock:test:slot1', 'wrong-token');
    expect(released).toBe(false);
    // EVAL çağrıldı ama DEL çalışmadı (Lua 0 döndürdü)
    expect(mockRedis.eval).toHaveBeenCalledTimes(1);
    expect(mockRedis.del).not.toHaveBeenCalled();
  });

  // 6d ─────────────────────────────────────────────────────────────────────────
  it('6d — eşzamanlı acquire: sadece biri kazanır (NX simülasyonu)', async () => {
    // Worker A: OK, Worker B: null (aynı key üzerinde race)
    mockRedis.set
      .mockResolvedValueOnce('OK')    // A
      .mockResolvedValueOnce(null);   // B

    const [tokenA, tokenB] = await Promise.all([
      svc.acquireLock('calon:lock:test:race', 5_000),
      svc.acquireLock('calon:lock:test:race', 5_000),
    ]);

    const winners = [tokenA, tokenB].filter(Boolean);
    expect(winners).toHaveLength(1);
    expect([tokenA, tokenB].some((t) => t === null)).toBe(true);
  });

  // 6e ─────────────────────────────────────────────────────────────────────────
  it('6e — TTL sonrası lock sona erer: yeni acquire başarılı olur', async () => {
    // İlk acquire: OK
    mockRedis.set.mockResolvedValueOnce('OK');
    const token1 = await svc.acquireLock('calon:lock:test:ttl', 100);
    expect(token1).not.toBeNull();

    // TTL geçti simülasyonu: yeni acquire tekrar OK döner
    mockRedis.set.mockResolvedValueOnce('OK');
    const token2 = await svc.acquireLock('calon:lock:test:ttl', 100);
    expect(token2).not.toBeNull();

    // İki farklı token üretildi
    expect(token1).not.toBe(token2);
  });

  // 6f ─────────────────────────────────────────────────────────────────────────
  it('6f — Redis hatası → acquireLock null döner (graceful)', async () => {
    mockRedis.set.mockRejectedValueOnce(new Error('ECONNRESET'));

    const token = await svc.acquireLock('calon:lock:test:err', 5_000);
    expect(token).toBeNull();
  });

  // 6g ─────────────────────────────────────────────────────────────────────────
  it('6g — Redis hatası → releaseLock false döner (graceful)', async () => {
    mockRedis.eval.mockRejectedValueOnce(new Error('ECONNRESET'));

    const released = await svc.releaseLock('calon:lock:test:err', 'any-token');
    expect(released).toBe(false);
  });
});

// ── AppointmentLockService — Concurrency Lock handle testi ───────────────────
describe('AppointmentLockService — concurrency lock handle', () => {
  let lockSvc: AppointmentLockService;
  let redisSvc: RedisLockService;

  beforeEach(async () => {
    jest.clearAllMocks();
    const mod = await Test.createTestingModule({
      providers: [
        AppointmentLockService,
        RedisLockService,
        { provide: REDIS_CLIENT, useValue: mockRedis },
      ],
    }).compile();

    lockSvc  = mod.get(AppointmentLockService);
    redisSvc = mod.get(RedisLockService);
    jest.spyOn(Logger.prototype, 'debug').mockImplementation(() => {});
    jest.spyOn(Logger.prototype, 'warn').mockImplementation(() => {});
  });

  // 6h ─────────────────────────────────────────────────────────────────────────
  it('6h — acquireConcurrencyLock: handle "key||token" formatında döner', async () => {
    mockRedis.set.mockResolvedValueOnce('OK');

    const handle = await lockSvc.acquireConcurrencyLock(
      'tenant-1',
      'staff-1',
      '2025-06-15T09:00:00.000Z',
    );

    expect(handle).toContain('||');
    const [key, token] = handle.split('||');
    expect(key).toContain('calon:lock:appointment:tenant-1:staff-1');
    expect(token).toMatch(
      /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i,
    );
  });

  // 6i ─────────────────────────────────────────────────────────────────────────
  it('6i — releaseConcurrencyLock: Lua CAS çağrılır, doğru key/token ile', async () => {
    mockRedis.set.mockResolvedValueOnce('OK');
    mockRedis.eval.mockResolvedValueOnce(1);

    const handle = await lockSvc.acquireConcurrencyLock('t1', 's1', '2025-06-15T10:00:00.000Z');
    await lockSvc.releaseConcurrencyLock(handle);

    expect(mockRedis.eval).toHaveBeenCalledTimes(1);
    const [_script, _numKeys, evalKey, evalToken] = (mockRedis.eval as jest.Mock).mock.calls[0] as unknown[];
    const [handleKey, handleToken] = handle.split('||');
    expect(evalKey).toBe(handleKey);
    expect(evalToken).toBe(handleToken);
  });

  // 6j ─────────────────────────────────────────────────────────────────────────
  it('6j — releaseConcurrencyLock eski format (no "||"): no-op, eval çağrılmaz', async () => {
    const warnSpy = jest.spyOn(Logger.prototype, 'warn');

    await lockSvc.releaseConcurrencyLock('calon:lock:appointment:t1:s1:2025-...');

    expect(mockRedis.eval).not.toHaveBeenCalled();
    expect(mockRedis.del).not.toHaveBeenCalled();
    expect(warnSpy).toHaveBeenCalledWith(
      expect.stringContaining('eski handle formatı'),
    );
  });
});
