import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';

import { Milestone, MilestoneStatus } from './entities/milestone.entity';
import { CreateMilestoneDto, UpdateMilestoneDto } from './dto/project.dto';

@Injectable()
export class MilestonesService {
  constructor(
    @InjectRepository(Milestone) private milestonesRepo: Repository<Milestone>,
  ) {}

  async create(
    tenantId: string,
    projectId: string,
    dto: CreateMilestoneDto,
  ): Promise<Milestone> {
    const milestone = this.milestonesRepo.create({ ...dto, tenantId, projectId });
    return this.milestonesRepo.save(milestone);
  }

  async findAllForProject(tenantId: string, projectId: string): Promise<Milestone[]> {
    return this.milestonesRepo.find({
      where: { tenantId, projectId },
      order: { sortOrder: 'ASC', dueDate: 'ASC' },
    });
  }

  async findOne(tenantId: string, id: string): Promise<Milestone> {
    const milestone = await this.milestonesRepo.findOne({ where: { id, tenantId } });
    if (!milestone) {
      throw new NotFoundException('Milestone not found');
    }
    return milestone;
  }

  async update(tenantId: string, id: string, dto: UpdateMilestoneDto): Promise<Milestone> {
    const milestone = await this.findOne(tenantId, id);
    Object.assign(milestone, dto);
    return this.milestonesRepo.save(milestone);
  }

  async changeStatus(
    tenantId: string,
    id: string,
    status: MilestoneStatus,
  ): Promise<Milestone> {
    const milestone = await this.findOne(tenantId, id);
    milestone.status = status;
    milestone.completedAt = status === MilestoneStatus.COMPLETED ? new Date() : null;
    return this.milestonesRepo.save(milestone);
  }

  async remove(tenantId: string, id: string): Promise<void> {
    const milestone = await this.findOne(tenantId, id);
    await this.milestonesRepo.softRemove(milestone);
  }
}
