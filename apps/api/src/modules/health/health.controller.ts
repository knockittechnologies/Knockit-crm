import { Controller, Get } from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import { DataSource } from 'typeorm';
import { Public } from '../../common/decorators/public.decorator';

/**
 * Hit by: AWS ALB target group health checks, ECS container health checks,
 * and uptime monitors. Returns 503 if the DB connection is down so the
 * load balancer stops routing traffic to a broken instance.
 */
@Controller('health')
export class HealthController {
  constructor(@InjectDataSource() private dataSource: DataSource) {}

  @Public()
  @Get()
  async check() {
    const dbHealthy = this.dataSource.isInitialized;
    let dbLatencyMs: number | null = null;

    if (dbHealthy) {
      const start = Date.now();
      await this.dataSource.query('SELECT 1');
      dbLatencyMs = Date.now() - start;
    }

    return {
      status: dbHealthy ? 'ok' : 'degraded',
      timestamp: new Date().toISOString(),
      database: { connected: dbHealthy, latencyMs: dbLatencyMs },
      uptime: process.uptime(),
    };
  }
}
