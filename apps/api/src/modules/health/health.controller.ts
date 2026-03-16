import { Controller, Get, Inject, Res } from '@nestjs/common';
import type { Response }                 from 'express';
import type Redis                        from 'ioredis';
import { Public }                        from '../iam/guards/tenant.guard';
import { PrismaService }                 from '../../common/prisma.service';
import { REDIS_CLIENT }                  from '../../common/redis-tokens';

@Public()
@Controller('health')
export class HealthController {
  constructor(
    private readonly prisma: PrismaService,
    @Inject(REDIS_CLIENT) private readonly redis: Redis,
  ) {}

  /**
   * GET /api/v1/health
   *
   * Docker healthcheck + external uptime probes için.
   * Auth bypass: @Public() — JWT token gerekmez.
   * ThrottlerGuard: global limit uygulanır; healthcheck'ler genellikle
   *   internal network'ten geldiği için sorun olmaz.
   */
  @Get()
  check(): { status: string; service: string; timestamp: string } {
    return {
      status:    'ok',
      service:   'calon-api',
      timestamp: new Date().toISOString(),
    };
  }

  /**
   * GET /api/v1/health/ready
   *
   * DB + Redis sağlık kontrolü.
   * 200 → tümü up | 503 → herhangi biri down.
   * Deployment pipeline, K8s readiness probe ve uptime monitor'lar için.
   */
  @Get('ready')
  async ready(@Res() res: Response): Promise<void> {
    const [dbResult, redisResult] = await Promise.all([
      this.checkDatabase(),
      this.checkRedis(),
    ]);

    const allUp = dbResult.status === 'up' && redisResult.status === 'up';

    res.status(allUp ? 200 : 503).json({
      status:    allUp ? 'ready' : 'degraded',
      checks: {
        database: dbResult,
        redis:    redisResult,
      },
      timestamp: new Date().toISOString(),
    });
  }

  /**
   * GET /api/v1/health/version
   *
   * Build / deployment bilgisi — hangi commit canlıda olduğunu gösterir.
   */
  @Get('version')
  version(): {
    version:     string;
    commit:      string;
    buildTime:   string;
    nodeVersion: string;
    environment: string | undefined;
  } {
    return {
      version:     process.env['npm_package_version'] ?? '1.0.0',
      commit:      process.env['GIT_COMMIT']           ?? 'unknown',
      buildTime:   process.env['BUILD_TIME']            ?? 'unknown',
      nodeVersion: process.version,
      environment: process.env['NODE_ENV'],
    };
  }

  // ── Private helpers ──────────────────────────────────────────────────────────

  private async checkDatabase(): Promise<{ status: 'up' | 'down'; latencyMs: number }> {
    const start = Date.now();
    try {
      await this.prisma.$queryRaw`SELECT 1`;
      return { status: 'up', latencyMs: Date.now() - start };
    } catch {
      return { status: 'down', latencyMs: Date.now() - start };
    }
  }

  private async checkRedis(): Promise<{ status: 'up' | 'down'; latencyMs: number }> {
    const start = Date.now();
    try {
      await this.redis.ping();
      return { status: 'up', latencyMs: Date.now() - start };
    } catch {
      return { status: 'down', latencyMs: Date.now() - start };
    }
  }
}
