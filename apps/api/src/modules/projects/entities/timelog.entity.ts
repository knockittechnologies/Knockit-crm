import { Column, Entity, Index, ManyToOne } from 'typeorm';
import { BaseEntity } from '../../../common/entities/base.entity';
import { Tenant } from '../../tenants/entities/tenant.entity';
import { Project } from './project.entity';
import { Task } from './task.entity';
import { User } from '../../users/entities/user.entity';

@Entity('time_logs')
@Index(['tenantId'])
@Index(['projectId'])
@Index(['userId', 'date'])
export class TimeLog extends BaseEntity {
  @ManyToOne(() => Tenant, { onDelete: 'CASCADE' })
  tenant: Tenant;

  @Column()
  tenantId: string;

  @ManyToOne(() => Project, { onDelete: 'CASCADE' })
  project: Project;

  @Column()
  projectId: string;

  @ManyToOne(() => Task, { nullable: true, onDelete: 'SET NULL' })
  task: Task | null;

  @Column({ type: 'varchar', nullable: true })
  taskId: string | null;

  @ManyToOne(() => User)
  user: User;

  @Column()
  userId: string;

  @Column({ type: 'date' })
  date: string;

  @Column({ type: 'decimal', precision: 5, scale: 2 })
  hours: string;

  @Column({ type: 'text', nullable: true })
  notes: string | null;

  // AMC hours are billed against a maintenance contract rather than the
  // project budget — flagged here so the AMC module (built next) can pull
  // exactly the entries that count against a client's contracted hours.
  @Column({ default: false })
  isAmcHours: boolean;

  @Column({ default: false })
  isBillable: boolean;
}
