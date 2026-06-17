import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Put,
  Query,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';

import { ProjectsService } from './projects.service';
import { TasksService } from './tasks.service';
import { MilestonesService } from './milestones.service';
import { TimeLogsService } from './timelogs.service';
import {
  CreateProjectDto,
  UpdateProjectDto,
  ChangeProjectStatusDto,
  QueryProjectsDto,
  CreateTaskDto,
  UpdateTaskDto,
  ChangeTaskStatusDto,
  QueryTasksDto,
  CreateMilestoneDto,
  UpdateMilestoneDto,
  ChangeMilestoneStatusDto,
  CreateTimeLogDto,
} from './dto/project.dto';
import { CurrentUser, AuthenticatedUser } from '../../common/decorators/current-user.decorator';
import { RequirePermissions, RequireAnyPermission } from '../../common/guards/permissions.guard';
import { Role } from '../roles/entities/role.entity';

@Controller('projects')
export class ProjectsController {
  constructor(
    private projectsService: ProjectsService,
    private tasksService: TasksService,
    private milestonesService: MilestonesService,
    private timeLogsService: TimeLogsService,
    @InjectRepository(Role) private rolesRepo: Repository<Role>,
  ) {}

  // ── Projects ──

  @Post()
  @RequirePermissions('projects.create')
  create(@CurrentUser() user: AuthenticatedUser, @Body() dto: CreateProjectDto) {
    return this.projectsService.create(user.tenantId, dto, user.userId);
  }

  @Get()
  @RequireAnyPermission('projects.view-all', 'projects.view-own')
  async findAll(@CurrentUser() user: AuthenticatedUser, @Query() query: QueryProjectsDto) {
    const canViewAll = await this.hasPermission(user.roleId, 'projects.view-all');
    return this.projectsService.findAll(user.tenantId, query, {
      userId: user.userId,
      canViewAll,
    });
  }

  @Get(':id')
  @RequireAnyPermission('projects.view-all', 'projects.view-own')
  findOne(@CurrentUser() user: AuthenticatedUser, @Param('id', ParseUUIDPipe) id: string) {
    return this.projectsService.findOne(user.tenantId, id);
  }

  @Put(':id')
  @RequirePermissions('projects.manage')
  update(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateProjectDto,
  ) {
    return this.projectsService.update(user.tenantId, id, dto);
  }

  @Patch(':id/status')
  @RequirePermissions('projects.manage')
  changeStatus(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: ChangeProjectStatusDto,
  ) {
    return this.projectsService.changeStatus(user.tenantId, id, dto.status);
  }

  @Delete(':id')
  @RequirePermissions('projects.manage')
  @HttpCode(HttpStatus.NO_CONTENT)
  async remove(@CurrentUser() user: AuthenticatedUser, @Param('id', ParseUUIDPipe) id: string) {
    await this.projectsService.remove(user.tenantId, id);
  }

  // ── Milestones (nested under a project) ──

  @Post(':projectId/milestones')
  @RequirePermissions('milestones.manage')
  createMilestone(
    @CurrentUser() user: AuthenticatedUser,
    @Param('projectId', ParseUUIDPipe) projectId: string,
    @Body() dto: CreateMilestoneDto,
  ) {
    return this.milestonesService.create(user.tenantId, projectId, dto);
  }

  @Get(':projectId/milestones')
  @RequireAnyPermission('projects.view-all', 'projects.view-own')
  getMilestones(
    @CurrentUser() user: AuthenticatedUser,
    @Param('projectId', ParseUUIDPipe) projectId: string,
  ) {
    return this.milestonesService.findAllForProject(user.tenantId, projectId);
  }

  @Put('milestones/:id')
  @RequirePermissions('milestones.manage')
  updateMilestone(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateMilestoneDto,
  ) {
    return this.milestonesService.update(user.tenantId, id, dto);
  }

  @Patch('milestones/:id/status')
  @RequirePermissions('milestones.manage')
  changeMilestoneStatus(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: ChangeMilestoneStatusDto,
  ) {
    return this.milestonesService.changeStatus(user.tenantId, id, dto.status);
  }

  @Delete('milestones/:id')
  @RequirePermissions('milestones.manage')
  @HttpCode(HttpStatus.NO_CONTENT)
  async removeMilestone(@CurrentUser() user: AuthenticatedUser, @Param('id', ParseUUIDPipe) id: string) {
    await this.milestonesService.remove(user.tenantId, id);
  }

  // ── Tasks (nested under a project) ──

  @Post(':projectId/tasks')
  @RequirePermissions('tasks.manage')
  createTask(
    @CurrentUser() user: AuthenticatedUser,
    @Param('projectId', ParseUUIDPipe) projectId: string,
    @Body() dto: CreateTaskDto,
  ) {
    return this.tasksService.create(user.tenantId, projectId, dto, user.userId);
  }

  @Get(':projectId/tasks')
  @RequireAnyPermission('projects.view-all', 'projects.view-own')
  getTasks(
    @CurrentUser() user: AuthenticatedUser,
    @Param('projectId', ParseUUIDPipe) projectId: string,
    @Query() query: QueryTasksDto,
  ) {
    return this.tasksService.findAllForProject(user.tenantId, projectId, query);
  }

  @Put('tasks/:id')
  @RequirePermissions('tasks.manage')
  updateTask(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateTaskDto,
  ) {
    return this.tasksService.update(user.tenantId, id, dto);
  }

  @Patch('tasks/:id/status')
  @RequirePermissions('tasks.manage')
  changeTaskStatus(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: ChangeTaskStatusDto,
  ) {
    return this.tasksService.changeStatus(user.tenantId, id, dto.status);
  }

  @Delete('tasks/:id')
  @RequirePermissions('tasks.manage')
  @HttpCode(HttpStatus.NO_CONTENT)
  async removeTask(@CurrentUser() user: AuthenticatedUser, @Param('id', ParseUUIDPipe) id: string) {
    await this.tasksService.remove(user.tenantId, id);
  }

  // ── Time logs (nested under a project) ──

  @Post(':projectId/timelogs')
  @RequirePermissions('timelogs.manage')
  createTimeLog(
    @CurrentUser() user: AuthenticatedUser,
    @Param('projectId', ParseUUIDPipe) projectId: string,
    @Body() dto: CreateTimeLogDto,
  ) {
    return this.timeLogsService.create(user.tenantId, projectId, dto, user.userId);
  }

  @Get(':projectId/timelogs')
  @RequireAnyPermission('projects.view-all', 'projects.view-own')
  getTimeLogs(
    @CurrentUser() user: AuthenticatedUser,
    @Param('projectId', ParseUUIDPipe) projectId: string,
  ) {
    return this.timeLogsService.findAllForProject(user.tenantId, projectId);
  }

  @Delete('timelogs/:id')
  @RequirePermissions('timelogs.manage')
  @HttpCode(HttpStatus.NO_CONTENT)
  async removeTimeLog(@CurrentUser() user: AuthenticatedUser, @Param('id', ParseUUIDPipe) id: string) {
    await this.timeLogsService.remove(user.tenantId, id);
  }

  private async hasPermission(roleId: string, slug: string): Promise<boolean> {
    const role = await this.rolesRepo.findOne({
      where: { id: roleId },
      relations: ['permissions'],
    });
    return role?.permissions.some((p) => p.slug === slug) ?? false;
  }
}
