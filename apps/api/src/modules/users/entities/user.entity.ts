import { Column, Entity, Index, ManyToOne } from 'typeorm';
import { Exclude } from 'class-transformer';
import { BaseEntity } from '../../../common/entities/base.entity';
import { Tenant } from '../../tenants/entities/tenant.entity';
import { Role } from '../../roles/entities/role.entity';

export enum UserStatus {
  ACTIVE = 'active',
  INVITED = 'invited', // invite sent, hasn't set password yet
  INACTIVE = 'inactive',
  SUSPENDED = 'suspended',
}

@Entity('users')
@Index(['tenantId', 'email'], { unique: true })
export class User extends BaseEntity {
  @ManyToOne(() => Tenant, { onDelete: 'CASCADE' })
  tenant: Tenant;

  @Column()
  tenantId: string;

  @ManyToOne(() => Role, { eager: true })
  role: Role;

  @Column()
  roleId: string;

  @Column()
  email: string;

  @Column({ type: 'varchar', nullable: true })
  phone: string | null;

  @Exclude({ toPlainOnly: true }) // never serialise this out in API responses
  @Column({ type: 'varchar', nullable: true })
  passwordHash: string | null; // null while status = invited

  @Column()
  firstName: string;

  @Column()
  lastName: string;

  @Column({ type: 'varchar', nullable: true })
  avatarUrl: string | null;

  @Column({ type: 'varchar', nullable: true })
  department: string | null;

  @Column({ type: 'enum', enum: UserStatus, default: UserStatus.INVITED })
  status: UserStatus;

  @Column({ default: false })
  emailVerified: boolean;

  // ── MFA (TOTP via speakeasy) ──
  @Column({ default: false })
  twoFaEnabled: boolean;

  @Exclude({ toPlainOnly: true })
  @Column({ type: 'varchar', nullable: true })
  twoFaSecret: string | null;

  @Exclude({ toPlainOnly: true })
  @Column({ type: 'jsonb', nullable: true })
  twoFaBackupCodes: string[] | null; // hashed backup codes

  // ── Per-employee module access override ──
  // If null, access is derived purely from role.permissions.
  // If set, this is an explicit allow-list of module slugs for this user
  // (used by "Add Employee" screen's module toggle grid).
  @Column({ type: 'jsonb', nullable: true })
  moduleAccessOverride: string[] | null;

  @Column({ type: 'timestamptz', nullable: true })
  lastLoginAt: Date | null;

  @Exclude({ toPlainOnly: true })
  @Column({ type: 'varchar', nullable: true })
  inviteToken: string | null;

  @Column({ type: 'timestamptz', nullable: true })
  inviteTokenExpiresAt: Date | null;

  @Exclude({ toPlainOnly: true })
  @Column({ type: 'varchar', nullable: true })
  passwordResetToken: string | null;

  @Column({ type: 'timestamptz', nullable: true })
  passwordResetExpiresAt: Date | null;

  get fullName(): string {
    return `${this.firstName} ${this.lastName}`;
  }
}
