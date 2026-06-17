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

import { TicketsService } from './tickets.service';
import {
  CreateTicketDto,
  UpdateTicketDto,
  AssignTicketDto,
  CreateTicketCommentDto,
  QueryTicketsDto,
} from './dto/ticket.dto';
import { TicketStatus } from './entities/ticket.entity';
import { CurrentUser, AuthenticatedUser } from '../../common/decorators/current-user.decorator';
import { RequirePermissions, RequireAnyPermission } from '../../common/guards/permissions.guard';
import { Role } from '../roles/entities/role.entity';

@Controller('tickets')
export class TicketsController {
  constructor(
    private ticketsService: TicketsService,
    @InjectRepository(Role) private rolesRepo: Repository<Role>,
  ) {}

  @Post()
  @RequirePermissions('tickets.create')
  create(@CurrentUser() user: AuthenticatedUser, @Body() dto: CreateTicketDto) {
    return this.ticketsService.create(user.tenantId, dto, user.userId);
  }

  @Get()
  @RequireAnyPermission('tickets.view-all', 'tickets.view-assigned')
  async findAll(@CurrentUser() user: AuthenticatedUser, @Query() query: QueryTicketsDto) {
    const canViewAll = await this.hasPermission(user.roleId, 'tickets.view-all');
    return this.ticketsService.findAll(user.tenantId, query, {
      userId: user.userId,
      canViewAll,
    });
  }

  @Get(':id')
  @RequireAnyPermission('tickets.view-all', 'tickets.view-assigned')
  findOne(@CurrentUser() user: AuthenticatedUser, @Param('id', ParseUUIDPipe) id: string) {
    return this.ticketsService.findOne(user.tenantId, id);
  }

  @Put(':id')
  @RequirePermissions('tickets.manage')
  update(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateTicketDto,
  ) {
    return this.ticketsService.update(user.tenantId, id, dto);
  }

  @Patch(':id/assign')
  @RequirePermissions('tickets.assign')
  assign(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: AssignTicketDto,
  ) {
    return this.ticketsService.assign(user.tenantId, id, dto);
  }

  @Patch(':id/status')
  @RequirePermissions('tickets.manage')
  changeStatus(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Body('status') status: TicketStatus,
  ) {
    return this.ticketsService.changeStatus(user.tenantId, id, status);
  }

  @Delete(':id')
  @RequirePermissions('tickets.manage')
  @HttpCode(HttpStatus.NO_CONTENT)
  async remove(@CurrentUser() user: AuthenticatedUser, @Param('id', ParseUUIDPipe) id: string) {
    await this.ticketsService.remove(user.tenantId, id);
  }

  // ── Comments ──

  @Post(':id/comments')
  @RequireAnyPermission('tickets.view-all', 'tickets.view-assigned')
  addComment(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: CreateTicketCommentDto,
  ) {
    return this.ticketsService.addComment(user.tenantId, id, dto, { userId: user.userId });
  }

  @Get(':id/comments')
  @RequireAnyPermission('tickets.view-all', 'tickets.view-assigned')
  async getComments(@CurrentUser() user: AuthenticatedUser, @Param('id', ParseUUIDPipe) id: string) {
    const canSeeInternal = await this.hasPermission(user.roleId, 'tickets.internal-notes');
    return this.ticketsService.getComments(user.tenantId, id, canSeeInternal);
  }

  private async hasPermission(roleId: string, slug: string): Promise<boolean> {
    const role = await this.rolesRepo.findOne({
      where: { id: roleId },
      relations: ['permissions'],
    });
    return role?.permissions.some((p) => p.slug === slug) ?? false;
  }
}
