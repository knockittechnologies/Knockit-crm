import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  ParseUUIDPipe,
  Post,
  Put,
  Query,
} from '@nestjs/common';
import { ContactsService } from './contacts.service';
import { CreateContactDto, UpdateContactDto, QueryContactsDto } from './dto/contact.dto';
import { CurrentUser, AuthenticatedUser } from '../../common/decorators/current-user.decorator';
import { RequirePermissions } from '../../common/guards/permissions.guard';

@Controller('contacts')
export class ContactsController {
  constructor(private contactsService: ContactsService) {}

  @Post()
  @RequirePermissions('contacts.manage')
  create(@CurrentUser() user: AuthenticatedUser, @Body() dto: CreateContactDto) {
    return this.contactsService.create(user.tenantId, dto, user.userId);
  }

  @Get()
  @RequirePermissions('contacts.view')
  findAll(@CurrentUser() user: AuthenticatedUser, @Query() query: QueryContactsDto) {
    return this.contactsService.findAll(user.tenantId, query);
  }

  @Get(':id')
  @RequirePermissions('contacts.view')
  findOne(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    return this.contactsService.findOne(user.tenantId, id);
  }

  @Put(':id')
  @RequirePermissions('contacts.manage')
  update(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateContactDto,
  ) {
    return this.contactsService.update(user.tenantId, id, dto);
  }

  @Post(':id/invite-portal-access')
  @RequirePermissions('contacts.manage')
  invitePortalAccess(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    return this.contactsService.invitePortalAccess(user.tenantId, id);
  }

  @Delete(':id')
  @RequirePermissions('contacts.manage')
  @HttpCode(HttpStatus.NO_CONTENT)
  async remove(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    await this.contactsService.remove(user.tenantId, id);
  }
}
