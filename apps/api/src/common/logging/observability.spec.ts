/**
 * OBSERVABILITY TEST SUITE — FAZ MVP-EXIT-FINAL+
 * ──────────────────────────────────────────────────────────────────────────────
 * §4  Trust Proxy
 * §5  Structured logging (CorrelationMiddleware)
 * §6  X-Request-Id header propagation
 * §7  Queue metrics (QueueMetricsService)
 * §8  Availability abuse guard (AvailabilityAbuseGuard)
 * §8b Availability Redis cache (PublicService.getAvailability)
 * §9a PrometheusService.observeRequest counter / histogram
 * §9b PrometheusService.incLockFailure counter
 * §9c PrometheusService.incRateLimitRejection counter
 * §9d PrometheusService.incArchiveBatch counter
 * §9e PrometheusService.queueJobsActive gauge
 * ──────────────────────────────────────────────────────────────────────────────
 */

import { Test, TestingModule } from '@nestjs/testing';
import { ExecutionContext }    from '@nestjs/common';
import { randomUUID }          from 'crypto';

import { PrometheusService }        from './prometheus.service';
import { MetricsService }           from './metrics.service';
import { CorrelationStore, getCorrelationId } from './correlation.store';
import { AvailabilityAbuseGuard }   from '../../modules/public/guards/availability-abuse.guard';
import { QueueMetricsService }      from '../queue/queue-metrics.service';
import { REDIS_CLIENT }             from '../redis.module';

// ─────────────────────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────────────────────

function makeExecutionContext(overrides: {
  ip?: string;
  staffId?: string;
  date?: string;
  statusCode?: number;
}): ExecutionContext {
  const req: Record<string, unknown> = {
    ip:     overrides.ip ?? '1.2.3.4',
    socket: { remoteAddress: overrides.ip ?? '1.2.3.4' },
    query:  {
      staffId: overrides.staffId ?? 'staff-1',
      date:    overrides.date    ?? '2026-03-15',
    },
  };
  const res = {
    statusCode: overrides.statusCode ?? 200,
    status:     jest.fn().mockReturnThis(),
    json:       jest.fn(),
  };

  return {
    switchToHttp: () => ({
      getRequest:  () => req,
      getResponse: () => res,
    }),
  } as unknown as ExecutionContext;
}

// ─────────────────────────────────────────────────────────────────────────────
// §5/§6 — CorrelationStore
// ─────────────────────────────────────────────────────────────────────────────

