import { Column, Entity, Index, ManyToOne } from 'typeorm';
import { BaseEntity } from '../../../common/entities/base.entity';
import { Tenant } from '../../tenants/entities/tenant.entity';
import { KbCategory } from './kb-category.entity';
import { User } from '../../users/entities/user.entity';

export enum ArticleStatus {
  DRAFT = 'draft',
  PUBLISHED = 'published',
  ARCHIVED = 'archived',
}

@Entity('kb_articles')
@Index(['tenantId'])
@Index(['tenantId', 'status'])
export class Article extends BaseEntity {
  @ManyToOne(() => Tenant, { onDelete: 'CASCADE' })
  tenant: Tenant;

  @Column()
  tenantId: string;

  @ManyToOne(() => KbCategory, (category) => category.articles, {
    nullable: true,
    onDelete: 'SET NULL',
  })
  category: KbCategory | null;

  @Column({ type: 'varchar', nullable: true })
  categoryId: string | null;

  @Column()
  title: string;

  @Column({ unique: true })
  slug: string;

  @Column({ type: 'text' })
  content: string; // markdown

  @Column({ type: 'text', nullable: true })
  excerpt: string | null;

  @Column({ type: 'enum', enum: ArticleStatus, default: ArticleStatus.DRAFT })
  status: ArticleStatus;

  // Mirrors the category-level flag but at article granularity, since a
  // staff-only category could still contain one article worth surfacing
  // to clients (or vice versa) — the more specific flag wins.
  @Column({ default: true })
  isClientVisible: boolean;

  @Column({ type: 'int', default: 0 })
  viewCount: number;

  @Column({ type: 'text', array: true, default: () => "'{}'" })
  tags: string[];

  @ManyToOne(() => User, { nullable: true })
  author: User | null;

  @Column({ type: 'varchar', nullable: true })
  authorId: string | null;

  @Column({ type: 'timestamptz', nullable: true })
  publishedAt: Date | null;
}
