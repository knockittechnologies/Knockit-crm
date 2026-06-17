import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { EventEmitter2 } from '@nestjs/event-emitter';

import {
  Ticket,
  TicketPriority,
  TicketStatus,
  SLA_RESPONSE_MINUTES,
  SLA_RESOLUTION_MINUTES,
} from './entities/ticket.entity';
import { TicketComment } from './entities/ticket-comment.entity';
import {
  CreateTicketDto,
  UpdateTicketDto,
  AssignTicketDto,
  CreateTicketCommentDto,
  QueryTicketsDto,
} from './dto/ticket.dto';
import { PaginatedResult, paginate } from '../../common/types/pagination';

/**
 * Valid status transitions. Unlike leads, tickets can move backwards
 * (waiting_on_client -> in_progress when the client replies, or
 * resolved -> reopened if the fix didn't actually work) so this is a
 * looser graph than the lead pipeline — most states can reach most
 * other states, but a few rules still matter:
 *   - closed tickets can only be reopened, nothing else
 *   - resolved tickets can be reopened or closed
 *   - open tickets must be assigned before moving to in_progress
 */
const TICKET_STATUS_TRANSITIONS: Record<TicketStatus, TicketStatus[]> = {
  [TicketStatus.OPEN]: [TicketStatus.ASSIGNED, TicketStatus.CLOSED],
  [TicketStatus.ASSIGNED]: [
    TicketStatus.IN_PROGRESS,
    TicketStatus.WAITING_ON_CLIENT,
    TicketStatus.CLOSED,
  ],
  [TicketStatus.IN_PROGRESS]: [
    TicketStatus.WAITING_ON_CLIENT,
    TicketStatus.RESOLVED,
    TicketStatus.CLOSED,
  ],
  [TicketStatus.WAITING_ON_CLIENT]: [
    TicketStatus.IN_PROGRESS,
    TicketStatus.RESOLVED,
    TicketStatus.CLOSED,
  ],
  [TicketStatus.RESOLVED]: [TicketStatus.REOPENED, TicketStatus.CLOSED],
  [TicketStatus.CLOSED]: [TicketStatus.REOPENED],
  [TicketStatus.REOPENED]: [
    TicketStatus.ASSIGNED,
    TicketStatus.IN_PROGRESS,
    TicketStatus.CLOSED,
  ],
};

@Injectable()
export class TicketsService {
  constructor(
    @InjectRepository(Ticket) private ticketsRepo: Repository<Ticket>,
    @InjectRepository(TicketComment) private commentsRepo: Repository<TicketComment>,
    private eventEmitter: EventEmitter2,
  ) {}

  // ───────────────────────── Create ─────────────────────────

  async create(
    tenantId: string,
    dto: CreateTicketDto,
    createdById: string | null,
  ): Promise<Ticket> {
    const priority = dto.priority ?? TicketPriority.MEDIUM;
    const reference = await this.generateReference(tenantId);
    const now = new Date();

    const ticket = this.ticketsRepo.create({
      ...dto,
      tenantId,
      reference,
      priority,
      createdById,
      firstResponseDueAt: this.addMinutes(now, SLA_RESPONSE_MINUTES[priority]),
      resolutionDueAt: this.addMinutes(now, SLA_RESOLUTION_MINUTES[priority]),
    });

    const saved = await this.ticketsRepo.save(ticket);

    this.eventEmitter.emit('ticket.created', { tenantId, ticket: saved });
    return saved;
  }

  /**
   * Per-tenant sequential reference like "KT-0041". Counts existing tickets
   * for the tenant rather than maintaining a separate sequence table — fine
   * at this scale; a high-volume tenant would want a DB sequence instead to
   * avoid a race between the count and the insert under concurrent creates.
   */
  private async generateReference(tenantId: string): Promise<string> {
    const count = await this.ticketsRepo.count({ where: { tenantId } });
    const next = count + 1;
    return `KT-${String(next).padStart(4, '0')}`;
  }

  private addMinutes(date: Date, minutes: number): Date {
    return new Date(date.getTime() + minutes * 60_000);
  }

  // ───────────────────────── Read ─────────────────────────

