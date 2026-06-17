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
import { CompaniesService } from './companies.service';
import { CreateCompanyDto, UpdateCompanyDto, QueryCompaniesDto } from './dto/company.dto';
import { CurrentUser, AuthenticatedUser } from '../../common/decorators/current-user.decorator';
import { RequirePermissions } from '../../common/guards/permissions.guard';

@Controller('companies')
export class CompaniesController {
  constructor(private companiesService: CompaniesService) {}

  @Post()
  @RequirePermissions('companies.manage')
  create(@CurrentUser() user: AuthenticatedUser, @Body() dto: CreateCompanyDto) {
    return this.companiesService.create(user.tenantId, dto, user.userId);
  }

  @Get()
  @RequirePermissions('companies.view')
  findAll(@CurrentUser() user: AuthenticatedUser, @Query() query: QueryCompaniesDto) {
    return this.companiesService.findAll(user.tenantId, query);
  }

  @Get(':id')
  @RequirePermissions('companies.view')
  findOne(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    return this.companiesService.findOne(user.tenantId, id);
  }

  @Put(':id')
  @RequirePermissions('companies.manage')
  update(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateCompanyDto,
  ) {
    return this.companiesService.update(user.tenantId, id, dto);
  }

  @Delete(':id')
  @RequirePermissions('companies.manage')
  @HttpCode(HttpStatus.NO_CONTENT)
  async remove(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    await this.companiesService.remove(user.tenantId, id);
  }
}
