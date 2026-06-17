import { Column, Entity, Index, ManyToOne } from 'typeorm';
import { Exclude } from 'class-transformer';
import { BaseEntity } from '../../../common/entities/base.entity';
import { User } from '../../users/entities/user.entity';

/**
 * One row per active refresh token / device session. Storing these in the
 * DB (rather than trusting a stateless JWT alone) is what lets us revoke
 * a single device's session, enforce a max concurrent session count, and
 * show "active sessions" in account settings.
 */
@Entity('user_sessions')
export class UserSession extends BaseEntity {
  @ManyToOne(() => User, { onDelete: 'CASCADE' })
  user: User;

  @Column()
  userId: string;

  @Exclude({ toPlainOnly: true })
  @Index({ unique: true })
  @Column()
  refreshTokenHash: string; // store a hash, never the raw token

  @Column({ type: 'jsonb', nullable: true })
  deviceInfo: Record<string, unknown> | null;

  @Column({ type: 'varchar', nullable: true })
  ipAddress: string | null;

  @Column({ type: 'varchar', nullable: true })
  userAgent: string | null;

  @Column({ type: 'timestamptz' })
  expiresAt: Date;

  @Column({ type: 'timestamptz', nullable: true })
  revokedAt: Date | null;
}
