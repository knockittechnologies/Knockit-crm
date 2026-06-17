import { Module } from '@nestjs/common';
import { APP_GUARD } from '@nestjs/core';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Role } from '../../modules/roles/entities/role.entity';
import { Permission } from '../../modules/permissions/entities/permission.entity';
import { PermissionsGuard } from '../guards/permissions.guard';

/**
 * Exists so PermissionsGuard can be registered as a GLOBAL guard without
 * AppModule needing to import the full RolesModule (avoids a circular
 * dependency once Roles/Users modules need things from each other).
 *
 * IMPORTANT: the APP_GUARD provider is declared HERE, inside this module,
 * not in AppModule's own providers array. A provider registered via
 * APP_GUARD is instantiated using the injector of the module that declares
 * it — declaring it in AppModule would put it in AppModule's own DI scope,
 * which can't see RbacModule's exported Role/Permission repositories even
 * though RbacModule is imported. Declaring it here fixes that.
 */
@Module({
  imports: [TypeOrmModule.forFeature([Role, Permission])],
  providers: [{ provide: APP_GUARD, useClass: PermissionsGuard }],
})
export class RbacModule {}
