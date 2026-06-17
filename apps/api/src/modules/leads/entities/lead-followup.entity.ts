import { Column, Entity, Index, ManyToOne } from 'typeorm';
import { BaseEntity } from '../../../common/entities/base.entity';
import { Tenant } from '../../tenants/entities/tenant.entity';
import { Lead } from './lead.entity';
import { User } from '../../users/entities/user.entity';

export enum FollowUpStatus {
  PENDING = 'pending',
  COMPLETED = 'completed',
  CANCELLED = 'cancelled',
}

@Entity('lead_followups')
@Index(['tenantId'])
@Index(['leadId'])
@Index(['assignedToId', 'status'])
export class LeadFollowUp extends BaseEntity {
  @ManyToOne(() => Tenant, { onDelete: 'CASCADE' })
  tenant: Tenant;

  @Column()
  tenantId: string;

  @ManyToOne(() => Lead, { onDelete: 'CASCADE' })
  lead: Lead;

  @Column()
  leadId: string;

  @ManyToOne(() => User)
  assignedTo: User;

  @Column()
  assignedToId: string;

  @Column({ type: 'timestamptz' })
  dueDate: Date;

  @Column({ type: 'text', nullable: true })
  notes: string | null;

  @Column({ type: 'enum', enum: FollowUpStatus, default: FollowUpStatus.PENDING })
  status: FollowUpStatus;

  @Column({ type: 'timestamptz', nullable: true })
  completedAt: Date | null;

  @ManyToOne(() => User, { nullable: true })
  createdBy: User | null;

  @Column({ type: 'varchar', nullable: true })
  createdById: string | null;
}
