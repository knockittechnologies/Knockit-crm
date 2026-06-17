import { ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';

import { KbCategory } from './entities/kb-category.entity';
import { Article, ArticleStatus } from './entities/article.entity';
import {
  CreateKbCategoryDto,
  UpdateKbCategoryDto,
  CreateArticleDto,
  UpdateArticleDto,
  QueryArticlesDto,
} from './dto/kb.dto';

@Injectable()
export class KnowledgeBaseService {
  constructor(
    @InjectRepository(KbCategory) private categoriesRepo: Repository<KbCategory>,
    @InjectRepository(Article) private articlesRepo: Repository<Article>,
  ) {}

  // ───────────────────────── Categories ─────────────────────────

  async createCategory(tenantId: string, dto: CreateKbCategoryDto): Promise<KbCategory> {
    const category = this.categoriesRepo.create({ ...dto, tenantId });
    return this.categoriesRepo.save(category);
  }

  async findAllCategories(tenantId: string): Promise<KbCategory[]> {
    return this.categoriesRepo.find({
      where: { tenantId },
      order: { sortOrder: 'ASC', name: 'ASC' },
    });
  }

  async findOneCategory(tenantId: string, id: string): Promise<KbCategory> {
    const category = await this.categoriesRepo.findOne({ where: { id, tenantId } });
    if (!category) {
      throw new NotFoundException('Category not found');
    }
    return category;
  }

  async updateCategory(
    tenantId: string,
    id: string,
    dto: UpdateKbCategoryDto,
  ): Promise<KbCategory> {
    const category = await this.findOneCategory(tenantId, id);
    Object.assign(category, dto);
    return this.categoriesRepo.save(category);
  }

  async removeCategory(tenantId: string, id: string): Promise<void> {
    const category = await this.findOneCategory(tenantId, id);
    await this.categoriesRepo.softRemove(category);
  }

  // ───────────────────────── Articles ─────────────────────────

  async createArticle(
    tenantId: string,
    dto: CreateArticleDto,
    authorId: string,
  ): Promise<Article> {
    const slug = await this.generateUniqueSlug(tenantId, dto.title);
    const article = this.articlesRepo.create({
      ...dto,
      tenantId,
      authorId,
      slug,
      status: ArticleStatus.DRAFT,
    });
    return this.articlesRepo.save(article);
  }

  /**
   * Slugs are globally unique (DB constraint), not just per-tenant, because
   * they're intended to eventually back public-facing KB URLs. Collisions
   * across tenants are handled by appending a short suffix rather than
   * erroring — two different tenants both writing an article called
   * "Getting Started" is the normal case, not an edge case.
   */
  private async generateUniqueSlug(tenantId: string, title: string): Promise<string> {
    const base = title
      .toLowerCase()
      .trim()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/(^-|-$)/g, '');

    let candidate = base;
    let suffix = 0;
    while (suffix < 50) {
      const existing = await this.articlesRepo.findOne({ where: { slug: candidate } });
      if (!existing) return candidate;
      suffix += 1;
      candidate = `${base}-${suffix}`;
    }
    throw new ConflictException('Could not generate a unique slug for this title');
  }

  async findAllArticles(
    tenantId: string,
    query: QueryArticlesDto,
    options: { clientVisibleOnly: boolean },
  ): Promise<Article[]> {
    const qb = this.articlesRepo
      .createQueryBuilder('article')
      .leftJoinAndSelect('article.category', 'category')
      .where('article.tenantId = :tenantId', { tenantId });

    if (options.clientVisibleOnly) {
      qb.andWhere('article.status = :published', { published: ArticleStatus.PUBLISHED });
      qb.andWhere('article.isClientVisible = true');
    } else if (query.status) {
      qb.andWhere('article.status = :status', { status: query.status });
    }

    if (query.categoryId) {
      qb.andWhere('article.categoryId = :categoryId', { categoryId: query.categoryId });
    }
    if (query.search) {
      qb.andWhere('(article.title ILIKE :search OR article.content ILIKE :search)', {
        search: `%${query.search}%`,
      });
    }

    return qb.orderBy('article.updatedAt', 'DESC').getMany();
  }

  async findOneArticle(tenantId: string, id: string): Promise<Article> {
    const article = await this.articlesRepo.findOne({
      where: { id, tenantId },
      relations: ['category', 'author'],
    });
    if (!article) {
      throw new NotFoundException('Article not found');
    }
    return article;
  }

  async findOneArticleForClient(tenantId: string, id: string): Promise<Article> {
    const article = await this.articlesRepo.findOne({
      where: {
        id,
        tenantId,
        status: ArticleStatus.PUBLISHED,
        isClientVisible: true,
      },
      relations: ['category'],
    });
    if (!article) {
      throw new NotFoundException('Article not found');
    }
    article.viewCount += 1;
    await this.articlesRepo.save(article);
    return article;
  }

  async updateArticle(
    tenantId: string,
    id: string,
    dto: UpdateArticleDto,
  ): Promise<Article> {
    const article = await this.findOneArticle(tenantId, id);
    Object.assign(article, dto);
    return this.articlesRepo.save(article);
  }

  async changeArticleStatus(
    tenantId: string,
    id: string,
    status: ArticleStatus,
  ): Promise<Article> {
    const article = await this.findOneArticle(tenantId, id);
    article.status = status;
    if (status === ArticleStatus.PUBLISHED && !article.publishedAt) {
      article.publishedAt = new Date();
    }
    return this.articlesRepo.save(article);
  }

  async removeArticle(tenantId: string, id: string): Promise<void> {
    const article = await this.findOneArticle(tenantId, id);
    await this.articlesRepo.softRemove(article);
  }
}
