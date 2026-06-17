import { Column, Entity, Index, ManyToOne } from 'typeorm';
import { BaseEntity } from '../../../common/entities/base.entity';
import { Tenant } from '../../tenants/entities/tenant.entity';
import { Contact } from '../../contacts/entities/contact.entity';
import { Company } from '../../companies/entities/company.entity';
import { User } from '../../users/entities/user.entity';

export enum LeadStatus {
  NEW = 'new',
  CONTACTED = 'contacted',
  REQUIREMENT_GATHERING = 'requirement_gathering',
  PROPOSAL_SENT = 'proposal_sent',
  NEGOTIATION = 'negotiation',
  WON = 'won',
  LOST = 'lost',
}

export enum LeadPriority {
  LOW = 'low',
  MEDIUM = 'medium',
  HIGH = 'high',
}

/**
 * Valid forward transitions for the lead pipeline. Enforced in
 * LeadsService.updateStatus() — this is what makes the status flow diagram
 * a real constraint instead of just documentation.
 * "lost" is reachable from any non-terminal state (a deal can die at any stage).
 */
export const LEAD_STATUS_TRANSITIONS: Record<LeadStatus, LeadStatus[]> = {
  [LeadStatus.NEW]: [LeadStatus.CONTACTED, LeadStatus.LOST],
  [LeadStatus.CONTACTED]: [LeadStatus.REQUIREMENT_GATHERING, LeadStatus.LOST],
  [LeadStatus.REQUIREMENT_GATHERING]: [LeadStatus.PROPOSAL_SENT, LeadStatus.LOST],
  [LeadStatus.PROPOSAL_SENT]: [LeadStatus.NEGOTIATION, LeadStatus.LOST],
  [LeadStatus.NEGOTIATION]: [LeadStatus.WON, LeadStatus.LOST],
  [LeadStatus.WON]: [], // terminal
  [LeadStatus.LOST]: [], // terminal
};

@Entity('leads')
@Index(['tenantId'])
@Index(['tenantId', 'status'])
export class Lead extends BaseEntity {
  @ManyToOne(() => Tenant, { onDelete: 'CASCADE' })
  tenant: Tenant;

  @Column()
  tenantId: string;

  @ManyToOne(() => Contact, { onDelete: 'SET NULL', nullable: true })
  contact: Contact | null;

  @Column({ type: 'varchar', nullable: true })
  contactId: string | null;

  @ManyToOne(() => Company, { onDelete: 'SET NULL', nullable: true })
  company: Company | null;

  @Column({ type: 'varchar', nullable: true })
  companyId: string | null;

  @Column()
  title: string;

  @Column({ type: 'varchar', nullable: true })
  source: string | null; // website | referral | linkedin | ad | cold-call

  @Column({ type: 'enum', enum: LeadStatus, default: LeadStatus.NEW })
  status: LeadStatus;

  @Column({ type: 'enum', enum: LeadPriority, default: LeadPriority.MEDIUM })
  priority: LeadPriority;

  @Column({ type: 'decimal', precision: 15, scale: 2, nullable: true })
  estimatedValue: string | null;

  @Column({ default: 'GBP' })
  currency: string;

  @Column({ type: 'int', default: 0 })
  probability: number; // 0-100

  @Column({ type: 'date', nullable: true })
  expectedClose: string | null;

  @Column({ type: 'text', array: true, default: () => "'{}'" })
  serviceType: string[]; // mobile-app | website | crm | custom

  @Column({ type: 'text', nullable: true })
  description: string | null;

  @Column({ type: 'text', nullable: true })
  lostReason: string | null;

  @Column({ type: 'timestamptz', nullable: true })
  lostAt: Date | null;

  @Column({ type: 'timestamptz', nullable: true })
  wonAt: Date | null;

  @ManyToOne(() => User, { nullable: true })
  assignedTo: User | null;

  @Column({ type: 'varchar', nullable: true })
  assignedToId: string | null;

  @ManyToOne(() => User, { nullable: true })
  createdBy: User | null;

  @Column({ type: 'varchar', nullable: true })
  createdById: string | null;

  @Column({ type: 'text', array: true, default: () => "'{}'" })
  tags: string[];

  @Column({ type: 'jsonb', default: {} })
  customFields: Record<string, unknown>;
}
