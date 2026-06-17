import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { BadRequestException, NotFoundException } from '@nestjs/common';
import { Repository } from 'typeorm';

import { ProjectsService } from '../projects.service';
import { Project, ProjectStatus } from '../entities/project.entity';
import { Lead, LeadStatus, LeadPriority } from '../../leads/entities/lead.entity';

describe('ProjectsService', () => {
  let service: ProjectsService;
  let projectsRepo: jest.Mocked<Partial<Repository<Project>>>;
  let eventEmitter: jest.Mocked<Partial<EventEmitter2>>;

  const TENANT_ID = 'tenant-1';
  const PROJECT_ID = 'project-1';

  function makeProject(overrides: Partial<Project> = {}): Project {
    return {
      id: PROJECT_ID,
      tenantId: TENANT_ID,
      name: 'Test Project',
      status: ProjectStatus.PLANNING,
      teamMemberIds: [],
      progressPercent: 0,
      currency: 'GBP',
      loggedHours: '0',
      createdAt: new Date(),
      updatedAt: new Date(),
      deletedAt: null,
      ...overrides,
    } as Project;
  }

  function makeLead(overrides: Partial<Lead> = {}): Lead {
    return {
      id: 'lead-1',
      tenantId: TENANT_ID,
      title: 'Won Deal Co - New App',
      status: LeadStatus.WON,
      priority: LeadPriority.HIGH,
      estimatedValue: '15000.00',
      currency: 'GBP',
      companyId: 'company-1',
      assignedToId: 'user-1',
      description: 'Build the thing',
      ...overrides,
    } as Lead;
  }

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ProjectsService,
        {
          provide: getRepositoryToken(Project),
          useValue: {
            findOne: jest.fn(),
            save: jest.fn((entity) => Promise.resolve({ id: PROJECT_ID, ...entity })),
            create: jest.fn((dto) => dto),
            createQueryBuilder: jest.fn(),
            softRemove: jest.fn(),
          },
        },
        {
          provide: EventEmitter2,
          useValue: { emit: jest.fn() },
        },
      ],
    }).compile();

    service = module.get<ProjectsService>(ProjectsService);
    projectsRepo = module.get(getRepositoryToken(Project));
    eventEmitter = module.get(EventEmitter2);
  });

  afterEach(() => jest.clearAllMocks());

  // ───────────────────────── Status transitions ─────────────────────────

  describe('changeStatus()', () => {
    it('allows planning -> in_progress', async () => {
      (projectsRepo.findOne as jest.Mock).mockResolvedValue(
        makeProject({ status: ProjectStatus.PLANNING }),
      );
      const result = await service.changeStatus(TENANT_ID, PROJECT_ID, ProjectStatus.IN_PROGRESS);
      expect(result.status).toBe(ProjectStatus.IN_PROGRESS);
    });

    it('rejects planning -> completed directly (must go through in_progress)', async () => {
      (projectsRepo.findOne as jest.Mock).mockResolvedValue(
        makeProject({ status: ProjectStatus.PLANNING }),
      );
      await expect(
        service.changeStatus(TENANT_ID, PROJECT_ID, ProjectStatus.COMPLETED),
      ).rejects.toThrow(BadRequestException);
    });

    it('allows in_progress -> on_hold -> in_progress (can resume)', async () => {
      (projectsRepo.findOne as jest.Mock).mockResolvedValue(
        makeProject({ status: ProjectStatus.IN_PROGRESS }),
      );
      const onHold = await service.changeStatus(TENANT_ID, PROJECT_ID, ProjectStatus.ON_HOLD);
      expect(onHold.status).toBe(ProjectStatus.ON_HOLD);

      (projectsRepo.findOne as jest.Mock).mockResolvedValue(
        makeProject({ status: ProjectStatus.ON_HOLD }),
      );
      const resumed = await service.changeStatus(TENANT_ID, PROJECT_ID, ProjectStatus.IN_PROGRESS);
      expect(resumed.status).toBe(ProjectStatus.IN_PROGRESS);
    });

    it('rejects any transition out of a terminal completed state', async () => {
      (projectsRepo.findOne as jest.Mock).mockResolvedValue(
        makeProject({ status: ProjectStatus.COMPLETED }),
      );
      await expect(
        service.changeStatus(TENANT_ID, PROJECT_ID, ProjectStatus.IN_PROGRESS),
      ).rejects.toThrow(BadRequestException);
    });

    it('sets actualEndDate and progressPercent=100 when completed', async () => {
      (projectsRepo.findOne as jest.Mock).mockResolvedValue(
        makeProject({ status: ProjectStatus.IN_PROGRESS, progressPercent: 60 }),
      );
      const result = await service.changeStatus(TENANT_ID, PROJECT_ID, ProjectStatus.COMPLETED);
      expect(result.progressPercent).toBe(100);
      expect(result.actualEndDate).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    });

    it('throws NotFoundException for a project outside the tenant', async () => {
      (projectsRepo.findOne as jest.Mock).mockResolvedValue(null);
      await expect(
        service.changeStatus(TENANT_ID, 'nonexistent', ProjectStatus.IN_PROGRESS),
      ).rejects.toThrow(NotFoundException);
    });
  });

  // ───────────────────────── lead.won auto-creation ─────────────────────────

  describe('handleLeadWon()', () => {
    it('creates a project carrying over title, company, budget, currency, and PM from the lead', async () => {
      const lead = makeLead();
      await service.handleLeadWon({ tenantId: TENANT_ID, lead });

      expect(projectsRepo.create).toHaveBeenCalledWith(
        expect.objectContaining({
          tenantId: TENANT_ID,
          name: lead.title,
          companyId: lead.companyId,
          originLeadId: lead.id,
          budget: lead.estimatedValue,
          currency: lead.currency,
          projectManagerId: lead.assignedToId,
          status: ProjectStatus.PLANNING,
        }),
      );
      expect(projectsRepo.save).toHaveBeenCalled();
    });

    it('emits project.created with fromLead=true', async () => {
      const lead = makeLead();
      await service.handleLeadWon({ tenantId: TENANT_ID, lead });

      expect(eventEmitter.emit).toHaveBeenCalledWith(
        'project.created',
        expect.objectContaining({ fromLead: true }),
      );
    });

    it('does not throw if project creation fails — logs instead, so a failure here never breaks the lead-won flow', async () => {
      (projectsRepo.save as jest.Mock).mockRejectedValueOnce(new Error('DB exploded'));
      const lead = makeLead();

      await expect(
        service.handleLeadWon({ tenantId: TENANT_ID, lead }),
      ).resolves.toBeUndefined();
    });
  });
});
