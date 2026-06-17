import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { BadRequestException, ForbiddenException, NotFoundException } from '@nestjs/common';
import { Repository } from 'typeorm';

import { TicketsService } from '../tickets.service';
import {
  Ticket,
  TicketPriority,
  TicketStatus,
} from '../entities/ticket.entity';
import { TicketComment } from '../entities/ticket-comment.entity';

describe('TicketsService', () => {
  let service: TicketsService;
  let ticketsRepo: jest.Mocked<Partial<Repository<Ticket>>>;
  let commentsRepo: jest.Mocked<Partial<Repository<TicketComment>>>;
  let eventEmitter: jest.Mocked<Partial<EventEmitter2>>;

  const TENANT_ID = 'tenant-1';
  const TICKET_ID = 'ticket-1';

  function makeTicket(overrides: Partial<Ticket> = {}): Ticket {
    return {
      id: TICKET_ID,
      tenantId: TENANT_ID,
      reference: 'KT-0001',
      subject: 'Test ticket',
      description: 'Something is broken',
      category: null,
      priority: TicketPriority.MEDIUM,
      status: TicketStatus.OPEN,
      source: 'portal' as any,
      firstResponseDueAt: null,
      firstRespondedAt: null,
      resolutionDueAt: null,
      resolvedAt: null,
      slaResponseBreached: false,
      slaResolutionBreached: false,
      closedAt: null,
      tags: [],
      createdAt: new Date(),
      updatedAt: new Date(),
      deletedAt: null,
      ...overrides,
    } as Ticket;
  }

  // Builds a chainable mock query builder for the `update()...execute()` pattern
  // used by detectBreaches(), since that path doesn't go through repo.find/save.
  function makeUpdateQueryBuilderMock(affected: number) {
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
        TicketsService,
        {
          provide: getRepositoryToken(Ticket),
          useValue: {
            findOne: jest.fn(),
            save: jest.fn((entity) => Promise.resolve(entity)),
            create: jest.fn((dto) => dto),
            count: jest.fn().mockResolvedValue(0),
            softRemove: jest.fn(),
            createQueryBuilder: jest.fn(),
          },
        },
        {
          provide: getRepositoryToken(TicketComment),
          useValue: {
            create: jest.fn((dto) => dto),
            save: jest.fn((entity) => Promise.resolve({ id: 'comment-1', ...entity })),
            find: jest.fn(),
          },
        },
        {
          provide: EventEmitter2,
          useValue: { emit: jest.fn() },
        },
      ],
    }).compile();

    service = module.get<TicketsService>(TicketsService);
    ticketsRepo = module.get(getRepositoryToken(Ticket));
    commentsRepo = module.get(getRepositoryToken(TicketComment));
    eventEmitter = module.get(EventEmitter2);
  });

  afterEach(() => jest.clearAllMocks());

  // ───────────────────────── SLA deadline calculation on create ─────────────────────────

  describe('create()', () => {
    it.each([
      [TicketPriority.CRITICAL, 60, 240],
      [TicketPriority.HIGH, 240, 1440],
      [TicketPriority.MEDIUM, 1440, 4320],
      [TicketPriority.LOW, 4320, 10080],
    ])(
      'computes correct SLA deadlines for %s priority (response: %dmin, resolution: %dmin)',
      async (priority, expectedResponseMin, expectedResolutionMin) => {
        const before = Date.now();
        const ticket = await service.create(
          TENANT_ID,
          { subject: 'Test', description: 'Desc', priority },
          'user-1',
        );
        const after = Date.now();

        const responseDelta = ticket.firstResponseDueAt!.getTime() - before;
        const resolutionDelta = ticket.resolutionDueAt!.getTime() - before;

        // Allow a small tolerance for test execution time between before/after
        expect(responseDelta).toBeGreaterThanOrEqual(expectedResponseMin * 60_000);
        expect(responseDelta).toBeLessThanOrEqual(expectedResponseMin * 60_000 + (after - before) + 1000);
        expect(resolutionDelta).toBeGreaterThanOrEqual(expectedResolutionMin * 60_000);
        expect(resolutionDelta).toBeLessThanOrEqual(expectedResolutionMin * 60_000 + (after - before) + 1000);
      },
    );

    it('generates a sequential per-tenant reference like KT-0001', async () => {
      (ticketsRepo.count as jest.Mock).mockResolvedValue(0);
      const ticket = await service.create(
        TENANT_ID,
        { subject: 'Test', description: 'Desc' },
        'user-1',
      );
      expect(ticket.reference).toBe('KT-0001');
    });

    it('increments the reference number based on existing ticket count', async () => {
      (ticketsRepo.count as jest.Mock).mockResolvedValue(41);
      const ticket = await service.create(
        TENANT_ID,
        { subject: 'Test', description: 'Desc' },
        'user-1',
      );
      expect(ticket.reference).toBe('KT-0042');
    });

    it('defaults to medium priority when none is specified', async () => {
      const ticket = await service.create(
        TENANT_ID,
        { subject: 'Test', description: 'Desc' },
        'user-1',
      );
      expect(ticket.priority).toBe(TicketPriority.MEDIUM);
    });
  });

  // ───────────────────────── Status transitions ─────────────────────────

  describe('changeStatus()', () => {
    it('rejects open -> resolved (must be assigned first)', async () => {
      (ticketsRepo.findOne as jest.Mock).mockResolvedValue(makeTicket({ status: TicketStatus.OPEN }));

      await expect(
        service.changeStatus(TENANT_ID, TICKET_ID, TicketStatus.RESOLVED),
      ).rejects.toThrow(BadRequestException);
    });

    it('allows open -> assigned -> in_progress -> resolved -> closed', async () => {
      let current = TicketStatus.OPEN;
      for (const next of [
        TicketStatus.ASSIGNED,
        TicketStatus.IN_PROGRESS,
        TicketStatus.RESOLVED,
        TicketStatus.CLOSED,
      ]) {
        (ticketsRepo.findOne as jest.Mock).mockResolvedValue(makeTicket({ status: current }));
        const result = await service.changeStatus(TENANT_ID, TICKET_ID, next);
        expect(result.status).toBe(next);
        current = next;
      }
    });

    it('rejects any transition out of closed except reopened', async () => {
      (ticketsRepo.findOne as jest.Mock).mockResolvedValue(makeTicket({ status: TicketStatus.CLOSED }));

      await expect(
        service.changeStatus(TENANT_ID, TICKET_ID, TicketStatus.IN_PROGRESS),
      ).rejects.toThrow(BadRequestException);
    });

    it('allows closed -> reopened', async () => {
      (ticketsRepo.findOne as jest.Mock).mockResolvedValue(makeTicket({ status: TicketStatus.CLOSED }));

      const result = await service.changeStatus(TENANT_ID, TICKET_ID, TicketStatus.REOPENED);
      expect(result.status).toBe(TicketStatus.REOPENED);
    });

    it('stamps firstRespondedAt the first time it reaches an engagement state', async () => {
      const dueInFuture = new Date(Date.now() + 60 * 60_000);
      (ticketsRepo.findOne as jest.Mock).mockResolvedValue(
        makeTicket({ status: TicketStatus.ASSIGNED, firstResponseDueAt: dueInFuture }),
      );

      const result = await service.changeStatus(TENANT_ID, TICKET_ID, TicketStatus.IN_PROGRESS);

      expect(result.firstRespondedAt).toBeInstanceOf(Date);
      expect(result.slaResponseBreached).toBe(false);
    });

    it('flags slaResponseBreached=true if firstResponseDueAt has already passed', async () => {
      const dueInPast = new Date(Date.now() - 60 * 60_000);
      (ticketsRepo.findOne as jest.Mock).mockResolvedValue(
        makeTicket({ status: TicketStatus.ASSIGNED, firstResponseDueAt: dueInPast }),
      );

      const result = await service.changeStatus(TENANT_ID, TICKET_ID, TicketStatus.IN_PROGRESS);

      expect(result.slaResponseBreached).toBe(true);
    });

    it('does not re-stamp firstRespondedAt if it is already set', async () => {
      const firstStamp = new Date('2026-01-01T00:00:00Z');
      (ticketsRepo.findOne as jest.Mock).mockResolvedValue(
        makeTicket({
          status: TicketStatus.IN_PROGRESS,
          firstRespondedAt: firstStamp,
        }),
      );

      const result = await service.changeStatus(TENANT_ID, TICKET_ID, TicketStatus.WAITING_ON_CLIENT);

      expect(result.firstRespondedAt).toEqual(firstStamp);
    });

    it('stamps resolvedAt and checks resolution SLA when moved to resolved', async () => {
      const dueInFuture = new Date(Date.now() + 60 * 60_000);
      (ticketsRepo.findOne as jest.Mock).mockResolvedValue(
        makeTicket({ status: TicketStatus.IN_PROGRESS, resolutionDueAt: dueInFuture }),
      );

      const result = await service.changeStatus(TENANT_ID, TICKET_ID, TicketStatus.RESOLVED);

      expect(result.resolvedAt).toBeInstanceOf(Date);
      expect(result.slaResolutionBreached).toBe(false);
    });

    it('stamps closedAt when moved to closed', async () => {
      (ticketsRepo.findOne as jest.Mock).mockResolvedValue(
        makeTicket({ status: TicketStatus.RESOLVED }),
      );

      const result = await service.changeStatus(TENANT_ID, TICKET_ID, TicketStatus.CLOSED);

      expect(result.closedAt).toBeInstanceOf(Date);
    });

    it('clears resolvedAt and closedAt when reopened, but preserves prior breach flags', async () => {
      (ticketsRepo.findOne as jest.Mock).mockResolvedValue(
        makeTicket({
          status: TicketStatus.CLOSED,
          resolvedAt: new Date(),
          closedAt: new Date(),
          slaResolutionBreached: true,
        }),
      );

      const result = await service.changeStatus(TENANT_ID, TICKET_ID, TicketStatus.REOPENED);

      expect(result.resolvedAt).toBeNull();
      expect(result.closedAt).toBeNull();
      expect(result.slaResolutionBreached).toBe(true); // history doesn't un-happen
    });

    it('throws NotFoundException for a ticket outside the tenant', async () => {
      (ticketsRepo.findOne as jest.Mock).mockResolvedValue(null);

      await expect(
        service.changeStatus(TENANT_ID, 'nonexistent', TicketStatus.ASSIGNED),
      ).rejects.toThrow(NotFoundException);
    });

    it('emits ticket.status_changed with the previous status on every transition', async () => {
      (ticketsRepo.findOne as jest.Mock).mockResolvedValue(
        makeTicket({ status: TicketStatus.OPEN }),
      );

      await service.changeStatus(TENANT_ID, TICKET_ID, TicketStatus.ASSIGNED);

      expect(eventEmitter.emit).toHaveBeenCalledWith(
        'ticket.status_changed',
        expect.objectContaining({ previousStatus: TicketStatus.OPEN }),
      );
    });
  });

  // ───────────────────────── Breach detection sweep ─────────────────────────

  describe('detectBreaches()', () => {
    it('flips slaResponseBreached for overdue, unresponded tickets', async () => {
      const responseQb = makeUpdateQueryBuilderMock(3);
      const resolutionQb = makeUpdateQueryBuilderMock(0);
      (ticketsRepo.createQueryBuilder as jest.Mock)
        .mockReturnValueOnce(responseQb)
        .mockReturnValueOnce(resolutionQb);

      const result = await service.detectBreaches(TENANT_ID);

      expect(result.responseBreaches).toBe(3);
      expect(responseQb.set).toHaveBeenCalledWith({ slaResponseBreached: true });
    });

    it('flips slaResolutionBreached for overdue, unresolved, non-closed tickets', async () => {
      const responseQb = makeUpdateQueryBuilderMock(0);
      const resolutionQb = makeUpdateQueryBuilderMock(2);
      (ticketsRepo.createQueryBuilder as jest.Mock)
        .mockReturnValueOnce(responseQb)
        .mockReturnValueOnce(resolutionQb);

      const result = await service.detectBreaches(TENANT_ID);

      expect(result.resolutionBreaches).toBe(2);
      expect(resolutionQb.set).toHaveBeenCalledWith({ slaResolutionBreached: true });
    });

    it('excludes resolved and closed tickets from the resolution breach sweep', async () => {
      const responseQb = makeUpdateQueryBuilderMock(0);
      const resolutionQb = makeUpdateQueryBuilderMock(0);
      (ticketsRepo.createQueryBuilder as jest.Mock)
        .mockReturnValueOnce(responseQb)
        .mockReturnValueOnce(resolutionQb);

      await service.detectBreaches(TENANT_ID);

      const statusExclusionCall = resolutionQb.andWhere.mock.calls.find((call: any[]) =>
        call[0].includes('status NOT IN'),
      );
      expect(statusExclusionCall).toBeDefined();
      expect(statusExclusionCall[1].closedStates).toEqual([
        TicketStatus.RESOLVED,
        TicketStatus.CLOSED,
      ]);
    });
  });

  // ───────────────────────── Comments: internal vs client-visible ─────────────────────────

  describe('comments', () => {
    beforeEach(() => {
      (ticketsRepo.findOne as jest.Mock).mockResolvedValue(makeTicket());
    });

    it('allows staff to create an internal note', async () => {
      const comment = await service.addComment(
        TENANT_ID,
        TICKET_ID,
        { body: 'Internal root cause note', isInternal: true },
        { userId: 'staff-1' },
      );
      expect(comment.isInternal).toBe(true);
    });

    it('rejects a contact (client) attempting to post an internal note', async () => {
      await expect(
        service.addComment(
          TENANT_ID,
          TICKET_ID,
          { body: 'Trying to sneak an internal note', isInternal: true },
          { contactId: 'contact-1' },
        ),
      ).rejects.toThrow(ForbiddenException);
    });

    it('allows a contact to post a normal (non-internal) reply', async () => {
      const comment = await service.addComment(
        TENANT_ID,
        TICKET_ID,
        { body: 'Thanks, looking forward to the fix', isInternal: false },
        { contactId: 'contact-1' },
      );
      expect(comment.isInternal).toBe(false);
      expect(comment.authorContactId).toBe('contact-1');
    });

    it('excludes internal notes when includeInternal=false (client portal view)', async () => {
      await service.getComments(TENANT_ID, TICKET_ID, false);
      expect(commentsRepo.find).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({ isInternal: false }),
        }),
      );
    });

    it('includes internal notes when includeInternal=true (staff view)', async () => {
      await service.getComments(TENANT_ID, TICKET_ID, true);
      const callArg = (commentsRepo.find as jest.Mock).mock.calls[0][0];
      expect(callArg.where.isInternal).toBeUndefined();
    });
  });
});
