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
import { KnowledgeBaseService } from './knowledge-base.service';
import {
  CreateKbCategoryDto,
  UpdateKbCategoryDto,
  CreateArticleDto,
  UpdateArticleDto,
  ChangeArticleStatusDto,
  QueryArticlesDto,
} from './dto/kb.dto';
import { CurrentUser, AuthenticatedUser } from '../../common/decorators/current-user.decorator';
import { RequirePermissions } from '../../common/guards/permissions.guard';

@Controller('kb')
export class KnowledgeBaseController {
  constructor(private kbService: KnowledgeBaseService) {}

  @Post('categories')
  @RequirePermissions('kb.manage')
  createCategory(@CurrentUser() user: AuthenticatedUser, @Body() dto: CreateKbCategoryDto) {
    return this.kbService.createCategory(user.tenantId, dto);
  }

  @Get('categories')
  @RequirePermissions('kb.view')
  findAllCategories(@CurrentUser() user: AuthenticatedUser) {
    return this.kbService.findAllCategories(user.tenantId);
  }

  @Put('categories/:id')
  @RequirePermissions('kb.manage')
  updateCategory(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateKbCategoryDto,
  ) {
    return this.kbService.updateCategory(user.tenantId, id, dto);
  }

  @Delete('categories/:id')
  @RequirePermissions('kb.manage')
  @HttpCode(HttpStatus.NO_CONTENT)
  async removeCategory(@CurrentUser() user: AuthenticatedUser, @Param('id', ParseUUIDPipe) id: string) {
    await this.kbService.removeCategory(user.tenantId, id);
  }

  @Post('articles')
  @RequirePermissions('kb.manage')
  createArticle(@CurrentUser() user: AuthenticatedUser, @Body() dto: CreateArticleDto) {
    return this.kbService.createArticle(user.tenantId, dto, user.userId);
  }

  @Get('articles')
  @RequirePermissions('kb.view')
  findAllArticles(@CurrentUser() user: AuthenticatedUser, @Query() query: QueryArticlesDto) {
    return this.kbService.findAllArticles(user.tenantId, query, { clientVisibleOnly: false });
  }

  @Get('articles/:id')
  @RequirePermissions('kb.view')
  findOneArticle(@CurrentUser() user: AuthenticatedUser, @Param('id', ParseUUIDPipe) id: string) {
    return this.kbService.findOneArticle(user.tenantId, id);
  }

  @Put('articles/:id')
  @RequirePermissions('kb.manage')
  updateArticle(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateArticleDto,
  ) {
    return this.kbService.updateArticle(user.tenantId, id, dto);
  }

  @Patch('articles/:id/status')
  @RequirePermissions('kb.manage')
  changeArticleStatus(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: ChangeArticleStatusDto,
  ) {
    return this.kbService.changeArticleStatus(user.tenantId, id, dto.status);
  }

  @Delete('articles/:id')
  @RequirePermissions('kb.manage')
  @HttpCode(HttpStatus.NO_CONTENT)
  async removeArticle(@CurrentUser() user: AuthenticatedUser, @Param('id', ParseUUIDPipe) id: string) {
    await this.kbService.removeArticle(user.tenantId, id);
  }
}
