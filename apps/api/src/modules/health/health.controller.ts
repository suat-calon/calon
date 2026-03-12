import { Controller, Get } from '@nestjs/common';
import { Public }          from '../iam/guards/tenant.guard';

@Public()
@Controller('health')
export class HealthController {
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
}
