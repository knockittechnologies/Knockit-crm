import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { EventEmitter2 } from '@nestjs/event-emitter';

import { Lead, LeadStatus, LEAD_STATUS_TRANSITIONS } from './entities/lead.entity';
import { LeadActivity, LeadActivityType } from './entities/lead-activity.entity';
import { LeadFollowUp, FollowUpStatus } from './entities/lead-followup.entity';
import {
  CreateLeadDto,
  UpdateLeadDto,
  QueryLeadsDto,
  ChangeLeadStatusDto,
  CreateLeadActivityDto,
  CreateLeadFollowUpDto,
} from './dto/lead.dto';
import { PaginatedResult, paginate } from '../../common/types/pagination';

@Injectable()
export class LeadsService {
  constructor(
    @InjectRepository(Lead) private leadsRepo: Repository<Lead>,
    @InjectRepository(LeadActivity) private activitiesRepo: Repository<LeadActivity>,
    @InjectRepository(LeadFollowUp) private followUpsRepo: Repository<LeadFollowUp>,
    private eventEmitter: EventEmitter2,
  ) {}

  async create(
    tenantId: string,
    dto: CreateLeadDto,
    createdById: string,
  ): Promise<Lead> {
    const lead = this.leadsRepo.create({
      ...dto,
      tenantId,
      createdById,
      assignedToId: dto.assignedToId ?? createdById, // defaults to whoever creates it
    });
    const saved = await this.leadsRepo.save(lead);

    await this.logActivity(tenantId, saved.id, createdById, {
      type: LeadActivityType.NOTE,
      title: 'Lead created',
      description: `Lead "${saved.title}" was created.`,
    });

    this.eventEmitter.emit('lead.created', { tenantId, lead: saved });
    return saved;
  }

  async findAll(
    tenantId: string,
    query: QueryLeadsDto,
    requester: { userId: string; canViewAll: boolean },
  ): Promise<PaginatedResult<Lead>> {
    const page = Math.max(parseInt(query.page || '1', 10), 1);
    const limit = Math.min(Math.max(parseInt(query.limit || '20', 10), 1), 100);

    const qb = this.leadsRepo
      .createQueryBuilder('lead')
      .leftJoinAndSelect('lead.contact', 'contact')
      .leftJoinAndSelect('lead.company', 'company')
      .where('lead.tenantId = :tenantId', { tenantId });

    // Staff with only leads.view-assigned (not leads.view-all) only ever see
    // their own leads — enforced here in addition to the permission check on
    // the route, so "assigned" really means assigned even if a future bug
    // calls this service method directly from somewhere else.
    if (!requester.canViewAll) {
      qb.andWhere('lead.assignedToId = :userId', { userId: requester.userId });
    }

    if (query.status) {
      qb.andWhere('lead.status = :status', { status: query.status });
    }
    if (query.assignedToId) {
      qb.andWhere('lead.assignedToId = :assignedToId', {
        assignedToId: query.assignedToId,
      });
    }
    if (query.search) {
      qb.andWhere('lead.title ILIKE :search', { search: `%${query.search}%` });
    }

    qb.orderBy('lead.createdAt', 'DESC')
      .skip((page - 1) * limit)
      .take(limit);

    const [data, total] = await qb.getManyAndCount();
    return paginate(data, total, page, limit);
  }

  async findOne(tenantId: string, id: string): Promise<Lead> {
    const lead = await this.leadsRepo.findOne({
      where: { id, tenantId },
      relations: ['contact', 'company', 'assignedTo'],
    });
    if (!lead) {
      throw new NotFoundException('Lead not found');
    }
    return lead;
  }

  async update(tenantId: string, id: string, dto: UpdateLeadDto): Promise<Lead> {
    const lead = await this.findOne(tenantId, id);
    Object.assign(lead, dto);
    return this.leadsRepo.save(lead);
  }

