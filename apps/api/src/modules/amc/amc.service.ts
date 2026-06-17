import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';

import { AmcContract, AmcContractStatus } from './entities/amc-contract.entity';
import { TimeLog } from '../projects/entities/timelog.entity';
import { CreateAmcContractDto, UpdateAmcContractDto, RenewAmcContractDto } from './dto/amc.dto';

export interface AmcContractWithUsage {
  contract: AmcContract;
  hoursUsedThisPeriod: number;
  hoursRemaining: number;
  isOverage: boolean;
}

@Injectable()
export class AmcService {
  constructor(
    @InjectRepository(AmcContract) private contractsRepo: Repository<AmcContract>,
    @InjectRepository(TimeLog) private timeLogsRepo: Repository<TimeLog>,
  ) {}

  async create(tenantId: string, dto: CreateAmcContractDto): Promise<AmcContract> {
    const contract = this.contractsRepo.create({ ...dto, tenantId });
    return this.contractsRepo.save(contract);
  }

  async findAll(tenantId: string): Promise<AmcContract[]> {
    return this.contractsRepo.find({
      where: { tenantId },
      relations: ['company'],
      order: { createdAt: 'DESC' },
    });
  }

  async findOne(tenantId: string, id: string): Promise<AmcContract> {
    const contract = await this.contractsRepo.findOne({
      where: { id, tenantId },
      relations: ['company', 'accountManager'],
    });
    if (!contract) {
      throw new NotFoundException('AMC contract not found');
    }
    return contract;
  }

  async update(
    tenantId: string,
    id: string,
    dto: UpdateAmcContractDto,
  ): Promise<AmcContract> {
    const contract = await this.findOne(tenantId, id);
    Object.assign(contract, dto);
    return this.contractsRepo.save(contract);
  }

  /**
   * Computes hours used by summing isAmcHours=true time_logs against this
   * specific company whose date falls within [startDate, currentPeriodEnd].
   * This is what makes "AMC hours remaining" a real, queryable number
   * rather than something that has to be manually tracked in a spreadsheet.
   */
  async getUsageForContract(
    tenantId: string,
    contractId: string,
  ): Promise<AmcContractWithUsage> {
    const contract = await this.findOne(tenantId, contractId);

    const result = await this.timeLogsRepo
      .createQueryBuilder('log')
      .innerJoin('log.project', 'project')
      .select('COALESCE(SUM(log.hours), 0)', 'total')
      .where('log.tenantId = :tenantId', { tenantId })
      .andWhere('project.companyId = :companyId', { companyId: contract.companyId })
      .andWhere('log.isAmcHours = true')
      .andWhere('log.date >= :start', { start: contract.startDate })
      .andWhere('log.date <= :end', { end: contract.currentPeriodEnd })
      .getRawOne();

    const hoursUsedThisPeriod = parseFloat(result?.total ?? '0');
    const hoursIncluded = parseFloat(contract.hoursIncludedPerPeriod);
    const hoursRemaining = hoursIncluded - hoursUsedThisPeriod;

    return {
      contract,
      hoursUsedThisPeriod,
      hoursRemaining, // deliberately allowed to go negative — that IS the overage signal
      isOverage: hoursUsedThisPeriod > hoursIncluded,
    };
  }

  /**
   * Advances the contract to a new period end date. Deliberately does NOT
   * reset any counter, because there is no counter to reset — usage is
   * always computed live from time_logs within [startDate, currentPeriodEnd],
   * so moving currentPeriodEnd forward is the entire renewal operation.
   */
  async renew(
    tenantId: string,
    id: string,
    dto: RenewAmcContractDto,
  ): Promise<AmcContract> {
    const contract = await this.findOne(tenantId, id);

    if (new Date(dto.newPeriodEnd) <= new Date(contract.currentPeriodEnd)) {
      throw new BadRequestException(
        'New period end must be after the current period end',
      );
    }

    contract.currentPeriodEnd = dto.newPeriodEnd;
    contract.status = AmcContractStatus.ACTIVE;
    return this.contractsRepo.save(contract);
  }

  async cancel(tenantId: string, id: string): Promise<AmcContract> {
    const contract = await this.findOne(tenantId, id);
    contract.status = AmcContractStatus.CANCELLED;
    return this.contractsRepo.save(contract);
  }

  /**
   * Sweep intended for a periodic job (mirrors TicketsService.detectBreaches):
   * flags any contract whose currentPeriodEnd has passed without being
   * renewed as expired, so dashboards can surface it rather than silently
   * keeping a lapsed contract showing as "active".
   */
  async detectExpiredContracts(tenantId: string): Promise<number> {
    const result = await this.contractsRepo
      .createQueryBuilder()
      .update(AmcContract)
      .set({ status: AmcContractStatus.EXPIRED })
      .where('tenantId = :tenantId', { tenantId })
      .andWhere('status = :active', { active: AmcContractStatus.ACTIVE })
      .andWhere('"currentPeriodEnd" < CURRENT_DATE')
      .execute();

    return result.affected ?? 0;
  }

  async remove(tenantId: string, id: string): Promise<void> {
    const contract = await this.findOne(tenantId, id);
    await this.contractsRepo.softRemove(contract);
  }
}
