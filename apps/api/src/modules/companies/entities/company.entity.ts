import { Column, Entity, Index, ManyToOne, OneToMany } from 'typeorm';
import { BaseEntity } from '../../../common/entities/base.entity';
import { Tenant } from '../../tenants/entities/tenant.entity';
import { User } from '../../users/entities/user.entity';
import { Contact } from '../../contacts/entities/contact.entity';

export interface CompanyAddress {
  line1?: string;
  line2?: string;
  city?: string;
  county?: string;
  postcode?: string; // UK postcode format, e.g. "EC1A 1BB"
  country?: string;
}

@Entity('companies')
@Index(['tenantId'])
export class Company extends BaseEntity {
  @ManyToOne(() => Tenant, { onDelete: 'CASCADE' })
  tenant: Tenant;

  @Column()
  tenantId: string;

  @Column()
  name: string;

  @Column({ type: 'varchar', nullable: true })
  industry: string | null;

  @Column({ type: 'varchar', nullable: true })
  website: string | null;

  @Column({ type: 'varchar', nullable: true })
  phone: string | null;

  @Column({ type: 'varchar', nullable: true })
  email: string | null;

  @Column({ type: 'jsonb', nullable: true })
  address: CompanyAddress | null;

  @Column({ type: 'varchar', nullable: true })
  size: string | null; // "1-10" | "11-50" | "51-200" | "200+"

  @Column({ type: 'decimal', precision: 15, scale: 2, nullable: true })
  annualRevenue: string | null; // stored as string — TypeORM returns numeric as string to avoid precision loss

  @Column({ default: 'GBP' })
  currency: string;

  @Column({ type: 'varchar', nullable: true })
  logoUrl: string | null;

  @Column({ type: 'varchar', nullable: true })
  vatNumber: string | null; // UK VAT registration number

  @Column({ type: 'varchar', nullable: true })
  companiesHouseNumber: string | null;

  @Column({ type: 'text', nullable: true })
  notes: string | null;

  @Column({ type: 'text', array: true, default: () => "'{}'" })
  tags: string[];

  @Column({ type: 'jsonb', default: {} })
  customFields: Record<string, unknown>;

  @ManyToOne(() => User, { nullable: true })
  createdBy: User | null;

  @Column({ type: 'varchar', nullable: true })
  createdById: string | null;

  @ManyToOne(() => User, { nullable: true })
  assignedTo: User | null;

  @Column({ type: 'varchar', nullable: true })
  assignedToId: string | null;

  @OneToMany(() => Contact, (contact) => contact.company)
  contacts: Contact[];
}
