import { Column, Entity, Index, ManyToOne, OneToMany } from 'typeorm';
import { BaseEntity } from '../../../common/entities/base.entity';
import { Tenant } from '../../tenants/entities/tenant.entity';
import { Article } from './article.entity';

@Entity('kb_categories')
@Index(['tenantId'])
export class KbCategory extends BaseEntity {
  @ManyToOne(() => Tenant, { onDelete: 'CASCADE' })
  tenant: Tenant;

  @Column()
  tenantId: string;

  @Column()
  name: string;

  @Column({ type: 'varchar', nullable: true })
  description: string | null;

  @Column({ type: 'int', default: 0 })
  sortOrder: number;

  // Categories can themselves be client-visible or staff-only — lets
  // internal runbooks and client-facing help docs share one taxonomy
  // without leaking internal categories into the portal's KB view.
  @Column({ default: true })
  isClientVisible: boolean;

  @OneToMany(() => Article, (article) => article.category)
  articles: Article[];
}
