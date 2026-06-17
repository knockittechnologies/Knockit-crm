import { Column, Entity, OneToMany } from 'typeorm';
import { BaseEntity } from '../../../common/entities/base.entity';
import { User } from '../../users/entities/user.entity';

export enum TenantPlan {
  STARTER = 'starter',
  PRO = 'pro',
  ENTERPRISE = 'enterprise',
}

export enum TenantStatus {
  ACTIVE = 'active',
  SUSPENDED = 'suspended',
  CANCELLED = 'cancelled',
}

/**
 * The root of multi-tenancy. Every other business entity carries a
 * tenantId foreign key back to this table, and PostgreSQL Row-Level
 * Security policies (see migration 0001) enforce that a query can never
 * leak rows across tenant boundaries even if application code has a bug.
 */
@Entity('tenants')
export class Tenant extends BaseEntity {
  @Column({ unique: true })
  slug: string; // e.g. "knockit-tech" — used in subdomain routing

  @Column()
  name: string;

  @Column({ type: 'enum', enum: TenantPlan, default: TenantPlan.STARTER })
  plan: TenantPlan;

  @Column({ type: 'enum', enum: TenantStatus, default: TenantStatus.ACTIVE })
  status: TenantStatus;

  @Column({ type: 'jsonb', default: {} })
  settings: Record<string, unknown>;

  @Column({ default: 10 })
  maxUsers: number;

  @Column({ default: 10 })
  maxStorageGb: number;

  // UK-specific fields
  @Column({ default: 'GBP' })
  currency: string;

  @Column({ default: 'Europe/London' })
  timezone: string;

  @Column({ type: 'varchar', nullable: true })
  vatNumber: string | null;

  @Column({ type: 'varchar', nullable: true })
  companiesHouseNumber: string | null;

  @OneToMany(() => User, (user) => user.tenant)
  users: User[];
}
