import {
  IsArray,
  IsBoolean,
  IsEnum,
  IsOptional,
  IsString,
  IsUUID,
  MaxLength,
} from 'class-validator';
import { PartialType } from '@nestjs/swagger';
import { ArticleStatus } from '../entities/article.entity';

export class CreateKbCategoryDto {
  @IsString()
  @MaxLength(150)
  name: string;

  @IsOptional()
  @IsString()
  description?: string;

  @IsOptional()
  isClientVisible?: boolean;
}

export class UpdateKbCategoryDto extends PartialType(CreateKbCategoryDto) {}

export class CreateArticleDto {
  @IsString()
  @MaxLength(255)
  title: string;

  @IsString()
  content: string;

  @IsOptional()
  @IsString()
  excerpt?: string;

  @IsOptional()
  @IsUUID()
  categoryId?: string;

  @IsOptional()
  @IsBoolean()
  isClientVisible?: boolean;

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  tags?: string[];
}

export class UpdateArticleDto extends PartialType(CreateArticleDto) {}

export class ChangeArticleStatusDto {
  @IsEnum(ArticleStatus)
  status: ArticleStatus;
}

export class QueryArticlesDto {
  @IsOptional()
  @IsEnum(ArticleStatus)
  status?: ArticleStatus;

  @IsOptional()
  @IsUUID()
  categoryId?: string;

  @IsOptional()
  @IsString()
  search?: string;
}
