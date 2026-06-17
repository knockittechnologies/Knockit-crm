import { Column, Entity, Index, ManyToOne, OneToMany } from 'typeorm';
import { BaseEntity } from '../../../common/entities/base.entity';
import { Tenant } from '../../tenants/entities/tenant.entity';
import { Company } from '../../companies/entities/company.entity';
import { Lead } from '../../leads/entities/lead.entity';
import { User } from '../../users/entities/user.entity';
import { Task } from './task.entity';
import { Milestone } from './milestone.entity';

export enum ProjectStatus {
  PLANNING = 'planning',
  IN_PROGRESS = 'in_progress',
  ON_HOLD = 'on_hold',
  COMPLETED = 'completed',
  CANCELLED = 'cancelled',
}

export enum ProjectType {
  MOBILE_APP = 'mobile_app',
  WEBSITE = 'website',
  CRM = 'crm',
  CUSTOM_SOFTWARE = 'custom_software',
  AMC_SUPPORT = 'amc_support',
}

/**
 * Allowed forward/lateral moves. Unlike the lead pipeline this isn't a
 * strict funnel — a project can go on_hold and come back, or be cancelled
 * from almost anywhere. completed/cancelled are terminal.
 */
export const PROJECT_STATUS_TRANSITIONS: Record<ProjectStatus, ProjectStatus[]> = {
  [ProjectStatus.PLANNING]: [ProjectStatus.IN_PROGRESS, ProjectStatus.CANCELLED],
  [ProjectStatus.IN_PROGRESS]: [
    ProjectStatus.ON_HOLD,
    ProjectStatus.COMPLETED,
    ProjectStatus.CANCELLED,
  ],
  [ProjectStatus.ON_HOLD]: [ProjectStatus.IN_PROGRESS, ProjectStatus.CANCELLED],
  [ProjectStatus.COMPLETED]: [],
  [ProjectStatus.CANCELLED]: [],
};

@Entity('projects')
@Index(['tenantId'])
@Index(['tenantId', 'status'])
export class Project extends BaseEntity {
  @ManyToOne(() => Tenant, { onDelete: 'CASCADE' })
  tenant: Tenant;

  @Column()
  tenantId: string;

  @Column()
  name: string;

  @Column({ type: 'text', nullable: true })
  description: string | null;

  @Column({ type: 'enum', enum: ProjectType, nullable: true })
  type: ProjectType | null;

  @Column({ type: 'enum', enum: ProjectStatus, default: ProjectStatus.PLANNING })
  status: ProjectStatus;

  @ManyToOne(() => Company, { nullable: true, onDelete: 'SET NULL' })
  company: Company | null;

  @Column({ type: 'varchar', nullable: true })
  companyId: string | null;

  // Set automatically when a project is created from a won lead — see
  // ProjectsService's lead.won event listener. Null for projects created
  // directly (no associated sales lead, e.g. internal work).
  @ManyToOne(() => Lead, { nullable: true, onDelete: 'SET NULL' })
  originLead: Lead | null;

  @Column({ type: 'varchar', nullable: true })
  originLeadId: string | null;

  @Column({ type: 'date', nullable: true })
  startDate: string | null;

  @Column({ type: 'date', nullable: true })
  targetEndDate: string | null;

  @Column({ type: 'date', nullable: true })
  actualEndDate: string | null;

  @Column({ type: 'decimal', precision: 15, scale: 2, nullable: true })
  budget: string | null;

  @Column({ default: 'GBP' })
  currency: string;

  // Stored as decimal hours, accumulated from TimeLog entries via a trigger
  // or recalculated on read — kept simple here as a cached running total
  // updated whenever a time log is added (see TimeLogsService).
  @Column({ type: 'decimal', precision: 10, scale: 2, default: 0 })
  loggedHours: string;

  @ManyToOne(() => User, { nullable: true })
  projectManager: User | null;

  @Column({ type: 'varchar', nullable: true })
  projectManagerId: string | null;

  @Column({ type: 'text', array: true, default: () => "'{}'" })
  teamMemberIds: string[]; // simple array of user IDs; a join table would be the next iteration if roles-per-project are needed

  @Column({ type: 'int', default: 0 })
  progressPercent: number;

  @ManyToOne(() => User, { nullable: true })
  createdBy: User | null;

  @Column({ type: 'varchar', nullable: true })
  createdById: string | null;

  @OneToMany(() => Task, (task) => task.project)
  tasks: Task[];

  @OneToMany(() => Milestone, (milestone) => milestone.project)
  milestones: Milestone[];
}
