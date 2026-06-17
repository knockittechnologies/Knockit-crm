import { SetMetadata, CanActivate, ExecutionContext, Injectable, ForbiddenException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Role } from '../../modules/roles/entities/role.entity';

export const PERMISSIONS_KEY = 'permissions';
export const PERMISSIONS_MODE_KEY = 'permissions_mode';

/**
 * @RequirePermissions('leads.create', 'leads.update') — user must have ALL
 * of the listed permissions. Use this for routes that genuinely combine
 * distinct capabilities.
 */
export const RequirePermissions = (...permissions: string[]) => {
  return (target: any, key?: any, descriptor?: any) => {
    SetMetadata(PERMISSIONS_KEY, permissions)(target, key, descriptor);
    SetMetadata(PERMISSIONS_MODE_KEY, 'all')(target, key, descriptor);
    return descriptor;
  };
};

/**
 * @RequireAnyPermission('leads.view-all', 'leads.view-assigned') — user
 * must have AT LEAST ONE of the listed permissions. Use this for routes
 * where several different roles can reach the same endpoint with different
 * scopes (the scoping itself then happens inside the service/controller).
 */
export const RequireAnyPermission = (...permissions: string[]) => {
  return (target: any, key?: any, descriptor?: any) => {
    SetMetadata(PERMISSIONS_KEY, permissions)(target, key, descriptor);
    SetMetadata(PERMISSIONS_MODE_KEY, 'any')(target, key, descriptor);
    return descriptor;
  };
};

/**
 * Runs AFTER JwtAuthGuard (registered second in app.module providers).
 * Loads the user's role + permissions and checks against what the route
 * requires. This is the enforcement point for the whole Permission Matrix
 * — UI hiding a button is cosmetic, this guard is what actually protects data.
 */
@Injectable()
export class PermissionsGuard implements CanActivate {
  constructor(
    private reflector: Reflector,
    @InjectRepository(Role) private rolesRepo: Repository<Role>,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const required = this.reflector.getAllAndOverride<string[]>(
      PERMISSIONS_KEY,
      [context.getHandler(), context.getClass()],
    );
    if (!required || required.length === 0) return true;

    const mode = this.reflector.getAllAndOverride<'all' | 'any'>(
      PERMISSIONS_MODE_KEY,
      [context.getHandler(), context.getClass()],
    ) ?? 'all';

    const request = context.switchToHttp().getRequest();
    const user = request.user;
    if (!user) throw new ForbiddenException('Not authenticated');

    const role = await this.rolesRepo.findOne({
      where: { id: user.roleId },
      relations: ['permissions'],
    });
    if (!role) throw new ForbiddenException('Role not found');

    const userPermSlugs = new Set(role.permissions.map((p) => p.slug));
    const satisfied =
      mode === 'any'
        ? required.some((p) => userPermSlugs.has(p))
        : required.every((p) => userPermSlugs.has(p));

    if (!satisfied) {
      const joiner = mode === 'any' ? ' or ' : ' and ';
      throw new ForbiddenException(
        `Missing required permission(s): ${required.join(joiner)}`,
      );
    }
    return true;
  }
}
