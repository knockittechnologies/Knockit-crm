import { Column, Entity, Index, ManyToOne } from 'typeorm';
import { BaseEntity } from '../../../common/entities/base.entity';
import { Tenant } from '../../tenants/entities/tenant.entity';
import { Project } from './project.entity';
import { Milestone } from './milestone.entity';
import { User } from '../../users/entities/user.entity';

export enum TaskStatus {
  TODO = 'todo',
  IN_PROGRESS = 'in_progress',
  IN_REVIEW = 'in_review',
  DONE = 'done',
}

export enum TaskPriority {
  LOW = 'low',
  MEDIUM = 'medium',
  HIGH = 'high',
}

@Entity('tasks')
@Index(['tenantId'])
@Index(['projectId'])
@Index(['assignedToId', 'status'])
export class Task extends BaseEntity {
  @ManyToOne(() => Tenant, { onDelete: 'CASCADE' })
  tenant: Tenant;

  @Column()
  tenantId: string;

  @ManyToOne(() => Project, (project) => project.tasks, { onDelete: 'CASCADE' })
  project: Project;

  @Column()
  projectId: string;

  @ManyToOne(() => Milestone, { nullable: true, onDelete: 'SET NULL' })
  milestone: Milestone | null;

  @Column({ type: 'varchar', nullable: true })
  milestoneId: string | null;

  @Column()
  title: string;

  @Column({ type: 'text', nullable: true })
  description: string | null;

  @Column({ type: 'enum', enum: TaskStatus, default: TaskStatus.TODO })
  status: TaskStatus;

  @Column({ type: 'enum', enum: TaskPriority, default: TaskPriority.MEDIUM })
  priority: TaskPriority;

  @ManyToOne(() => User, { nullable: true })
  assignedTo: User | null;

  @Column({ type: 'varchar', nullable: true })
  assignedToId: string | null;

  @Column({ type: 'date', nullable: true })
  dueDate: string | null;

  @Column({ type: 'decimal', precision: 10, scale: 2, nullable: true })
  estimatedHours: string | null;

  @Column({ type: 'timestamptz', nullable: true })
  completedAt: Date | null;

  @Column({ type: 'text', array: true, default: () => "'{}'" })
  tags: string[];

  @Column({ type: 'int', default: 0 })
  sortOrder: number;

  @ManyToOne(() => User, { nullable: true })
  createdBy: User | null;

  @Column({ type: 'varchar', nullable: true })
  createdById: string | null;
}
