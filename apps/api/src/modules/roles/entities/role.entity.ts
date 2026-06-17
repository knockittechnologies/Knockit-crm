import {
  Column,
  Entity,
  JoinTable,
  ManyToMany,
  ManyToOne,
  OneToMany,
} from 'typeorm';
import { BaseEntity } from '../../../common/entities/base.entity';
import { Tenant } from '../../tenants/entities/tenant.entity';
import { Permission } from '../../permissions/entities/permission.entity';
import { User } from '../../users/entities/user.entity';

export enum SystemRoleSlug {
  SUPER_ADMIN = 'super-admin',
  ADMIN = 'admin',
  MANAGER = 'manager',
  STAFF = 'staff',
  CLIENT = 'client',
}

@Entity('roles')
export class Role extends BaseEntity {
  @ManyToOne(() => Tenant, { onDelete: 'CASCADE' })
  tenant: Tenant;

  @Column()
  tenantId: string;

  @Column()
  name: string;

  @Column()
  slug: string; // super-admin | admin | manager | staff | client (or custom)

  @Column({ type: 'varchar', nullable: true })
  description: string | null;

  @Column({ default: false })
  isSystem: boolean; // system roles can't be deleted, only customised

  @ManyToMany(() => Permission, (permission) => permission.roles)
  @JoinTable({
    name: 'role_permissions',
    joinColumn: { name: 'role_id', referencedColumnName: 'id' },
    inverseJoinColumn: { name: 'permission_id', referencedColumnName: 'id' },
  })
  permissions: Permission[];

  @OneToMany(() => User, (user) => user.role)
  users: User[];
}