describe('CorrelationStore (§5/§6)', () => {
  it('9a — run() stores correlationId and getCorrelationId() returns it', (done) => {
    const id = randomUUID();
    CorrelationStore.run({ correlationId: id }, () => {
      expect(getCorrelationId()).toBe(id);
      done();
    });
  });

  it('9b — getCorrelationId() returns undefined outside a context', () => {
    expect(getCorrelationId()).toBeUndefined();
  });

  it('9c — nested contexts are isolated', (done) => {
    const outer = randomUUID();
    const inner = randomUUID();
    CorrelationStore.run({ correlationId: outer }, () => {
      CorrelationStore.run({ correlationId: inner }, () => {
        expect(getCorrelationId()).toBe(inner);
        done();
      });
    });
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// §9a–e — PrometheusService
// ─────────────────────────────────────────────────────────────────────────────

describe('PrometheusService (§9)', () => {
  let svc: PrometheusService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [PrometheusService],
    }).compile();
    svc = module.get(PrometheusService);
  });

  it('9d — observeRequest increments http_requests_total', async () => {
    svc.observeRequest('GET', '/api/v1/test', 200, 50);
    svc.observeRequest('GET', '/api/v1/test', 200, 60);
    const text = await svc.getMetrics();
    expect(text).toContain('http_requests_total');
    // 2 increments
    expect(text).toMatch(/http_requests_total.*2/);
  });

  it('9e — incLockFailure increments redis_lock_failures_total', async () => {
    svc.incLockFailure();
    svc.incLockFailure();
    svc.incLockFailure();
    const text = await svc.getMetrics();
    expect(text).toContain('redis_lock_failures_total');
    expect(text).toMatch(/redis_lock_failures_total\s+3/);
  });

  it('9f — incRateLimitRejection increments rate_limit_rejections_total', async () => {
    svc.incRateLimitRejection('GET /api/v1/public/availability');
    const text = await svc.getMetrics();
    expect(text).toContain('rate_limit_rejections_total');
    expect(text).toMatch(/rate_limit_rejections_total.*1/);
  });

  it('9g — incArchiveBatch increments archive_worker_batches_total', async () => {
    svc.incArchiveBatch();
    svc.incArchiveBatch();
    const text = await svc.getMetrics();
    expect(text).toContain('archive_worker_batches_total');
    expect(text).toMatch(/archive_worker_batches_total\s+2/);
  });

  it('9h — queueJobsActive gauge can be set and retrieved in metrics output', async () => {
    svc.queueJobsActive.labels({ queue: 'calon:queue:test' }).set(7);
    const text = await svc.getMetrics();
    expect(text).toContain('queue_jobs_active');
    expect(text).toContain('calon:queue:test');
    expect(text).toMatch(/queue_jobs_active.*7/);
  });

  it('9i — contentType is Prometheus text format', () => {
    expect(svc.contentType).toContain('text/plain');
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// §9 — MetricsService (in-memory counters)
// ─────────────────────────────────────────────────────────────────────────────

describe('MetricsService (in-memory counters)', () => {
  let svc: MetricsService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [MetricsService],
    }).compile();
    svc = module.get(MetricsService);
  });

  it('snapshot returns zero counters initially', () => {
    const snap = svc.snapshot();
    expect(snap.total).toBe(0);
    expect(snap.errors).toBe(0);
    expect(snap.errorRate).toBe('0.00%');
    expect(snap.rateLimitRejections).toBe(0);
    expect(snap.redisLockFailures).toBe(0);
  });

  it('record increments total and errors on 5xx', () => {
    svc.record(10, 200);
    svc.record(20, 500);
    const snap = svc.snapshot();
    expect(snap.total).toBe(2);
    expect(snap.errors).toBe(1);
    expect(snap.errorRate).toBe('50.00%');
  });

  it('incRateLimitRejection increments rateLimitRejections', () => {
    svc.incRateLimitRejection();
    svc.incRateLimitRejection();
    expect(svc.snapshot().rateLimitRejections).toBe(2);
  });

  it('incRedisLockFailure increments redisLockFailures', () => {
    svc.incRedisLockFailure();
    expect(svc.snapshot().redisLockFailures).toBe(1);
  });

  it('incArchiveBatch increments archiveBatches in workerSnapshot', () => {
    svc.incArchiveBatch();
    svc.incArchiveBatch();
    expect(svc.workerSnapshot().archiveBatches).toBe(2);
  });

  it('p50/p95 are computed correctly', () => {
    // Feed 100 values: 1..100 ms
    for (let i = 1; i <= 100; i++) svc.record(i, 200);
    const snap = svc.snapshot();
    // p50 = sorted[50] = 51, p95 = sorted[95] = 96
    expect(snap.p50).toBe(51);
    expect(snap.p95).toBe(96);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// §8 — AvailabilityAbuseGuard
// ─────────────────────────────────────────────────────────────────────────────

describe('AvailabilityAbuseGuard (§8)', () => {
  let guard: AvailabilityAbuseGuard;
  let redisMock: jest.Mocked<Pick<import('ioredis').default, 'eval'>>;

  beforeEach(async () => {
    redisMock = { eval: jest.fn() };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        AvailabilityAbuseGuard,
        { provide: REDIS_CLIENT, useValue: redisMock },
      ],
    }).compile();

    guard = module.get(AvailabilityAbuseGuard);
  });

  it('9j — allows request when distinct date count <= 5', async () => {
    redisMock.eval.mockResolvedValue(3);
    const ctx = makeExecutionContext({ ip: '10.0.0.1' });
    await expect(guard.canActivate(ctx)).resolves.toBe(true);
  });

  it('9k — blocks request when distinct date count > 5', async () => {
    redisMock.eval.mockResolvedValue(6);
    const ctx = makeExecutionContext({ ip: '10.0.0.2' });
    const result = await guard.canActivate(ctx);
    expect(result).toBe(false);
    // response.status(429) should be called
    const res = ctx.switchToHttp().getResponse() as { status: jest.Mock; json: jest.Mock };
    expect(res.status).toHaveBeenCalledWith(429);
  });

  it('9l — allows when staffId/date missing (pass-through)', async () => {
    const ctx = {
      switchToHttp: () => ({
        getRequest:  () => ({ ip: '1.1.1.1', socket: {}, query: {} }),
        getResponse: () => ({}),
      }),
    } as unknown as ExecutionContext;
    await expect(guard.canActivate(ctx)).resolves.toBe(true);
    expect(redisMock.eval).not.toHaveBeenCalled();
  });

  it('9m — Redis error falls back to allow (fail-open)', async () => {
    redisMock.eval.mockRejectedValue(new Error('Redis down'));
    const ctx = makeExecutionContext({ ip: '10.0.0.3' });
    await expect(guard.canActivate(ctx)).resolves.toBe(true);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// §7 — QueueMetricsService
// ─────────────────────────────────────────────────────────────────────────────

describe('QueueMetricsService (§7)', () => {
  it('9n — getAll() returns stats for all 12 queues', async () => {
    const makeQueue = () => ({
      getWaitingCount:   jest.fn().mockResolvedValue(1),
      getActiveCount:    jest.fn().mockResolvedValue(2),
      getCompletedCount: jest.fn().mockResolvedValue(3),
      getFailedCount:    jest.fn().mockResolvedValue(4),
      getDelayedCount:   jest.fn().mockResolvedValue(5),
    });

    const queues = Array.from({ length: 12 }, makeQueue);
    const [
      notificationsQ, stockQ, loyaltyQ, humanQ, campaignQ, referralQ,
      eventDispatchQ, smsQ, emailQ, pushQ, dlqQ, recoveryQ,
    ] = queues;

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        QueueMetricsService,
        { provide: 'BullQueue_calon:queue:notifications',        useValue: notificationsQ },
        { provide: 'BullQueue_calon:queue:stock-deduct',         useValue: stockQ },
        { provide: 'BullQueue_calon:queue:loyalty-earn',         useValue: loyaltyQ },
        { provide: 'BullQueue_calon:queue:human-handoff',        useValue: humanQ },
        { provide: 'BullQueue_calon:queue:campaign',             useValue: campaignQ },
        { provide: 'BullQueue_calon:queue:referral-process',     useValue: referralQ },
        { provide: 'BullQueue_calon:queue:event-dispatch',       useValue: eventDispatchQ },
        { provide: 'BullQueue_calon:queue:notification-sms',     useValue: smsQ },
        { provide: 'BullQueue_calon:queue:notification-email',   useValue: emailQ },
        { provide: 'BullQueue_calon:queue:notification-push',    useValue: pushQ },
        { provide: 'BullQueue_calon:queue:notification-dlq',     useValue: dlqQ },
        { provide: 'BullQueue_calon:queue:notification-recovery',useValue: recoveryQ },
      ],
    }).compile();

    const svc  = module.get(QueueMetricsService);
    const all  = await svc.getAll();
    const keys = Object.keys(all);

    expect(keys).toHaveLength(12);
    for (const stats of Object.values(all)) {
      expect(stats).toMatchObject({ waiting: 1, active: 2, completed: 3, failed: 4, delayed: 5 });
    }
  });
});
