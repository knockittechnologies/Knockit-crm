import {
  CreateDateColumn,
  DeleteDateColumn,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';

/**
 * Every entity in the system extends this. Gives us:
 * - UUID primary key (never sequential ints — avoids enumeration attacks
 *   and makes multi-tenant ID collisions across shards impossible)
 * - created/updated timestamps automatically
 * - soft delete (deletedAt) so nothing is ever truly destroyed by accident;
 *   audit logs can always reference a row that still technically exists
 */
export abstract class BaseEntity {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @CreateDateColumn({ type: 'timestamptz' })
  createdAt: Date;

  @UpdateDateColumn({ type: 'timestamptz' })
  updatedAt: Date;

  @DeleteDateColumn({ type: 'timestamptz', nullable: true })
  deletedAt: Date | null;
}
