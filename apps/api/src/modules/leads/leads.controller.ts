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

import { LeadsService } from './leads.service';
import {
  CreateLeadDto,
  UpdateLeadDto,
  QueryLeadsDto,
  ChangeLeadStatusDto,
  CreateLeadActivityDto,
  CreateLeadFollowUpDto,
} from './dto/lead.dto';
import { CurrentUser, AuthenticatedUser } from '../../common/decorators/current-user.decorator';
import { RequirePermissions, RequireAnyPermission } from '../../common/guards/permissions.guard';
import { Role } from '../roles/entities/role.entity';

@Controller('leads')
export class LeadsController {
  constructor(
    private leadsService: LeadsService,
    @InjectRepository(Role) private rolesRepo: Repository<Role>,
  ) {}

  @Post()
  @RequirePermissions('leads.create')
  create(@CurrentUser() user: AuthenticatedUser, @Body() dto: CreateLeadDto) {
    return this.leadsService.create(user.tenantId, dto, user.userId);
  }

  @Get()
  @RequireAnyPermission('leads.view-all', 'leads.view-assigned')
  async findAll(@CurrentUser() user: AuthenticatedUser, @Query() query: QueryLeadsDto) {
    const canViewAll = await this.hasPermission(user.roleId, 'leads.view-all');
    return this.leadsService.findAll(user.tenantId, query, {
      userId: user.userId,
      canViewAll,
    });
  }

  @Get('followups/due')
  @RequirePermissions('leads.view-assigned')
  getDueFollowUps(@CurrentUser() user: AuthenticatedUser) {
    // Every staff member sees their own due follow-ups regardless of
    // broader lead visibility — this powers the "follow-up due today" widget.
    return this.leadsService.getDueFollowUps(user.tenantId, user.userId);
  }

  @Get(':id')
  @RequireAnyPermission('leads.view-all', 'leads.view-assigned')
  findOne(@CurrentUser() user: AuthenticatedUser, @Param('id', ParseUUIDPipe) id: string) {
    return this.leadsService.findOne(user.tenantId, id);
  }

  @Put(':id')
  @RequirePermissions('leads.update')
  update(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateLeadDto,
  ) {
    return this.leadsService.update(user.tenantId, id, dto);
  }

  @Patch(':id/status')
  @RequirePermissions('leads.update')
  changeStatus(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: ChangeLeadStatusDto,
  ) {
    return this.leadsService.changeStatus(user.tenantId, id, dto, user.userId);
  }

  @Delete(':id')
  @RequirePermissions('leads.delete')
  @HttpCode(HttpStatus.NO_CONTENT)
  async remove(@CurrentUser() user: AuthenticatedUser, @Param('id', ParseUUIDPipe) id: string) {
    await this.leadsService.remove(user.tenantId, id);
  }

  // ── Activities ──

  @Post(':id/activities')
  @RequirePermissions('leads.update')
  addActivity(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: CreateLeadActivityDto,
  ) {
    return this.leadsService.logActivity(user.tenantId, id, user.userId, dto);
  }

  @Get(':id/activities')
  @RequireAnyPermission('leads.view-all', 'leads.view-assigned')
  getActivities(@CurrentUser() user: AuthenticatedUser, @Param('id', ParseUUIDPipe) id: string) {
    return this.leadsService.getActivities(user.tenantId, id);
  }

  // ── Follow-ups ──

  @Post(':id/followups')
  @RequirePermissions('leads.update')
  addFollowUp(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: CreateLeadFollowUpDto,
  ) {
    return this.leadsService.createFollowUp(user.tenantId, id, dto, user.userId);
  }

  @Patch('followups/:followUpId/complete')
  @RequirePermissions('leads.update')
  completeFollowUp(
    @CurrentUser() user: AuthenticatedUser,
    @Param('followUpId', ParseUUIDPipe) followUpId: string,
  ) {
    return this.leadsService.completeFollowUp(user.tenantId, followUpId);
  }

  private async hasPermission(roleId: string, slug: string): Promise<boolean> {
    const role = await this.rolesRepo.findOne({
      where: { id: roleId },
      relations: ['permissions'],
    });
    return role?.permissions.some((p) => p.slug === slug) ?? false;
  }
}
