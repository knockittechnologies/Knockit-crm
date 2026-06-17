import { ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';

import { Ticket, TicketSource } from '../tickets/entities/ticket.entity';
import { TicketComment } from '../tickets/entities/ticket-comment.entity';
import { Project } from '../projects/entities/project.entity';
import { Approval, ApprovalStatus } from './entities/approval.entity';
import { CreateTicketDto } from '../tickets/dto/ticket.dto';
import { TicketsService } from '../tickets/tickets.service';
import { KnowledgeBaseService } from '../knowledge-base/knowledge-base.service';
import { QueryArticlesDto } from '../knowledge-base/dto/kb.dto';
import { AmcService } from '../amc/amc.service';

interface PortalScope {
  tenantId: string;
  companyId: string | null;
  contactId: string;
}

@Injectable()
export class PortalService {
  constructor(
    @InjectRepository(Ticket) private ticketsRepo: Repository<Ticket>,
    @InjectRepository(TicketComment) private commentsRepo: Repository<TicketComment>,
    @InjectRepository(Project) private projectsRepo: Repository<Project>,
    @InjectRepository(Approval) private approvalsRepo: Repository<Approval>,
    private ticketsService: TicketsService,
    private kbService: KnowledgeBaseService,
    private amcService: AmcService,
  ) {}

  /**
   * Every method here takes a PortalScope rather than just a tenantId,
   * because the portal's isolation boundary is narrower than the staff
   * side's: a contact must only ever see data belonging to THEIR company,
   * not the whole tenant. A contact with no companyId set sees nothing —
   * fail closed, never fail open, if that link is somehow missing.
   */
  private requireCompanyScope(scope: PortalScope): string {
    if (!scope.companyId) {
      throw new ForbiddenException('Your account is not linked to a company');
    }
    return scope.companyId;
  }

  // ───────────────────────── Tickets ─────────────────────────

  async raiseTicket(scope: PortalScope, dto: CreateTicketDto) {
    const companyId = this.requireCompanyScope(scope);
    return this.ticketsService.create(
      scope.tenantId,
      {
        ...dto,
        companyId,
        raisedByContactId: scope.contactId,
        source: TicketSource.PORTAL,
      },
      null,
    );
  }

  async getTickets(scope: PortalScope) {
    const companyId = this.requireCompanyScope(scope);
    return this.ticketsRepo.find({
      where: { tenantId: scope.tenantId, companyId },
      order: { createdAt: 'DESC' },
    });
  }

  async getTicket(scope: PortalScope, ticketId: string) {
    const companyId = this.requireCompanyScope(scope);
    const ticket = await this.ticketsRepo.findOne({
      where: { id: ticketId, tenantId: scope.tenantId, companyId },
    });
    if (!ticket) {
      // Deliberately the same 404 whether the ticket doesn't exist or
      // belongs to a different company — never confirm to a client that a
      // ticket ID exists outside their own scope.
      throw new NotFoundException('Ticket not found');
    }
    return ticket;
  }

  async getTicketComments(scope: PortalScope, ticketId: string) {
    await this.getTicket(scope, ticketId); // enforces company scope, 404s otherwise
    // Clients NEVER see internal notes — this is hardcoded false, not
    // permission-derived, because there is no permission check on the
    // portal side that could ever flip it to true.
    return this.commentsRepo.find({
      where: { tenantId: scope.tenantId, ticketId, isInternal: false },
      order: { createdAt: 'ASC' },
    });
  }

  async addTicketReply(scope: PortalScope, ticketId: string, body: string) {
    await this.getTicket(scope, ticketId);
    return this.ticketsService.addComment(
      scope.tenantId,
      ticketId,
      { body, isInternal: false },
      { contactId: scope.contactId },
    );
  }

  // ───────────────────────── Projects ─────────────────────────

  async getProjects(scope: PortalScope) {
    const companyId = this.requireCompanyScope(scope);
    return this.projectsRepo.find({
      where: { tenantId: scope.tenantId, companyId },
      relations: ['milestones'],
      order: { createdAt: 'DESC' },
    });
  }

  async getProject(scope: PortalScope, projectId: string) {
    const companyId = this.requireCompanyScope(scope);
    const project = await this.projectsRepo.findOne({
      where: { id: projectId, tenantId: scope.tenantId, companyId },
      relations: ['milestones', 'tasks'],
    });
    if (!project) {
      throw new NotFoundException('Project not found');
    }
    return project;
  }

  // ───────────────────────── Approvals ─────────────────────────

  async getApprovals(scope: PortalScope) {
    const companyId = this.requireCompanyScope(scope);
    // Approvals link to a project, which links to a company — join through
    // rather than storing companyId directly on Approval, since "which
    // company can see this" is fully determined by which project it's on.
    return this.approvalsRepo
      .createQueryBuilder('approval')
      .innerJoin('approval.project', 'project')
      .where('approval.tenantId = :tenantId', { tenantId: scope.tenantId })
      .andWhere('project.companyId = :companyId', { companyId })
      .orderBy('approval.createdAt', 'DESC')
      .getMany();
  }

  async respondToApproval(
    scope: PortalScope,
    approvalId: string,
    status: ApprovalStatus.APPROVED | ApprovalStatus.REVISION_REQUESTED,
    notes?: string,
  ) {
    const companyId = this.requireCompanyScope(scope);

    const approval = await this.approvalsRepo
      .createQueryBuilder('approval')
      .innerJoin('approval.project', 'project')
      .where('approval.id = :approvalId', { approvalId })
      .andWhere('approval.tenantId = :tenantId', { tenantId: scope.tenantId })
      .andWhere('project.companyId = :companyId', { companyId })
      .getOne();

    if (!approval) {
      throw new NotFoundException('Approval not found');
    }
    if (approval.status !== ApprovalStatus.PENDING) {
      throw new ForbiddenException('This approval has already been responded to');
    }

    approval.status = status;
    approval.responseNotes = notes ?? null;
    approval.respondedByContactId = scope.contactId;
    approval.respondedAt = new Date();

    return this.approvalsRepo.save(approval);
  }

  // ───────────────────────── Knowledge Base ─────────────────────────
  // Tenant-wide, not company-scoped — once an article is published and
  // marked client-visible, every client of that tenant can read it. No
  // requireCompanyScope() call here deliberately; KB access doesn't depend
  // on having a company link the way tickets/projects/approvals do.

  async getKbArticles(scope: PortalScope, query: QueryArticlesDto) {
    return this.kbService.findAllArticles(scope.tenantId, query, { clientVisibleOnly: true });
  }

  async getKbArticle(scope: PortalScope, articleId: string) {
    return this.kbService.findOneArticleForClient(scope.tenantId, articleId);
  }

  // ───────────────────────── AMC ─────────────────────────

  async getAmcContracts(scope: PortalScope) {
    const companyId = this.requireCompanyScope(scope);
    const allContracts = await this.amcService.findAll(scope.tenantId);
    // findAll() is tenant-wide (it's a staff-facing method by default) —
    // filter to this contact's company here rather than adding a
    // company-scoped variant to AmcService that nothing else needs yet.
    const companyContracts = allContracts.filter((c) => c.companyId === companyId);

    return Promise.all(
      companyContracts.map((c) => this.amcService.getUsageForContract(scope.tenantId, c.id)),
    );
  }
}
