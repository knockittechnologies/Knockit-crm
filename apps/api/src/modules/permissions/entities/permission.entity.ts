import { Column, Entity, ManyToMany } from 'typeorm';
import { BaseEntity } from '../../../common/entities/base.entity';
import { Role } from '../../roles/entities/role.entity';

/**
 * Permissions are global (not per-tenant) — "leads.create" means the same
 * thing for every tenant. What's per-tenant is which ROLE has which
 * permission, via role_permissions.
 */
@Entity('permissions')
export class Permission extends BaseEntity {
  @Column()
  module: string; // e.g. "leads", "tickets", "projects"

  @Column()
  action: string; // e.g. "create", "read", "update", "delete", "export"

  @Column({ unique: true })
  slug: string; // e.g. "leads.create"

  @Column({ type: 'varchar', nullable: true })
  description: string | null;

  @ManyToMany(() => Role, (role) => role.permissions)
  roles: Role[];
}
