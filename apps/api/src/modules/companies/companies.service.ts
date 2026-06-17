import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Company } from './entities/company.entity';
import { CreateCompanyDto, UpdateCompanyDto, QueryCompaniesDto } from './dto/company.dto';
import { PaginatedResult, paginate } from '../../common/types/pagination';

@Injectable()
export class CompaniesService {
  constructor(
    @InjectRepository(Company) private companiesRepo: Repository<Company>,
  ) {}

  async create(
    tenantId: string,
    dto: CreateCompanyDto,
    createdById: string,
  ): Promise<Company> {
    const company = this.companiesRepo.create({
      ...dto,
      tenantId,
      createdById,
    });
    return this.companiesRepo.save(company);
  }

  async findAll(
    tenantId: string,
    query: QueryCompaniesDto,
  ): Promise<PaginatedResult<Company>> {
    const page = Math.max(parseInt(query.page || '1', 10), 1);
    const limit = Math.min(Math.max(parseInt(query.limit || '20', 10), 1), 100);

    const qb = this.companiesRepo
      .createQueryBuilder('company')
      .where('company.tenantId = :tenantId', { tenantId });

    if (query.search) {
      qb.andWhere(
        '(company.name ILIKE :search OR company.email ILIKE :search)',
        { search: `%${query.search}%` },
      );
    }
    if (query.assignedToId) {
      qb.andWhere('company.assignedToId = :assignedToId', {
        assignedToId: query.assignedToId,
      });
    }

    qb.orderBy('company.createdAt', 'DESC')
      .skip((page - 1) * limit)
      .take(limit);

    const [data, total] = await qb.getManyAndCount();

    return paginate(data, total, page, limit);
  }

  async findOne(tenantId: string, id: string): Promise<Company> {
    const company = await this.companiesRepo.findOne({
      where: { id, tenantId },
      relations: ['contacts'],
    });
    if (!company) {
      throw new NotFoundException('Company not found');
    }
    return company;
  }

  async update(
    tenantId: string,
    id: string,
    dto: UpdateCompanyDto,
  ): Promise<Company> {
    const company = await this.findOne(tenantId, id);
    Object.assign(company, dto);
    return this.companiesRepo.save(company);
  }

  async remove(tenantId: string, id: string): Promise<void> {
    const company = await this.findOne(tenantId, id);
    await this.companiesRepo.softRemove(company);
  }
}
