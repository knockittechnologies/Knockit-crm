import { Column, Entity, Index, ManyToOne } from 'typeorm';
import { BaseEntity } from '../../../common/entities/base.entity';
import { Tenant } from '../../tenants/entities/tenant.entity';
import { Lead } from './lead.entity';
import { User } from '../../users/entities/user.entity';

export enum LeadActivityType {
  CALL = 'call',
  EMAIL = 'email',
  MEETING = 'meeting',
  NOTE = 'note',
  STATUS_CHANGE = 'status_change',
}

@Entity('lead_activities')
@Index(['tenantId'])
@Index(['leadId'])
export class LeadActivity extends BaseEntity {
  @ManyToOne(() => Tenant, { onDelete: 'CASCADE' })
  tenant: Tenant;

  @Column()
  tenantId: string;

  @ManyToOne(() => Lead, { onDelete: 'CASCADE' })
  lead: Lead;

  @Column()
  leadId: string;

  @ManyToOne(() => User, { nullable: true })
  user: User | null;

  @Column({ type: 'varchar', nullable: true })
  userId: string | null;

  @Column({ type: 'enum', enum: LeadActivityType })
  type: LeadActivityType;

  @Column({ type: 'varchar', nullable: true })
  title: string | null;

  @Column({ type: 'text', nullable: true })
  description: string | null;

  @Column({ type: 'jsonb', default: {} })
  metadata: Record<string, unknown>;

  @Column({ type: 'timestamptz', nullable: true })
  scheduledAt: Date | null;

  @Column({ type: 'timestamptz', nullable: true })
  completedAt: Date | null;
}
