import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { ForbiddenException, NotFoundException } from '@nestjs/common';
import { Repository } from 'typeorm';

import { PortalService } from '../portal.service';
import { Ticket, TicketSource } from '../../tickets/entities/ticket.entity';
import { TicketComment } from '../../tickets/entities/ticket-comment.entity';
import { Project } from '../../projects/entities/project.entity';
import { Approval, ApprovalStatus } from '../entities/approval.entity';
import { TicketsService } from '../../tickets/tickets.service';
import { KnowledgeBaseService } from '../../knowledge-base/knowledge-base.service';
import { AmcService } from '../../amc/amc.service';

describe('PortalService', () => {
  let service: PortalService;
  let ticketsRepo: jest.Mocked<Partial<Repository<Ticket>>>;
  let commentsRepo: jest.Mocked<Partial<Repository<TicketComment>>>;
  let projectsRepo: jest.Mocked<Partial<Repository<Project>>>;
  let approvalsRepo: jest.Mocked<Partial<Repository<Approval>>>;
  let ticketsService: jest.Mocked<Partial<TicketsService>>;

  const TENANT_ID = 'tenant-1';
  const COMPANY_ID = 'company-1';
  const OTHER_COMPANY_ID = 'company-2';
  const CONTACT_ID = 'contact-1';

  const scope = { tenantId: TENANT_ID, companyId: COMPANY_ID, contactId: CONTACT_ID };
  const scopeWithNoCompany = { tenantId: TENANT_ID, companyId: null, contactId: CONTACT_ID };

  function makeApprovalQueryBuilder(result: Approval | Approval[] | null) {
    const qb: any = {};
    qb.innerJoin = jest.fn().mockReturnValue(qb);
    qb.where = jest.fn().mockReturnValue(qb);
    qb.andWhere = jest.fn().mockReturnValue(qb);
    qb.orderBy = jest.fn().mockReturnValue(qb);
    qb.getMany = jest.fn().mockResolvedValue(Array.isArray(result) ? result : []);
    qb.getOne = jest.fn().mockResolvedValue(Array.isArray(result) ? null : result);
    return qb;
  }

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        PortalService,
        {
          provide: getRepositoryToken(Ticket),
          useValue: { find: jest.fn(), findOne: jest.fn() },
        },
        {
          provide: getRepositoryToken(TicketComment),
          useValue: { find: jest.fn() },
        },
        {
          provide: getRepositoryToken(Project),
          useValue: { find: jest.fn(), findOne: jest.fn() },
        },
        {
          provide: getRepositoryToken(Approval),
          useValue: { createQueryBuilder: jest.fn(), save: jest.fn((e) => Promise.resolve(e)) },
        },
        {
          provide: TicketsService,
          useValue: { create: jest.fn(), addComment: jest.fn() },
        },
        {
          provide: KnowledgeBaseService,
          useValue: { findAllArticles: jest.fn(), findOneArticleForClient: jest.fn() },
        },
        {
          provide: AmcService,
          useValue: { findAll: jest.fn().mockResolvedValue([]), getUsageForContract: jest.fn() },
        },
      ],
    }).compile();

    service = module.get<PortalService>(PortalService);
    ticketsRepo = module.get(getRepositoryToken(Ticket));
    commentsRepo = module.get(getRepositoryToken(TicketComment));
    projectsRepo = module.get(getRepositoryToken(Project));
    approvalsRepo = module.get(getRepositoryToken(Approval));
    ticketsService = module.get(TicketsService);
  });

  afterEach(() => jest.clearAllMocks());

  // ───────────────────────── Fail-closed on missing company link ─────────────────────────

  describe('company scope enforcement', () => {
    it('rejects getTickets for a contact with no companyId', async () => {
      await expect(service.getTickets(scopeWithNoCompany)).rejects.toThrow(ForbiddenException);
    });

    it('rejects raiseTicket for a contact with no companyId', async () => {
      await expect(
        service.raiseTicket(scopeWithNoCompany, { subject: 'x', description: 'y' }),
      ).rejects.toThrow(ForbiddenException);
    });

    it('rejects getProjects for a contact with no companyId', async () => {
      await expect(service.getProjects(scopeWithNoCompany)).rejects.toThrow(ForbiddenException);
    });

    it('rejects getApprovals for a contact with no companyId', async () => {
      await expect(service.getApprovals(scopeWithNoCompany)).rejects.toThrow(ForbiddenException);
    });
  });

  // ───────────────────────── Tickets ─────────────────────────

  describe('tickets', () => {
    it('raiseTicket forces companyId, raisedByContactId, and source=portal regardless of what the DTO contains', async () => {
      await service.raiseTicket(scope, {
        subject: 'Help',
        description: 'Something broke',
        companyId: 'attacker-supplied-company-id', // should be ignored/overridden
      } as any);

      expect(ticketsService.create).toHaveBeenCalledWith(
        TENANT_ID,
        expect.objectContaining({
          companyId: COMPANY_ID,
          raisedByContactId: CONTACT_ID,
          source: TicketSource.PORTAL,
        }),
        null,
      );
    });

    it('getTicket scopes the query by both tenantId and companyId', async () => {
      (ticketsRepo.findOne as jest.Mock).mockResolvedValue({ id: 't1', companyId: COMPANY_ID });
      await service.getTicket(scope, 't1');

      expect(ticketsRepo.findOne).toHaveBeenCalledWith({
        where: { id: 't1', tenantId: TENANT_ID, companyId: COMPANY_ID },
      });
    });

    it('getTicket throws NotFoundException (not Forbidden) when the ticket belongs to another company', async () => {
      // Simulates the real isolation test: findOne with a companyId filter
      // simply returns nothing for another company's ticket.
      (ticketsRepo.findOne as jest.Mock).mockResolvedValue(null);

      await expect(service.getTicket(scope, 'someone-elses-ticket')).rejects.toThrow(
        NotFoundException,
      );
    });

    it('getTicketComments always passes isInternal: false, never derived from any permission', async () => {
      (ticketsRepo.findOne as jest.Mock).mockResolvedValue({ id: 't1', companyId: COMPANY_ID });
      await service.getTicketComments(scope, 't1');

      expect(commentsRepo.find).toHaveBeenCalledWith({
        where: { tenantId: TENANT_ID, ticketId: 't1', isInternal: false },
        order: { createdAt: 'ASC' },
      });
    });

    it('addTicketReply is always authored by contactId, never userId', async () => {
      (ticketsRepo.findOne as jest.Mock).mockResolvedValue({ id: 't1', companyId: COMPANY_ID });
      await service.addTicketReply(scope, 't1', 'Thanks for the update');

      expect(ticketsService.addComment).toHaveBeenCalledWith(
        TENANT_ID,
        't1',
        { body: 'Thanks for the update', isInternal: false },
        { contactId: CONTACT_ID },
      );
    });
  });

  // ───────────────────────── Approvals ─────────────────────────

  describe('approvals', () => {
    it('respondToApproval rejects an approval belonging to a different company', async () => {
      const qb = makeApprovalQueryBuilder(null);
      (approvalsRepo.createQueryBuilder as jest.Mock).mockReturnValue(qb);

      await expect(
        service.respondToApproval(scope, 'approval-1', ApprovalStatus.APPROVED),
      ).rejects.toThrow(NotFoundException);
    });

    it('rejects responding to an approval that already has a response', async () => {
      const existingApproval = {
        id: 'approval-1',
        status: ApprovalStatus.APPROVED, // already responded
      } as Approval;
      const qb = makeApprovalQueryBuilder(existingApproval);
      (approvalsRepo.createQueryBuilder as jest.Mock).mockReturnValue(qb);

      await expect(
        service.respondToApproval(scope, 'approval-1', ApprovalStatus.REVISION_REQUESTED),
      ).rejects.toThrow(ForbiddenException);
    });

    it('records respondedByContactId and respondedAt on a valid pending approval', async () => {
      const pendingApproval = {
        id: 'approval-1',
        status: ApprovalStatus.PENDING,
      } as Approval;
      const qb = makeApprovalQueryBuilder(pendingApproval);
      (approvalsRepo.createQueryBuilder as jest.Mock).mockReturnValue(qb);

      const result = await service.respondToApproval(
        scope,
        'approval-1',
        ApprovalStatus.APPROVED,
        'Looks great, approved',
      );

      expect(result.status).toBe(ApprovalStatus.APPROVED);
      expect(result.respondedByContactId).toBe(CONTACT_ID);
      expect(result.respondedAt).toBeInstanceOf(Date);
      expect(result.responseNotes).toBe('Looks great, approved');
    });

    it('filters approvals by the company via the project join, not a direct companyId column', async () => {
      const qb = makeApprovalQueryBuilder([]);
      (approvalsRepo.createQueryBuilder as jest.Mock).mockReturnValue(qb);

      await service.getApprovals(scope);

      expect(qb.innerJoin).toHaveBeenCalledWith('approval.project', 'project');
      expect(qb.andWhere).toHaveBeenCalledWith('project.companyId = :companyId', {
        companyId: COMPANY_ID,
      });
    });
  });
});
