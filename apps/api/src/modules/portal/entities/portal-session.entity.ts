import { Column, Entity, Index, ManyToOne } from 'typeorm';
import { Exclude } from 'class-transformer';
import { BaseEntity } from '../../../common/entities/base.entity';
import { Contact } from '../../contacts/entities/contact.entity';

/**
 * Mirrors UserSession but for portal (Contact) logins — kept as a separate
 * table rather than reusing UserSession because the two have a different
 * owning entity (Contact vs User) and mixing them would make every staff
 * session query need to filter out client logins and vice versa.
 */
@Entity('portal_sessions')
export class PortalSession extends BaseEntity {
  @ManyToOne(() => Contact, { onDelete: 'CASCADE' })
  contact: Contact;

  @Column()
  contactId: string;

  @Exclude({ toPlainOnly: true })
  @Index({ unique: true })
  @Column()
  refreshTokenHash: string;

  @Column({ type: 'varchar', nullable: true })
  ipAddress: string | null;

  @Column({ type: 'varchar', nullable: true })
  userAgent: string | null;

  @Column({ type: 'timestamptz' })
  expiresAt: Date;

  @Column({ type: 'timestamptz', nullable: true })
  revokedAt: Date | null;
}
