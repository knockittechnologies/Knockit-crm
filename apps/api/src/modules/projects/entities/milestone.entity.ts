import { Column, Entity, Index, ManyToOne } from 'typeorm';
import { BaseEntity } from '../../../common/entities/base.entity';
import { Tenant } from '../../tenants/entities/tenant.entity';
import { Project } from './project.entity';

export enum MilestoneStatus {
  PENDING = 'pending',
  IN_PROGRESS = 'in_progress',
  COMPLETED = 'completed',
  DELAYED = 'delayed',
}

@Entity('milestones')
@Index(['tenantId'])
@Index(['projectId'])
export class Milestone extends BaseEntity {
  @ManyToOne(() => Tenant, { onDelete: 'CASCADE' })
  tenant: Tenant;

  @Column()
  tenantId: string;

  @ManyToOne(() => Project, (project) => project.milestones, { onDelete: 'CASCADE' })
  project: Project;

  @Column()
  projectId: string;

  @Column()
  title: string;

  @Column({ type: 'text', nullable: true })
  description: string | null;

  @Column({ type: 'date', nullable: true })
  dueDate: string | null;

  @Column({ type: 'enum', enum: MilestoneStatus, default: MilestoneStatus.PENDING })
  status: MilestoneStatus;

  @Column({ type: 'timestamptz', nullable: true })
  completedAt: Date | null;

  @Column({ type: 'int', default: 0 })
  sortOrder: number;
}
