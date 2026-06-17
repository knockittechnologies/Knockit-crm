import { Column, Entity, Index, ManyToOne } from 'typeorm';
import { BaseEntity } from '../../../common/entities/base.entity';
import { Tenant } from '../../tenants/entities/tenant.entity';
import { Company } from '../../companies/entities/company.entity';
import { User } from '../../users/entities/user.entity';

export enum AmcContractStatus {
  ACTIVE = 'active',
  EXPIRED = 'expired',
  CANCELLED = 'cancelled',
}

export enum AmcRenewalCycle {
  MONTHLY = 'monthly',
  QUARTERLY = 'quarterly',
  ANNUAL = 'annual',
}

/**
 * One AMC contract = a bucket of pre-paid support hours for a company,
 * refilled on a renewal cycle. Hours used is computed by summing
 * isAmcHours=true time_logs against this contract's current period rather
 * than incrementally maintained, since "how many hours used this period"
 * depends on which period we're asking about — a contract renews and the
 * bucket resets, so a single cumulative counter would be wrong after the
 * first renewal.
 */
@Entity('amc_contracts')
@Index(['tenantId'])
@Index(['tenantId', 'status'])
export class AmcContract extends BaseEntity {
  @ManyToOne(() => Tenant, { onDelete: 'CASCADE' })
  tenant: Tenant;

  @Column()
  tenantId: string;

  @ManyToOne(() => Company, { onDelete: 'CASCADE' })
  company: Company;

  @Column()
  companyId: string;

  @Column()
  name: string;

  @Column({ type: 'enum', enum: AmcContractStatus, default: AmcContractStatus.ACTIVE })
  status: AmcContractStatus;

  @Column({ type: 'enum', enum: AmcRenewalCycle, default: AmcRenewalCycle.ANNUAL })
  renewalCycle: AmcRenewalCycle;

  @Column({ type: 'date' })
  startDate: string;

  @Column({ type: 'date' })
  currentPeriodEnd: string;

  @Column({ type: 'decimal', precision: 10, scale: 2 })
  hoursIncludedPerPeriod: string;

  @Column({ type: 'decimal', precision: 10, scale: 2, nullable: true })
  overageRate: string | null;

  @Column({ default: 'GBP' })
  currency: string;

  @Column({ type: 'text', nullable: true })
  notes: string | null;

  @ManyToOne(() => User, { nullable: true })
  accountManager: User | null;

  @Column({ type: 'varchar', nullable: true })
  accountManagerId: string | null;
}
