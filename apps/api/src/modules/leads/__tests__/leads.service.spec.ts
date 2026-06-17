import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { BadRequestException, NotFoundException } from '@nestjs/common';
import { Repository } from 'typeorm';

import { LeadsService } from '../leads.service';
import { Lead, LeadStatus, LeadPriority } from '../entities/lead.entity';
import { LeadActivity, LeadActivityType } from '../entities/lead-activity.entity';
import { LeadFollowUp } from '../entities/lead-followup.entity';

/**
 * These tests exercise LeadsService.changeStatus() — the single most
 * important business rule in the CRM core so far. The pipeline diagram
 * (New → Contacted → Requirement Gathering → Proposal Sent → Negotiation
 * → Won, with Lost reachable from any non-terminal stage and a mandatory
 * reason) is only real if it's enforced AND tested, not just documented.
 *
 * Repositories are mocked — this is a unit test of the transition logic,
 * not an integration test against a real database (that's covered
 * separately by the manual curl verification in the dev sandbox, and
 * should eventually get its own e2e suite using a real test database).
 */
describe('LeadsService — status transitions', () => {
  let service: LeadsService;
  let leadsRepo: jest.Mocked<Partial<Repository<Lead>>>;
  let activitiesRepo: jest.Mocked<Partial<Repository<LeadActivity>>>;
  let eventEmitter: jest.Mocked<Partial<EventEmitter2>>;

  const TENANT_ID = 'tenant-1';
  const USER_ID = 'user-1';
  const LEAD_ID = 'lead-1';

  function makeLead(overrides: Partial<Lead> = {}): Lead {
    return {
      id: LEAD_ID,
      tenantId: TENANT_ID,
      title: 'Test Lead',
      status: LeadStatus.NEW,
      priority: LeadPriority.MEDIUM,
      probability: 0,
      tags: [],
      customFields: {},
      serviceType: [],
      lostReason: null,
      lostAt: null,
      wonAt: null,
      createdAt: new Date(),
      updatedAt: new Date(),
      deletedAt: null,
      ...overrides,
    } as Lead;
  }

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        LeadsService,
        {
          provide: getRepositoryToken(Lead),
          useValue: {
            findOne: jest.fn(),
            save: jest.fn((entity) => Promise.resolve(entity)),
            create: jest.fn((dto) => dto),
            createQueryBuilder: jest.fn(),
            softRemove: jest.fn(),
          },
        },
        {
          provide: getRepositoryToken(LeadActivity),
          useValue: {
            create: jest.fn((dto) => dto),
            save: jest.fn((entity) => Promise.resolve({ id: 'activity-1', ...entity })),
            find: jest.fn(),
          },
        },
        {
          provide: getRepositoryToken(LeadFollowUp),
          useValue: {
            create: jest.fn((dto) => dto),
            save: jest.fn((entity) => Promise.resolve(entity)),
            findOne: jest.fn(),
            createQueryBuilder: jest.fn(),
          },
        },
        {
          provide: EventEmitter2,
          useValue: { emit: jest.fn() },
        },
      ],
    }).compile();

    service = module.get<LeadsService>(LeadsService);
    leadsRepo = module.get(getRepositoryToken(Lead));
    activitiesRepo = module.get(getRepositoryToken(LeadActivity));
    eventEmitter = module.get(EventEmitter2);
  });

  afterEach(() => jest.clearAllMocks());

  // ───────────────────────── Valid forward transitions ─────────────────────────

  it('allows New → Contacted', async () => {
    (leadsRepo.findOne as jest.Mock).mockResolvedValue(makeLead({ status: LeadStatus.NEW }));

    const result = await service.changeStatus(
      TENANT_ID,
      LEAD_ID,
      { status: LeadStatus.CONTACTED },
      USER_ID,
    );

    expect(result.status).toBe(LeadStatus.CONTACTED);
  });

  it('allows the full happy path New → Contacted → Requirement Gathering → Proposal Sent → Negotiation → Won', async () => {
    const chain: LeadStatus[] = [
      LeadStatus.CONTACTED,
      LeadStatus.REQUIREMENT_GATHERING,
      LeadStatus.PROPOSAL_SENT,
      LeadStatus.NEGOTIATION,
      LeadStatus.WON,
    ];

    let currentStatus = LeadStatus.NEW;
    for (const next of chain) {
      (leadsRepo.findOne as jest.Mock).mockResolvedValue(makeLead({ status: currentStatus }));
      const result = await service.changeStatus(TENANT_ID, LEAD_ID, { status: next }, USER_ID);
      expect(result.status).toBe(next);
      currentStatus = next;
    }
  });

  it('sets wonAt when status becomes Won', async () => {
    (leadsRepo.findOne as jest.Mock).mockResolvedValue(makeLead({ status: LeadStatus.NEGOTIATION }));

    const result = await service.changeStatus(
      TENANT_ID,
      LEAD_ID,
      { status: LeadStatus.WON },
      USER_ID,
    );

    expect(result.wonAt).toBeInstanceOf(Date);
    expect(result.lostAt).toBeNull();
  });

  it('emits a lead.won event in addition to lead.status_changed when a lead is won', async () => {
    (leadsRepo.findOne as jest.Mock).mockResolvedValue(makeLead({ status: LeadStatus.NEGOTIATION }));

    await service.changeStatus(TENANT_ID, LEAD_ID, { status: LeadStatus.WON }, USER_ID);

    const emittedEvents = (eventEmitter.emit as jest.Mock).mock.calls.map((c) => c[0]);
    expect(emittedEvents).toContain('lead.status_changed');
    expect(emittedEvents).toContain('lead.won');
  });

  // ───────────────────────── Invalid transitions rejected ─────────────────────────

  it('rejects skipping stages: New → Negotiation', async () => {
    (leadsRepo.findOne as jest.Mock).mockResolvedValue(makeLead({ status: LeadStatus.NEW }));

    await expect(
      service.changeStatus(TENANT_ID, LEAD_ID, { status: LeadStatus.NEGOTIATION }, USER_ID),
    ).rejects.toThrow(BadRequestException);
  });

  it('rejects moving backwards: Negotiation → Contacted', async () => {
    (leadsRepo.findOne as jest.Mock).mockResolvedValue(
      makeLead({ status: LeadStatus.NEGOTIATION }),
    );

    await expect(
      service.changeStatus(TENANT_ID, LEAD_ID, { status: LeadStatus.CONTACTED }, USER_ID),
    ).rejects.toThrow(BadRequestException);
  });

  it('rejects any transition out of a terminal Won state', async () => {
    (leadsRepo.findOne as jest.Mock).mockResolvedValue(makeLead({ status: LeadStatus.WON }));

    await expect(
      service.changeStatus(TENANT_ID, LEAD_ID, { status: LeadStatus.CONTACTED }, USER_ID),
    ).rejects.toThrow(BadRequestException);
  });

  it('rejects any transition out of a terminal Lost state', async () => {
    (leadsRepo.findOne as jest.Mock).mockResolvedValue(makeLead({ status: LeadStatus.LOST }));

    await expect(
      service.changeStatus(TENANT_ID, LEAD_ID, { status: LeadStatus.WON }, USER_ID),
    ).rejects.toThrow(BadRequestException);
  });

  // ───────────────────────── Lost reachable from anywhere non-terminal ─────────────────────────

  it.each([
    LeadStatus.NEW,
    LeadStatus.CONTACTED,
    LeadStatus.REQUIREMENT_GATHERING,
    LeadStatus.PROPOSAL_SENT,
    LeadStatus.NEGOTIATION,
  ])('allows moving from %s directly to Lost', async (fromStatus) => {
    (leadsRepo.findOne as jest.Mock).mockResolvedValue(makeLead({ status: fromStatus }));

    const result = await service.changeStatus(
      TENANT_ID,
      LEAD_ID,
      { status: LeadStatus.LOST, lostReason: 'Budget cut' },
      USER_ID,
    );

    expect(result.status).toBe(LeadStatus.LOST);
  });

  it('records lostReason and lostAt when marked Lost', async () => {
    (leadsRepo.findOne as jest.Mock).mockResolvedValue(makeLead({ status: LeadStatus.PROPOSAL_SENT }));

    const result = await service.changeStatus(
      TENANT_ID,
      LEAD_ID,
      { status: LeadStatus.LOST, lostReason: 'Went with a competitor' },
      USER_ID,
    );

    expect(result.lostReason).toBe('Went with a competitor');
    expect(result.lostAt).toBeInstanceOf(Date);
    expect(result.wonAt).toBeNull();
  });

  // ───────────────────────── Activity logging on status change ─────────────────────────

  it('logs a status_change activity every time status changes', async () => {
    (leadsRepo.findOne as jest.Mock).mockResolvedValue(makeLead({ status: LeadStatus.NEW }));

    await service.changeStatus(TENANT_ID, LEAD_ID, { status: LeadStatus.CONTACTED }, USER_ID);

    expect(activitiesRepo.save).toHaveBeenCalled();
    const savedActivity = (activitiesRepo.save as jest.Mock).mock.calls[0][0];
    expect(savedActivity.type).toBe(LeadActivityType.STATUS_CHANGE);
    expect(savedActivity.title).toContain('new');
    expect(savedActivity.title).toContain('contacted');
  });

  // ───────────────────────── Not found ─────────────────────────

  it('throws NotFoundException when the lead does not belong to the tenant', async () => {
    (leadsRepo.findOne as jest.Mock).mockResolvedValue(null);

    await expect(
      service.changeStatus(TENANT_ID, 'nonexistent-lead', { status: LeadStatus.CONTACTED }, USER_ID),
    ).rejects.toThrow(NotFoundException);
  });
});