  /**
   * Enforces the pipeline flow designed earlier:
   * New → Contacted → Requirement Gathering → Proposal Sent → Negotiation → Won
   * with Lost reachable from any non-terminal stage, and a reason mandatory
   * when marking Lost. Skipping stages or moving backwards is rejected.
   */
  async changeStatus(
    tenantId: string,
    id: string,
    dto: ChangeLeadStatusDto,
    userId: string,
  ): Promise<Lead> {
    const lead = await this.findOne(tenantId, id);

    const allowedNextStates = LEAD_STATUS_TRANSITIONS[lead.status];
    if (!allowedNextStates.includes(dto.status)) {
      throw new BadRequestException(
        `Cannot move lead from "${lead.status}" to "${dto.status}". ` +
          `Valid next states: ${allowedNextStates.join(', ') || 'none — this is a terminal state'}.`,
      );
    }

    const previousStatus = lead.status;
    lead.status = dto.status;

    if (dto.status === LeadStatus.LOST) {
      lead.lostReason = dto.lostReason ?? null;
      lead.lostAt = new Date();
    }
    if (dto.status === LeadStatus.WON) {
      lead.wonAt = new Date();
    }

    const saved = await this.leadsRepo.save(lead);

    await this.logActivity(tenantId, lead.id, userId, {
      type: LeadActivityType.STATUS_CHANGE,
      title: `Status changed: ${previousStatus} → ${dto.status}`,
      description: dto.lostReason ? `Reason: ${dto.lostReason}` : undefined,
      metadata: { from: previousStatus, to: dto.status },
    });

    this.eventEmitter.emit('lead.status_changed', {
      tenantId,
      lead: saved,
      previousStatus,
    });

    if (dto.status === LeadStatus.WON) {
      // Project creation from a won lead is handled by the Projects module,
      // which listens for this event — see ProjectsModule's lead.won handler.
      this.eventEmitter.emit('lead.won', { tenantId, lead: saved });
    }

    return saved;
  }

  async remove(tenantId: string, id: string): Promise<void> {
    const lead = await this.findOne(tenantId, id);
    await this.leadsRepo.softRemove(lead);
  }

  // ───────────────────────── Activities ─────────────────────────

  async logActivity(
    tenantId: string,
    leadId: string,
    userId: string | null,
    dto: CreateLeadActivityDto,
  ): Promise<LeadActivity> {
    const activity = this.activitiesRepo.create({
      ...dto,
      tenantId,
      leadId,
      userId,
      scheduledAt: dto.scheduledAt ? new Date(dto.scheduledAt) : null,
      completedAt: dto.completedAt ? new Date(dto.completedAt) : null,
    });
    return this.activitiesRepo.save(activity);
  }

  async getActivities(tenantId: string, leadId: string): Promise<LeadActivity[]> {
    await this.findOne(tenantId, leadId); // 404s if lead doesn't belong to tenant
    return this.activitiesRepo.find({
      where: { tenantId, leadId },
      order: { createdAt: 'DESC' },
      relations: ['user'],
    });
  }

  // ───────────────────────── Follow-ups ─────────────────────────

  async createFollowUp(
    tenantId: string,
    leadId: string,
    dto: CreateLeadFollowUpDto,
    createdById: string,
  ): Promise<LeadFollowUp> {
    await this.findOne(tenantId, leadId);

    const followUp = this.followUpsRepo.create({
      ...dto,
      tenantId,
      leadId,
      createdById,
      dueDate: new Date(dto.dueDate),
    });
    const saved = await this.followUpsRepo.save(followUp);

    this.eventEmitter.emit('lead.followup_scheduled', { tenantId, followUp: saved });
    return saved;
  }

  async completeFollowUp(
    tenantId: string,
    followUpId: string,
  ): Promise<LeadFollowUp> {
    const followUp = await this.followUpsRepo.findOne({
      where: { id: followUpId, tenantId },
    });
    if (!followUp) {
      throw new NotFoundException('Follow-up not found');
    }
    followUp.status = FollowUpStatus.COMPLETED;
    followUp.completedAt = new Date();
    return this.followUpsRepo.save(followUp);
  }

  async getDueFollowUps(tenantId: string, userId?: string): Promise<LeadFollowUp[]> {
    const qb = this.followUpsRepo
      .createQueryBuilder('f')
      .leftJoinAndSelect('f.lead', 'lead')
      .where('f.tenantId = :tenantId', { tenantId })
      .andWhere('f.status = :status', { status: FollowUpStatus.PENDING })
      .andWhere('f.dueDate <= :now', { now: new Date() });

    if (userId) {
      qb.andWhere('f.assignedToId = :userId', { userId });
    }
    return qb.orderBy('f.dueDate', 'ASC').getMany();
  }
}
