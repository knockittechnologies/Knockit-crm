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
} from '@nestjs/common';
import { AmcService } from './amc.service';
import {
  CreateAmcContractDto,
  UpdateAmcContractDto,
  RenewAmcContractDto,
} from './dto/amc.dto';
import { CurrentUser, AuthenticatedUser } from '../../common/decorators/current-user.decorator';
import { RequirePermissions } from '../../common/guards/permissions.guard';

@Controller('amc')
export class AmcController {
  constructor(private amcService: AmcService) {}

  @Post('contracts')
  @RequirePermissions('amc.manage')
  create(@CurrentUser() user: AuthenticatedUser, @Body() dto: CreateAmcContractDto) {
    return this.amcService.create(user.tenantId, dto);
  }

  @Get('contracts')
  @RequirePermissions('amc.view')
  findAll(@CurrentUser() user: AuthenticatedUser) {
    return this.amcService.findAll(user.tenantId);
  }

  @Get('contracts/:id')
  @RequirePermissions('amc.view')
  findOne(@CurrentUser() user: AuthenticatedUser, @Param('id', ParseUUIDPipe) id: string) {
    return this.amcService.findOne(user.tenantId, id);
  }

  @Get('contracts/:id/usage')
  @RequirePermissions('amc.view')
  getUsage(@CurrentUser() user: AuthenticatedUser, @Param('id', ParseUUIDPipe) id: string) {
    return this.amcService.getUsageForContract(user.tenantId, id);
  }

  @Put('contracts/:id')
  @RequirePermissions('amc.manage')
  update(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateAmcContractDto,
  ) {
    return this.amcService.update(user.tenantId, id, dto);
  }

  @Patch('contracts/:id/renew')
  @RequirePermissions('amc.manage')
  renew(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: RenewAmcContractDto,
  ) {
    return this.amcService.renew(user.tenantId, id, dto);
  }

  @Patch('contracts/:id/cancel')
  @RequirePermissions('amc.manage')
  cancel(@CurrentUser() user: AuthenticatedUser, @Param('id', ParseUUIDPipe) id: string) {
    return this.amcService.cancel(user.tenantId, id);
  }

  @Delete('contracts/:id')
  @RequirePermissions('amc.manage')
  @HttpCode(HttpStatus.NO_CONTENT)
  async remove(@CurrentUser() user: AuthenticatedUser, @Param('id', ParseUUIDPipe) id: string) {
    await this.amcService.remove(user.tenantId, id);
  }
}
