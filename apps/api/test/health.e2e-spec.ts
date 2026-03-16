/**
 * ═══════════════════════════════════════════════════════════════════════════
 * P9 — HEALTH ENDPOINT E2E TEST SUITİ
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * /ready ve /version endpoint kontrolü.
 *
 * CALISTIRMA:
 *   yarn workspace @calon/api jest \
 *     --config jest-e2e.config.js --testPathPattern=health --forceExit
 * ═══════════════════════════════════════════════════════════════════════════
 */

// ── Ortam değişkenleri ─────────────────────────────────────────────────────
const TEST_DB_URL =
  process.env['TEST_DATABASE_URL'] ??
  'postgresql://calon_app:calon_app_dev_secret@localhost:5432/calon_dev';

process.env['DATABASE_URL']      = TEST_DB_URL;
process.env['JWT_SECRET']        = 'health-e2e-test-secret-32chars!!';
process.env['NODE_ENV']          = 'development';
process.env['REDIS_HOST']        = 'localhost';
process.env['REDIS_PORT']        = '6379';
process.env['REDIS_PASSWORD']    = '';
process.env['IYZICO_SECRET_KEY'] = 'test-iyzico-secret-key-min10chars';
process.env['IYZICO_API_KEY']    = 'test-iyzico-api-key-min10chars';

import { Test, TestingModule }              from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import supertest                            = require('supertest');

import { AppModule } from '../src/app.module';

const request = supertest;

describe('Health Endpoints (e2e)', () => {
  let app: INestApplication;

  beforeAll(async () => {
    const moduleRef: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleRef.createNestApplication();
    app.setGlobalPrefix('api/v1', { exclude: ['metrics'] });
    app.useGlobalPipes(new ValidationPipe({ whitelist: true, transform: true }));
    await app.init();
  });

  afterAll(async () => {
    await app.close();
  });

  // ── Test 1: /health (mevcut) ──────────────────────────────────────────────
  it('GET /api/v1/health → 200 { status: ok }', async () => {
    const res = await request(app.getHttpServer())
      .get('/api/v1/health')
      .expect(200);

    expect(res.body).toMatchObject({ status: 'ok', service: 'calon-api' });
    expect(res.body.timestamp).toBeDefined();
  });

  // ── Test 2: /health/ready → 200 veya 503 ─────────────────────────────────
  it('GET /api/v1/health/ready → 200 veya 503, checks yapısı mevcut', async () => {
    const res = await request(app.getHttpServer())
      .get('/api/v1/health/ready');

    // 200 (ready) veya 503 (degraded) — her ikisi de geçerli
    expect([200, 503]).toContain(res.status);

    // Response yapısı
    expect(res.body).toHaveProperty('status');
    expect(['ready', 'degraded']).toContain(res.body.status);

    expect(res.body).toHaveProperty('checks');
    expect(res.body.checks).toHaveProperty('database');
    expect(res.body.checks).toHaveProperty('redis');

    expect(res.body.checks.database).toHaveProperty('status');
    expect(res.body.checks.database).toHaveProperty('latencyMs');
    expect(typeof res.body.checks.database.latencyMs).toBe('number');

    expect(res.body.checks.redis).toHaveProperty('status');
    expect(res.body.checks.redis).toHaveProperty('latencyMs');
    expect(typeof res.body.checks.redis.latencyMs).toBe('number');

    expect(res.body).toHaveProperty('timestamp');
  });

  // ── Test 3: /health/ready status ile HTTP kodu tutarlı mı ─────────────────
  it('GET /api/v1/health/ready → status=ready ise HTTP 200, degraded ise 503', async () => {
    const res = await request(app.getHttpServer())
      .get('/api/v1/health/ready');

    if (res.body.status === 'ready') {
      expect(res.status).toBe(200);
    } else {
      expect(res.status).toBe(503);
    }
  });

  // ── Test 4: /health/version ───────────────────────────────────────────────
  it('GET /api/v1/health/version → 200, version alanları mevcut', async () => {
    const res = await request(app.getHttpServer())
      .get('/api/v1/health/version')
      .expect(200);

    expect(res.body).toHaveProperty('version');
    expect(res.body).toHaveProperty('commit');
    expect(res.body).toHaveProperty('buildTime');
    expect(res.body).toHaveProperty('nodeVersion');
    expect(res.body).toHaveProperty('environment');

    // commit ve buildTime 'unknown' veya gerçek değer olabilir
    expect(typeof res.body.commit).toBe('string');
    expect(typeof res.body.buildTime).toBe('string');
    expect(res.body.nodeVersion).toMatch(/^v\d+\./);
  });
});
