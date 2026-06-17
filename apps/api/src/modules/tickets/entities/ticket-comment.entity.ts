import { Column, Entity, Index, ManyToOne } from 'typeorm';
import { BaseEntity } from '../../../common/entities/base.entity';
import { Tenant } from '../../tenants/entities/tenant.entity';
import { Ticket } from './ticket.entity';
import { User } from '../../users/entities/user.entity';
import { Contact } from '../../contacts/entities/contact.entity';

@Entity('ticket_comments')
@Index(['tenantId'])
@Index(['ticketId'])
export class TicketComment extends BaseEntity {
  @ManyToOne(() => Tenant, { onDelete: 'CASCADE' })
  tenant: Tenant;

  @Column()
  tenantId: string;

  @ManyToOne(() => Ticket, { onDelete: 'CASCADE' })
  ticket: Ticket;

  @Column()
  ticketId: string;

  @Column({ type: 'text' })
  body: string;

  // Internal notes are only ever visible to staff (tickets.internal-notes
  // permission gates both writing AND reading these in the service layer).
  // Client-visible replies are what the client portal shows.
  @Column({ default: false })
  isInternal: boolean;

  @ManyToOne(() => User, { nullable: true })
  authorUser: User | null;

  @Column({ type: 'varchar', nullable: true })
  authorUserId: string | null;

  @ManyToOne(() => Contact, { nullable: true })
  authorContact: Contact | null; // set when the client replies via the portal

  @Column({ type: 'varchar', nullable: true })
  authorContactId: string | null;

  @Column({ type: 'jsonb', default: () => "'[]'" })
  attachments: Array<{ fileName: string; url: string; sizeBytes: number }>;
}
