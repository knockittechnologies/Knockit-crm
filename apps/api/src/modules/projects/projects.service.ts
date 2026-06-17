import { Injectable, Logger, NotFoundException, BadRequestException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { OnEvent } from '@nestjs/event-emitter';
import { EventEmitter2 } from '@nestjs/event-emitter';

import { Project, ProjectStatus, PROJECT_STATUS_TRANSITIONS } from './entities/project.entity';
import { Lead } from '../leads/entities/lead.entity';
import {
  CreateProjectDto,
  UpdateProjectDto,
  QueryProjectsDto,
} from './dto/project.dto';
import { PaginatedResult, paginate } from '../../common/types/pagination';

@Injectable()
export class ProjectsService {
  private readonly logger = new Logger(ProjectsService.name);

  constructor(
    @InjectRepository(Project) private projectsRepo: Repository<Project>,
    private eventEmitter: EventEmitter2,
  ) {}

  async create(
    tenantId: string,
    dto: CreateProjectDto,
    createdById: string,
  ): Promise<Project> {
    const project = this.projectsRepo.create({
      ...dto,
      tenantId,
      createdById,
      teamMemberIds: dto.teamMemberIds ?? [],
    });
    const saved = await this.projectsRepo.save(project);
    this.eventEmitter.emit('project.created', { tenantId, project: saved });
    return saved;
  }

  async findAll(
    tenantId: string,
    query: QueryProjectsDto,
    requester: { userId: string; canViewAll: boolean },
  ): Promise<PaginatedResult<Project>> {
    const page = Math.max(parseInt(query.page || '1', 10), 1);
    const limit = Math.min(Math.max(parseInt(query.limit || '20', 10), 1), 100);

    const qb = this.projectsRepo
      .createQueryBuilder('project')
      .leftJoinAndSelect('project.company', 'company')
      .where('project.tenantId = :tenantId', { tenantId });

    if (!requester.canViewAll) {
      // "view-own" means: I'm the PM, OR I'm a team member on it.
      qb.andWhere(
        '(project.projectManagerId = :userId OR :userId = ANY(project.teamMemberIds))',
        { userId: requester.userId },
      );
    }
    if (query.status) {
      qb.andWhere('project.status = :status', { status: query.status });
    }
    if (query.companyId) {
      qb.andWhere('project.companyId = :companyId', { companyId: query.companyId });
    }
    if (query.search) {
      qb.andWhere('project.name ILIKE :search', { search: `%${query.search}%` });
    }

    qb.orderBy('project.createdAt', 'DESC')
      .skip((page - 1) * limit)
      .take(limit);

    const [data, total] = await qb.getManyAndCount();
    return paginate(data, total, page, limit);
  }

  async findOne(tenantId: string, id: string): Promise<Project> {
    const project = await this.projectsRepo.findOne({
      where: { id, tenantId },
      relations: ['company', 'tasks', 'milestones', 'projectManager'],
    });
    if (!project) {
      throw new NotFoundException('Project not found');
    }
    return project;
  }

  async update(tenantId: string, id: string, dto: UpdateProjectDto): Promise<Project> {
    const project = await this.findOne(tenantId, id);
    Object.assign(project, dto);
    return this.projectsRepo.save(project);
  }

  async changeStatus(
    tenantId: string,
    id: string,
    newStatus: ProjectStatus,
  ): Promise<Project> {
    const project = await this.findOne(tenantId, id);

    const allowed = PROJECT_STATUS_TRANSITIONS[project.status];
    if (!allowed.includes(newStatus)) {
      throw new BadRequestException(
        `Cannot move project from "${project.status}" to "${newStatus}". ` +
          `Valid next states: ${allowed.join(', ') || 'none — this is a terminal state'}.`,
      );
    }

    const previousStatus = project.status;
    project.status = newStatus;

    if (newStatus === ProjectStatus.COMPLETED) {
      project.actualEndDate = new Date().toISOString().slice(0, 10);
      project.progressPercent = 100;
    }

    const saved = await this.projectsRepo.save(project);
    this.eventEmitter.emit('project.status_changed', {
      tenantId,
      project: saved,
      previousStatus,
    });
    return saved;
  }

  async remove(tenantId: string, id: string): Promise<void> {
    const project = await this.findOne(tenantId, id);
    await this.projectsRepo.softRemove(project);
  }

  async addLoggedHours(tenantId: string, projectId: string, hours: number): Promise<void> {
    await this.projectsRepo
      .createQueryBuilder()
      .update(Project)
      .set({ loggedHours: () => `"loggedHours" + ${hours}` })
      .where('id = :projectId AND "tenantId" = :tenantId', { projectId, tenantId })
      .execute();
  }

  /**
   * Listens for the event LeadsService emits when a lead's status becomes
   * "won" (see LeadsService.changeStatus). This is what actually closes the
   * loop the lead pipeline was designed around: winning a deal should
   * produce a project automatically, not require someone to remember to
   * create one by hand.
   *
   * Deliberately defensive: if anything about the lead is missing or this
   * fails, it logs rather than throwing — a failure here must never roll
   * back the lead-won transaction that already completed successfully.
   */
  @OnEvent('lead.won')
  async handleLeadWon(payload: { tenantId: string; lead: Lead }) {
    try {
      const { tenantId, lead } = payload;
      const project = this.projectsRepo.create({
        tenantId,
        name: lead.title,
        description: lead.description,
        companyId: lead.companyId,
        originLeadId: lead.id,
        budget: lead.estimatedValue,
        currency: lead.currency,
        status: ProjectStatus.PLANNING,
        projectManagerId: lead.assignedToId,
        teamMemberIds: [],
      });
      const saved = await this.projectsRepo.save(project);
      this.logger.log(
        `Auto-created project "${saved.name}" (${saved.id}) from won lead ${lead.id}`,
      );
      this.eventEmitter.emit('project.created', { tenantId, project: saved, fromLead: true });
    } catch (err) {
      this.logger.error(
        `Failed to auto-create project from won lead ${payload.lead?.id}`,
        err instanceof Error ? err.stack : String(err),
      );
    }
  }
}
