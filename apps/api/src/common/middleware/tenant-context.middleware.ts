import { Injectable, NestMiddleware } from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import { DataSource } from 'typeorm';
import type { Request, Response, NextFunction } from 'express';
import * as jwt from 'jsonwebtoken';

/**
 * Decodes the JWT (if present) and sets app.tenant_id / app.user_id /
 * app.role as PostgreSQL session variables for THIS request's connection.
 * The RLS policies defined in migration 0001 read these via
 * current_setting('app.tenant_id') to silently filter every query —
 * this is the safety net underneath the PermissionsGuard: even if a
 * service method forgets a WHERE tenantId = ... clause, the database
 * itself refuses to return another tenant's rows.
 *
 * Note: this only sets a request-scoped value for logging/inspection here.
 * The actual SET LOCAL happens per-transaction in BaseRepository — see
 * common/services/tenant-context.service.ts for where queries pick this up.
 */
@Injectable()
export class TenantContextMiddleware implements NestMiddleware {
  constructor(@InjectDataSource() private dataSource: DataSource) {}

  use(req: Request, res: Response, next: NextFunction) {
    const authHeader = req.headers.authorization;
    if (authHeader?.startsWith('Bearer ')) {
      try {
        const token = authHeader.slice(7);
        // Decode without verifying here — verification already happens in
        // JwtAuthGuard. This is just to make tenantId available early for
        // request-scoped logging context.
        const decoded = jwt.decode(token) as any;
        if (decoded?.tenantId) {
          (req as any).tenantId = decoded.tenantId;
        }
      } catch {
        // Malformed token — JwtAuthGuard will reject it properly downstream.
      }
    }
    next();
  }
}
