import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { BadRequestException, NotFoundException } from '@nestjs/common';
import { Repository } from 'typeorm';

import { AmcService } from '../amc.service';
import { AmcContract, AmcContractStatus } from '../entities/amc-contract.entity';
import { TimeLog } from '../../projects/entities/timelog.entity';

describe('AmcService', () => {
  let service: AmcService;
  let contractsRepo: jest.Mocked<Partial<Repository<AmcContract>>>;
  let timeLogsRepo: jest.Mocked<Partial<Repository<TimeLog>>>;

  const TENANT_ID = 'tenant-1';
  const CONTRACT_ID = 'contract-1';
  const COMPANY_ID = 'company-1';

  function makeContract(overrides: Partial<AmcContract> = {}): AmcContract {
    return {
      id: CONTRACT_ID,
      tenantId: TENANT_ID,
      companyId: COMPANY_ID,
      name: 'Test Contract',
      status: AmcContractStatus.ACTIVE,
      startDate: '2026-01-01',
      currentPeriodEnd: '2026-03-31',
      hoursIncludedPerPeriod: '20.00',
      overageRate: '75.00',
      currency: 'GBP',
      ...overrides,
    } as AmcContract;
  }

  function makeUsageQueryBuilder(total: string) {
    const qb: any = {};
    qb.innerJoin = jest.fn().mockReturnValue(qb);
    qb.select = jest.fn().mockReturnValue(qb);
    qb.where = jest.fn().mockReturnValue(qb);
    qb.andWhere = jest.fn().mockReturnValue(qb);
    qb.getRawOne = jest.fn().mockResolvedValue({ total });
    return qb;
  }

  function makeUpdateQueryBuilder(affected: number) {
    const qb: any = {};
    qb.update = jest.fn().mockReturnValue(qb);
    qb.set = jest.fn().mockReturnValue(qb);
    qb.where = jest.fn().mockReturnValue(qb);
    qb.andWhere = jest.fn().mockReturnValue(qb);
    qb.execute = jest.fn().mockResolvedValue({ affected });
    return qb;
  }

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        AmcService,
        {
          provide: getRepositoryToken(AmcContract),
          useValue: {
            create: jest.fn((d) => d),
            save: jest.fn((e) => Promise.resolve(e)),
            find: jest.fn(),
            findOne: jest.fn(),
            createQueryBuilder: jest.fn(),
            softRemove: jest.fn(),
          },
        },
        {
          provide: getRepositoryToken(TimeLog),
          useValue: { createQueryBuilder: jest.fn() },
        },
      ],
    }).compile();

    service = module.get<AmcService>(AmcService);
    contractsRepo = module.get(getRepositoryToken(AmcContract));
    timeLogsRepo = module.get(getRepositoryToken(TimeLog));
  });

  afterEach(() => jest.clearAllMocks());

  describe('getUsageForContract()', () => {
    it('returns hoursRemaining = included - used when under the limit', async () => {
      (contractsRepo.findOne as jest.Mock).mockResolvedValue(makeContract());
      (timeLogsRepo.createQueryBuilder as jest.Mock).mockReturnValue(
        makeUsageQueryBuilder('6.00'),
      );

      const result = await service.getUsageForContract(TENANT_ID, CONTRACT_ID);

      expect(result.hoursUsedThisPeriod).toBe(6);
      expect(result.hoursRemaining).toBe(14);
      expect(result.isOverage).toBe(false);
    });

    it('correctly handles zero usage (no time logs yet)', async () => {
      (contractsRepo.findOne as jest.Mock).mockResolvedValue(makeContract());
      (timeLogsRepo.createQueryBuilder as jest.Mock).mockReturnValue(
        makeUsageQueryBuilder('0'),
      );

      const result = await service.getUsageForContract(TENANT_ID, CONTRACT_ID);

      expect(result.hoursUsedThisPeriod).toBe(0);
      expect(result.hoursRemaining).toBe(20);
      expect(result.isOverage).toBe(false);
    });

    it('flags isOverage=true and returns a negative hoursRemaining once usage exceeds the included hours', async () => {
      (contractsRepo.findOne as jest.Mock).mockResolvedValue(makeContract());
      (timeLogsRepo.createQueryBuilder as jest.Mock).mockReturnValue(
        makeUsageQueryBuilder('22.00'),
      );

      const result = await service.getUsageForContract(TENANT_ID, CONTRACT_ID);

      expect(result.hoursUsedThisPeriod).toBe(22);
      expect(result.hoursRemaining).toBe(-2);
      expect(result.isOverage).toBe(true);
    });

    it('filters by isAmcHours=true in the underlying query — non-AMC hours must not count', async () => {
      (contractsRepo.findOne as jest.Mock).mockResolvedValue(makeContract());
      const qb = makeUsageQueryBuilder('6.00');
      (timeLogsRepo.createQueryBuilder as jest.Mock).mockReturnValue(qb);

      await service.getUsageForContract(TENANT_ID, CONTRACT_ID);

      expect(qb.andWhere).toHaveBeenCalledWith('log.isAmcHours = true');
    });

    it('scopes the usage query to the contract date range', async () => {
      const contract = makeContract({ startDate: '2026-01-01', currentPeriodEnd: '2026-03-31' });
      (contractsRepo.findOne as jest.Mock).mockResolvedValue(contract);
      const qb = makeUsageQueryBuilder('0');
      (timeLogsRepo.createQueryBuilder as jest.Mock).mockReturnValue(qb);

      await service.getUsageForContract(TENANT_ID, CONTRACT_ID);

      expect(qb.andWhere).toHaveBeenCalledWith('log.date >= :start', { start: '2026-01-01' });
      expect(qb.andWhere).toHaveBeenCalledWith('log.date <= :end', { end: '2026-03-31' });
    });

    it('throws NotFoundException for a contract outside the tenant', async () => {
      (contractsRepo.findOne as jest.Mock).mockResolvedValue(null);
      await expect(
        service.getUsageForContract(TENANT_ID, 'nonexistent'),
      ).rejects.toThrow(NotFoundException);
    });
  });

  describe('renew()', () => {
    it('rejects a new period end that is before or equal to the current one', async () => {
      (contractsRepo.findOne as jest.Mock).mockResolvedValue(
        makeContract({ currentPeriodEnd: '2026-03-31' }),
      );

      await expect(
        service.renew(TENANT_ID, CONTRACT_ID, { newPeriodEnd: '2026-01-01' }),
      ).rejects.toThrow(BadRequestException);

      await expect(
        service.renew(TENANT_ID, CONTRACT_ID, { newPeriodEnd: '2026-03-31' }),
      ).rejects.toThrow(BadRequestException);
    });

    it('extends the period and resets status to active on a valid renewal', async () => {
      (contractsRepo.findOne as jest.Mock).mockResolvedValue(
        makeContract({ status: AmcContractStatus.EXPIRED, currentPeriodEnd: '2026-03-31' }),
      );

      const result = await service.renew(TENANT_ID, CONTRACT_ID, {
        newPeriodEnd: '2026-06-30',
      });

      expect(result.currentPeriodEnd).toBe('2026-06-30');
      expect(result.status).toBe(AmcContractStatus.ACTIVE);
    });
  });

  describe('cancel()', () => {
    it('sets status to cancelled', async () => {
      (contractsRepo.findOne as jest.Mock).mockResolvedValue(makeContract());
      const result = await service.cancel(TENANT_ID, CONTRACT_ID);
      expect(result.status).toBe(AmcContractStatus.CANCELLED);
    });
  });

  describe('detectExpiredContracts()', () => {
    it('flips active contracts whose currentPeriodEnd has passed to expired', async () => {
      const qb = makeUpdateQueryBuilder(2);
      (contractsRepo.createQueryBuilder as jest.Mock).mockReturnValue(qb);

      const count = await service.detectExpiredContracts(TENANT_ID);

      expect(count).toBe(2);
      expect(qb.set).toHaveBeenCalledWith({ status: AmcContractStatus.EXPIRED });
    });

    it('only targets currently active contracts, not already-cancelled ones', async () => {
      const qb = makeUpdateQueryBuilder(0);
      (contractsRepo.createQueryBuilder as jest.Mock).mockReturnValue(qb);

      await service.detectExpiredContracts(TENANT_ID);

      expect(qb.andWhere).toHaveBeenCalledWith('status = :active', {
        active: AmcContractStatus.ACTIVE,
      });
    });
  });
});