  async findAll(
    tenantId: string,
    query: QueryTicketsDto,
    requester: { userId: string; canViewAll: boolean },
  ): Promise<PaginatedResult<Ticket>> {
    const page = Math.max(parseInt(query.page || '1', 10), 1);
    const limit = Math.min(Math.max(parseInt(query.limit || '20', 10), 1), 100);

    const qb = this.ticketsRepo
      .createQueryBuilder('ticket')
      .leftJoinAndSelect('ticket.company', 'company')
      .leftJoinAndSelect('ticket.raisedByContact', 'contact')
      .where('ticket.tenantId = :tenantId', { tenantId });

    if (!requester.canViewAll) {
      qb.andWhere('ticket.assignedToId = :userId', { userId: requester.userId });
    }
    if (query.status) {
      qb.andWhere('ticket.status = :status', { status: query.status });
    }
    if (query.priority) {
      qb.andWhere('ticket.priority = :priority', { priority: query.priority });
    }
    if (query.assignedToId) {
      qb.andWhere('ticket.assignedToId = :assignedToId', {
        assignedToId: query.assignedToId,
      });
    }
    if (query.search) {
      qb.andWhere(
        '(ticket.subject ILIKE :search OR ticket.reference ILIKE :search)',
        { search: `%${query.search}%` },
      );
    }

    qb.orderBy('ticket.createdAt', 'DESC')
      .skip((page - 1) * limit)
      .take(limit);

    const [data, total] = await qb.getManyAndCount();
    return paginate(data, total, page, limit);
  }

  async findOne(tenantId: string, id: string): Promise<Ticket> {
    const ticket = await this.ticketsRepo.findOne({
      where: { id, tenantId },
      relations: ['company', 'raisedByContact', 'assignedTo'],
    });
    if (!ticket) {
      throw new NotFoundException('Ticket not found');
    }
    return ticket;
  }

  // ───────────────────────── Update ─────────────────────────

  async update(tenantId: string, id: string, dto: UpdateTicketDto): Promise<Ticket> {
    const ticket = await this.findOne(tenantId, id);
    Object.assign(ticket, dto);
    return this.ticketsRepo.save(ticket);
  }

  async assign(tenantId: string, id: string, dto: AssignTicketDto): Promise<Ticket> {
    const ticket = await this.findOne(tenantId, id);
    ticket.assignedToId = dto.assignedToId;
    if (ticket.status === TicketStatus.OPEN) {
      ticket.status = TicketStatus.ASSIGNED;
    }
    const saved = await this.ticketsRepo.save(ticket);
    this.eventEmitter.emit('ticket.assigned', { tenantId, ticket: saved });
    return saved;
  }

  /**
   * Enforces the status graph above, and crucially: the FIRST time a ticket
   * leaves "open"/"assigned" into a state implying someone engaged with it
   * (in_progress, waiting_on_client, resolved), firstRespondedAt is stamped
   * if not already set, and the response-breach flag is computed at that
   * moment — so we capture whether SLA was actually met, not just whether
   * it's currently overdue.
   */
  async changeStatus(
    tenantId: string,
    id: string,
    newStatus: TicketStatus,
  ): Promise<Ticket> {
    const ticket = await this.findOne(tenantId, id);

    const allowed = TICKET_STATUS_TRANSITIONS[ticket.status];
    if (!allowed.includes(newStatus)) {
      throw new BadRequestException(
        `Cannot move ticket from "${ticket.status}" to "${newStatus}". ` +
          `Valid next states: ${allowed.join(', ') || 'none'}.`,
      );
    }

    const now = new Date();
    const previousStatus = ticket.status;
    ticket.status = newStatus;

    const engagementStates = [
      TicketStatus.IN_PROGRESS,
      TicketStatus.WAITING_ON_CLIENT,
      TicketStatus.RESOLVED,
    ];
    if (!ticket.firstRespondedAt && engagementStates.includes(newStatus)) {
      ticket.firstRespondedAt = now;
      ticket.slaResponseBreached = Boolean(
        ticket.firstResponseDueAt && now > ticket.firstResponseDueAt,
      );
    }

    if (newStatus === TicketStatus.RESOLVED) {
      ticket.resolvedAt = now;
      ticket.slaResolutionBreached = Boolean(
        ticket.resolutionDueAt && now > ticket.resolutionDueAt,
      );
    }

    if (newStatus === TicketStatus.CLOSED) {
      ticket.closedAt = now;
    }

    if (newStatus === TicketStatus.REOPENED) {
      // Reopening clears the resolved timestamp but deliberately keeps
      // the original SLA breach flags intact — if it breached once, that
      // history doesn't un-happen just because someone reopened it.
      ticket.resolvedAt = null;
      ticket.closedAt = null;
    }

    const saved = await this.ticketsRepo.save(ticket);

    this.eventEmitter.emit('ticket.status_changed', {
      tenantId,
      ticket: saved,
      previousStatus,
    });

    return saved;
  }

