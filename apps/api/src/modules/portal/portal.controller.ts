import {
  Body,
  Controller,
  Get,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import { IsEnum, IsOptional, IsString } from 'class-validator';

import { PortalService } from './portal.service';
import { Public } from '../../common/decorators/public.decorator';
import { PortalAuthGuard, CurrentContact, AuthenticatedContact } from './portal-auth.guard';
import { CreateTicketDto } from '../tickets/dto/ticket.dto';
import { ApprovalStatus } from './entities/approval.entity';
import { QueryArticlesDto } from '../knowledge-base/dto/kb.dto';

class PortalTicketReplyDto {
  @IsString()
  body: string;
}

class PortalApprovalResponseDto {
  @IsEnum([ApprovalStatus.APPROVED, ApprovalStatus.REVISION_REQUESTED])
  status: ApprovalStatus.APPROVED | ApprovalStatus.REVISION_REQUESTED;

  @IsOptional()
  @IsString()
  notes?: string;
}

/**
 * Every route here is @Public() with respect to the GLOBAL staff JwtAuthGuard
 * (so a staff token is never accidentally accepted) and separately wrapped
 * in @UseGuards(PortalAuthGuard), which only accepts a token with
 * scope:'portal'. There is deliberately no RequirePermissions anywhere in
 * this controller — the portal has no concept of staff permissions at all;
 * scoping is entirely by company, enforced inside PortalService.
 */
@Public()
@UseGuards(PortalAuthGuard)
@Controller('portal')
export class PortalController {
  constructor(private portalService: PortalService) {}

  // ── Tickets ──

  @Post('tickets')
  raiseTicket(@CurrentContact() contact: AuthenticatedContact, @Body() dto: CreateTicketDto) {
    return this.portalService.raiseTicket(contact, dto);
  }

  @Get('tickets')
  getTickets(@CurrentContact() contact: AuthenticatedContact) {
    return this.portalService.getTickets(contact);
  }

  @Get('tickets/:id')
  getTicket(
    @CurrentContact() contact: AuthenticatedContact,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    return this.portalService.getTicket(contact, id);
  }

  @Get('tickets/:id/comments')
  getTicketComments(
    @CurrentContact() contact: AuthenticatedContact,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    return this.portalService.getTicketComments(contact, id);
  }

  @Post('tickets/:id/reply')
  replyToTicket(
    @CurrentContact() contact: AuthenticatedContact,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: PortalTicketReplyDto,
  ) {
    return this.portalService.addTicketReply(contact, id, dto.body);
  }

  // ── Projects ──

  @Get('projects')
  getProjects(@CurrentContact() contact: AuthenticatedContact) {
    return this.portalService.getProjects(contact);
  }

  @Get('projects/:id')
  getProject(
    @CurrentContact() contact: AuthenticatedContact,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    return this.portalService.getProject(contact, id);
  }

  // ── Approvals ──

  @Get('approvals')
  getApprovals(@CurrentContact() contact: AuthenticatedContact) {
    return this.portalService.getApprovals(contact);
  }

  @Patch('approvals/:id/respond')
  respondToApproval(
    @CurrentContact() contact: AuthenticatedContact,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: PortalApprovalResponseDto,
  ) {
    return this.portalService.respondToApproval(contact, id, dto.status, dto.notes);
  }

  // ── Knowledge Base ──

  @Get('kb/articles')
  getKbArticles(
    @CurrentContact() contact: AuthenticatedContact,
    @Query() query: QueryArticlesDto,
  ) {
    return this.portalService.getKbArticles(contact, query);
  }

  @Get('kb/articles/:id')
  getKbArticle(
    @CurrentContact() contact: AuthenticatedContact,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    return this.portalService.getKbArticle(contact, id);
  }

  // ── AMC ──

  @Get('amc/contracts')
  getAmcContracts(@CurrentContact() contact: AuthenticatedContact) {
    return this.portalService.getAmcContracts(contact);
  }
}
