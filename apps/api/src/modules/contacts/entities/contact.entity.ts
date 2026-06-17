import { Column, Entity, Index, ManyToOne } from 'typeorm';
import { Exclude } from 'class-transformer';
import { BaseEntity } from '../../../common/entities/base.entity';
import { Tenant } from '../../tenants/entities/tenant.entity';
import { Company } from '../../companies/entities/company.entity';
import { User } from '../../users/entities/user.entity';

@Entity('contacts')
@Index(['tenantId'])
export class Contact extends BaseEntity {
  @ManyToOne(() => Tenant, { onDelete: 'CASCADE' })
  tenant: Tenant;

  @Column()
  tenantId: string;

  @ManyToOne(() => Company, (company) => company.contacts, {
    onDelete: 'SET NULL',
    nullable: true,
  })
  company: Company | null;

  @Column({ type: 'varchar', nullable: true })
  companyId: string | null;

  @Column()
  firstName: string;

  @Column({ type: 'varchar', nullable: true })
  lastName: string | null;

  @Column({ type: 'varchar', nullable: true })
  email: string | null;

  @Column({ type: 'varchar', nullable: true })
  phone: string | null;

  @Column({ type: 'varchar', nullable: true })
  jobTitle: string | null;

  @Column({ type: 'varchar', nullable: true })
  department: string | null;

  @Column({ type: 'varchar', nullable: true })
  avatarUrl: string | null;

  @Column({ default: 'Europe/London' })
  timezone: string;

  @Column({ default: 'email' })
  preferredContact: string; // email | phone | whatsapp

  @Column({ default: false })
  isPrimary: boolean; // primary contact for the company

  @Column({ type: 'text', nullable: true })
  notes: string | null;

  @Column({ type: 'text', array: true, default: () => "'{}'" })
  tags: string[];

  @Column({ type: 'jsonb', default: {} })
  customFields: Record<string, unknown>;

  // ── Client portal authentication ──
  // Originally this pointed at a separate clientUserId on the staff `users`
  // table — wrong model. A client logging into the portal isn't a tenant
  // employee with a role and permission set; they're a contact scoped to
  // exactly one company within one tenant. Giving Contact its own auth
  // fields (mirroring how User does it) keeps that boundary clean and means
  // the portal auth guard never has to reason about staff RBAC at all.
  @Column({ default: false })
  isClientUser: boolean;

  @Exclude({ toPlainOnly: true })
  @Column({ type: 'varchar', nullable: true })
  passwordHash: string | null; // null until the contact accepts their portal invite

  @Exclude({ toPlainOnly: true })
  @Column({ type: 'varchar', nullable: true })
  inviteToken: string | null;

  @Column({ type: 'timestamptz', nullable: true })
  inviteTokenExpiresAt: Date | null;

  @Column({ type: 'timestamptz', nullable: true })
  lastPortalLoginAt: Date | null;

  @ManyToOne(() => User, { nullable: true })
  createdBy: User | null;

  @Column({ type: 'varchar', nullable: true })
  createdById: string | null;

  get fullName(): string {
    return [this.firstName, this.lastName].filter(Boolean).join(' ');
  }
}
