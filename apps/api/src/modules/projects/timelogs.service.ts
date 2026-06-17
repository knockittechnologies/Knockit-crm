import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';

import { TimeLog } from './entities/timelog.entity';
import { CreateTimeLogDto } from './dto/project.dto';
import { ProjectsService } from './projects.service';

@Injectable()
export class TimeLogsService {
  constructor(
    @InjectRepository(TimeLog) private timeLogsRepo: Repository<TimeLog>,
    private projectsService: ProjectsService,
  ) {}

  async create(
    tenantId: string,
    projectId: string,
    dto: CreateTimeLogDto,
    userId: string,
  ): Promise<TimeLog> {
    const timeLog = this.timeLogsRepo.create({
      ...dto,
      tenantId,
      projectId,
      userId,
      isAmcHours: dto.isAmcHours ?? false,
      isBillable: dto.isBillable ?? true,
    });
    const saved = await this.timeLogsRepo.save(timeLog);

    // Keep the project's cached running total in sync. This is a
    // best-effort update — if it fails the time log itself is still saved,
    // since the log entry is the source of truth and loggedHours is a
    // derived convenience field for fast dashboard reads.
    await this.projectsService.addLoggedHours(tenantId, projectId, parseFloat(dto.hours));

    return saved;
  }

  async findAllForProject(tenantId: string, projectId: string): Promise<TimeLog[]> {
    return this.timeLogsRepo.find({
      where: { tenantId, projectId },
      order: { date: 'DESC' },
      relations: ['user', 'task'],
    });
  }

  async findAllForUser(
    tenantId: string,
    userId: string,
    from?: string,
    to?: string,
  ): Promise<TimeLog[]> {
    const qb = this.timeLogsRepo
      .createQueryBuilder('log')
      .where('log.tenantId = :tenantId', { tenantId })
      .andWhere('log.userId = :userId', { userId });

    if (from) qb.andWhere('log.date >= :from', { from });
    if (to) qb.andWhere('log.date <= :to', { to });

    return qb.orderBy('log.date', 'DESC').getMany();
  }

  async remove(tenantId: string, id: string): Promise<void> {
    const log = await this.timeLogsRepo.findOne({ where: { id, tenantId } });
    if (!log) {
      throw new NotFoundException('Time log not found');
    }
    // Reverse the cached total before removing, so loggedHours stays accurate.
    await this.projectsService.addLoggedHours(tenantId, log.projectId, -parseFloat(log.hours));
    await this.timeLogsRepo.softRemove(log);
  }
}