  async remove(tenantId: string, id: string): Promise<void> {
    const ticket = await this.findOne(tenantId, id);
    await this.ticketsRepo.softRemove(ticket);
  }

  // ───────────────────────── SLA helpers ─────────────────────────

  /**
   * Run periodically (intended to be wired to a BullMQ cron job) to flag
   * tickets that have silently breached SLA without anyone changing their
   * status — e.g. a critical ticket nobody has touched in over an hour.
   * Doesn't change ticket status, only flips the breach flags so dashboards
   * and alerts can surface it.
   */
  async detectBreaches(tenantId: string): Promise<{ responseBreaches: number; resolutionBreaches: number }> {
    const now = new Date();

    const responseBreaches = await this.ticketsRepo
      .createQueryBuilder()
      .update(Ticket)
      .set({ slaResponseBreached: true })
      .where('tenantId = :tenantId', { tenantId })
      .andWhere('slaResponseBreached = false')
      .andWhere('firstRespondedAt IS NULL')
      .andWhere('firstResponseDueAt < :now', { now })
      .execute();

    const resolutionBreaches = await this.ticketsRepo
      .createQueryBuilder()
      .update(Ticket)
      .set({ slaResolutionBreached: true })
      .where('tenantId = :tenantId', { tenantId })
      .andWhere('slaResolutionBreached = false')
      .andWhere('resolvedAt IS NULL')
      .andWhere('resolutionDueAt < :now', { now })
      .andWhere('status NOT IN (:...closedStates)', {
        closedStates: [TicketStatus.RESOLVED, TicketStatus.CLOSED],
      })
      .execute();

    return {
      responseBreaches: responseBreaches.affected ?? 0,
      resolutionBreaches: resolutionBreaches.affected ?? 0,
    };
  }

  // ───────────────────────── Comments ─────────────────────────

  async addComment(
    tenantId: string,
    ticketId: string,
    dto: CreateTicketCommentDto,
    author: { userId?: string; contactId?: string },
  ): Promise<TicketComment> {
    await this.findOne(tenantId, ticketId); // 404s if not in tenant

    // A client (contact) can never post an internal note — only staff can.
    if (dto.isInternal && !author.userId) {
      throw new ForbiddenException('Only staff can add internal notes');
    }

    const comment = this.commentsRepo.create({
      tenantId,
      ticketId,
      body: dto.body,
      isInternal: dto.isInternal ?? false,
      authorUserId: author.userId ?? null,
      authorContactId: author.contactId ?? null,
    });
    const saved = await this.commentsRepo.save(comment);

    this.eventEmitter.emit('ticket.comment_added', { tenantId, comment: saved });
    return saved;
  }

  /**
   * `includeInternal` should only ever be true for staff callers — the
   * controller is responsible for checking the tickets.internal-notes
   * permission before passing true here. Defence in depth: even if that
   * check were bypassed, client-portal call sites should always pass false.
   */
  async getComments(
    tenantId: string,
    ticketId: string,
    includeInternal: boolean,
  ): Promise<TicketComment[]> {
    await this.findOne(tenantId, ticketId);

    const where: Record<string, unknown> = { tenantId, ticketId };
    if (!includeInternal) {
      where.isInternal = false;
    }
    return this.commentsRepo.find({
      where,
      order: { createdAt: 'ASC' },
      relations: ['authorUser', 'authorContact'],
    });
  }
}
