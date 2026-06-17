import { Column, Entity, Index, ManyToOne } from 'typeorm';
import { BaseEntity } from '../../../common/entities/base.entity';
import { Tenant } from '../../tenants/entities/tenant.entity';
import { Contact } from '../../contacts/entities/contact.entity';
import { Company } from '../../companies/entities/company.entity';
import { User } from '../../users/entities/user.entity';

export enum TicketPriority {
  LOW = 'low',
  MEDIUM = 'medium',
  HIGH = 'high',
  CRITICAL = 'critical',
}

export enum TicketStatus {
  OPEN = 'open',
  ASSIGNED = 'assigned',
  IN_PROGRESS = 'in_progress',
  WAITING_ON_CLIENT = 'waiting_on_client',
  RESOLVED = 'resolved',
  CLOSED = 'closed',
  REOPENED = 'reopened',
}

export enum TicketSource {
  PORTAL = 'portal', // raised by client via the client portal
  EMAIL = 'email',
  PHONE = 'phone',
  INTERNAL = 'internal', // raised by staff on behalf of a client
}

/**
 * SLA targets in MINUTES, by priority. Matches the response-time table shown
 * to clients on the "Raise a Ticket" screen (Critical: 1hr, High: 4hr,
 * Medium: 1 business day, Low: 3 business days). Resolution targets are
 * separate and longer — first response is "someone looked at it",
 * resolution is "the issue is actually fixed".
 *
 * These are UK business-hours-naive for now (treats time as continuous,
 * 24/7) — a future iteration should account for Mon-Fri 09:00-17:30 GMT
 * support hours when computing "business day" targets properly. Documented
 * here rather than silently assumed, since it affects every deadline below.
 */
export const SLA_RESPONSE_MINUTES: Record<TicketPriority, number> = {
  [TicketPriority.CRITICAL]: 60, // 1 hour
  [TicketPriority.HIGH]: 4 * 60, // 4 hours
  [TicketPriority.MEDIUM]: 24 * 60, // 1 day
  [TicketPriority.LOW]: 3 * 24 * 60, // 3 days
};

export const SLA_RESOLUTION_MINUTES: Record<TicketPriority, number> = {
  [TicketPriority.CRITICAL]: 4 * 60, // 4 hours
  [TicketPriority.HIGH]: 24 * 60, // 1 day
  [TicketPriority.MEDIUM]: 3 * 24 * 60, // 3 days
  [TicketPriority.LOW]: 7 * 24 * 60, // 7 days
};

@Entity('tickets')
@Index(['tenantId'])
@Index(['tenantId', 'status'])
@Index(['tenantId', 'assignedToId'])
export class Ticket extends BaseEntity {
  @ManyToOne(() => Tenant, { onDelete: 'CASCADE' })
  tenant: Tenant;

  @Column()
  tenantId: string;

  // Human-friendly sequential reference shown to clients, e.g. "KT-0041".
  // Generated in TicketsService.create() from a per-tenant counter.
  @Column()
  reference: string;

  @Column()
  subject: string;

  @Column({ type: 'text' })
  description: string;

  @Column({ type: 'varchar', nullable: true })
  category: string | null; // bug | feature-request | general-support | billing | performance | security

  @Column({ type: 'enum', enum: TicketPriority, default: TicketPriority.MEDIUM })
  priority: TicketPriority;

  @Column({ type: 'enum', enum: TicketStatus, default: TicketStatus.OPEN })
  status: TicketStatus;

  @Column({ type: 'enum', enum: TicketSource, default: TicketSource.PORTAL })
  source: TicketSource;

  @ManyToOne(() => Contact, { nullable: true, onDelete: 'SET NULL' })
  raisedByContact: Contact | null;

  @Column({ type: 'varchar', nullable: true })
  raisedByContactId: string | null;

  @ManyToOne(() => User, { nullable: true })
  raisedByUser: User | null; // set when an internal staff member raises it on a client's behalf

  @Column({ type: 'varchar', nullable: true })
  raisedByUserId: string | null;

  @ManyToOne(() => Company, { nullable: true, onDelete: 'SET NULL' })
  company: Company | null;

  @Column({ type: 'varchar', nullable: true })
  companyId: string | null;

  @ManyToOne(() => User, { nullable: true })
  assignedTo: User | null;

  @Column({ type: 'varchar', nullable: true })
  assignedToId: string | null;

  // ── SLA tracking — computed once at creation/assignment time, then
  // checked against `now()` rather than recalculated, so the deadline
  // doesn't silently shift if the tenant's SLA config changes later. ──
  @Column({ type: 'timestamptz', nullable: true })
  firstResponseDueAt: Date | null;

  @Column({ type: 'timestamptz', nullable: true })
  firstRespondedAt: Date | null;

  @Column({ type: 'timestamptz', nullable: true })
  resolutionDueAt: Date | null;

  @Column({ type: 'timestamptz', nullable: true })
  resolvedAt: Date | null;

  @Column({ default: false })
  slaResponseBreached: boolean;

  @Column({ default: false })
  slaResolutionBreached: boolean;

  @Column({ type: 'timestamptz', nullable: true })
  closedAt: Date | null;

  @Column({ type: 'text', array: true, default: () => "'{}'" })
  tags: string[];

  @ManyToOne(() => User, { nullable: true })
  createdBy: User | null;

  @Column({ type: 'varchar', nullable: true })
  createdById: string | null;
}
