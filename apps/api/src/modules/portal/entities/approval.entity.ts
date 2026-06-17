import { Column, Entity, Index, ManyToOne } from 'typeorm';
import { BaseEntity } from '../../../common/entities/base.entity';
import { Tenant } from '../../tenants/entities/tenant.entity';
import { Project } from '../../projects/entities/project.entity';
import { User } from '../../users/entities/user.entity';
import { Contact } from '../../contacts/entities/contact.entity';

export enum ApprovalStatus {
  PENDING = 'pending',
  APPROVED = 'approved',
  REVISION_REQUESTED = 'revision_requested',
}

export enum ApprovalType {
  DESIGN = 'design',
  DOCUMENT = 'document',
  DELIVERABLE = 'deliverable',
  MILESTONE = 'milestone',
}

@Entity('approvals')
@Index(['tenantId'])
@Index(['tenantId', 'status'])
export class Approval extends BaseEntity {
  @ManyToOne(() => Tenant, { onDelete: 'CASCADE' })
  tenant: Tenant;

  @Column()
  tenantId: string;

  @ManyToOne(() => Project, { nullable: true, onDelete: 'CASCADE' })
  project: Project | null;

  @Column({ type: 'varchar', nullable: true })
  projectId: string | null;

  @Column()
  title: string;

  @Column({ type: 'text', nullable: true })
  description: string | null;

  @Column({ type: 'enum', enum: ApprovalType, default: ApprovalType.DELIVERABLE })
  type: ApprovalType;

  @Column({ type: 'enum', enum: ApprovalStatus, default: ApprovalStatus.PENDING })
  status: ApprovalStatus;

  @Column({ type: 'varchar', nullable: true })
  fileUrl: string | null;

  @Column({ type: 'varchar', nullable: true })
  fileName: string | null;

  @ManyToOne(() => User, { nullable: true })
  requestedByUser: User | null;

  @Column({ type: 'varchar', nullable: true })
  requestedByUserId: string | null;

  // Who on the client side actually approved/requested revision — null
  // while pending.
  @ManyToOne(() => Contact, { nullable: true })
  respondedByContact: Contact | null;

  @Column({ type: 'varchar', nullable: true })
  respondedByContactId: string | null;

  @Column({ type: 'text', nullable: true })
  responseNotes: string | null;

  @Column({ type: 'timestamptz', nullable: true })
  respondedAt: Date | null;
}
