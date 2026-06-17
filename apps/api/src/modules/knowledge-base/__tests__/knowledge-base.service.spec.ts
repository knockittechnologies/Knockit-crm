import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { NotFoundException } from '@nestjs/common';
import { Repository } from 'typeorm';

import { KnowledgeBaseService } from '../knowledge-base.service';
import { KbCategory } from '../entities/kb-category.entity';
import { Article, ArticleStatus } from '../entities/article.entity';

describe('KnowledgeBaseService', () => {
  let service: KnowledgeBaseService;
  let articlesRepo: jest.Mocked<Partial<Repository<Article>>>;

  const TENANT_ID = 'tenant-1';

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        KnowledgeBaseService,
        {
          provide: getRepositoryToken(KbCategory),
          useValue: { create: jest.fn((d) => d), save: jest.fn((e) => Promise.resolve(e)) },
        },
        {
          provide: getRepositoryToken(Article),
          useValue: {
            create: jest.fn((d) => d),
            save: jest.fn((e) => Promise.resolve(e)),
            findOne: jest.fn(),
            createQueryBuilder: jest.fn(),
          },
        },
      ],
    }).compile();

    service = module.get<KnowledgeBaseService>(KnowledgeBaseService);
    articlesRepo = module.get(getRepositoryToken(Article));
  });

  afterEach(() => jest.clearAllMocks());

  describe('slug generation', () => {
    it('slugifies the title into lowercase, hyphenated form', async () => {
      (articlesRepo.findOne as jest.Mock).mockResolvedValue(null);
      const article = await service.createArticle(
        TENANT_ID,
        { title: 'How To Reset Your Password!', content: 'Steps...' },
        'author-1',
      );
      expect(article.slug).toBe('how-to-reset-your-password');
    });

    it('appends -1, -2 etc on collision rather than erroring', async () => {
      (articlesRepo.findOne as jest.Mock)
        .mockResolvedValueOnce({ id: 'existing-1' })
        .mockResolvedValueOnce({ id: 'existing-2' })
        .mockResolvedValueOnce(null);

      const article = await service.createArticle(
        TENANT_ID,
        { title: 'Getting Started', content: 'Steps...' },
        'author-1',
      );
      expect(article.slug).toBe('getting-started-2');
    });

    it('new articles always start as draft regardless of what the DTO claims', async () => {
      (articlesRepo.findOne as jest.Mock).mockResolvedValue(null);
      const article = await service.createArticle(
        TENANT_ID,
        { title: 'Test', content: 'x' },
        'author-1',
      );
      expect(article.status).toBe(ArticleStatus.DRAFT);
    });
  });

  describe('findOneArticleForClient', () => {
    it('returns the article and increments viewCount when published and client-visible', async () => {
      const article = {
        id: 'a1',
        viewCount: 5,
        status: ArticleStatus.PUBLISHED,
        isClientVisible: true,
      } as Article;
      (articlesRepo.findOne as jest.Mock).mockResolvedValue(article);

      const result = await service.findOneArticleForClient(TENANT_ID, 'a1');

      expect(result.viewCount).toBe(6);
      expect(articlesRepo.save).toHaveBeenCalledWith(expect.objectContaining({ viewCount: 6 }));
    });

    it('throws NotFoundException for a draft article (query itself excludes it)', async () => {
      (articlesRepo.findOne as jest.Mock).mockResolvedValue(null);

      await expect(service.findOneArticleForClient(TENANT_ID, 'draft-article')).rejects.toThrow(
        NotFoundException,
      );
    });

    it('queries with both status=published AND isClientVisible=true conditions', async () => {
      (articlesRepo.findOne as jest.Mock).mockResolvedValue(null);
      await service.findOneArticleForClient(TENANT_ID, 'a1').catch(() => {});

      expect(articlesRepo.findOne).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            status: ArticleStatus.PUBLISHED,
            isClientVisible: true,
          }),
        }),
      );
    });
  });

  describe('changeArticleStatus', () => {
    it('stamps publishedAt the first time an article is published', async () => {
      (articlesRepo.findOne as jest.Mock).mockResolvedValue({
        id: 'a1',
        tenantId: TENANT_ID,
        status: ArticleStatus.DRAFT,
        publishedAt: null,
      });

      const result = await service.changeArticleStatus(TENANT_ID, 'a1', ArticleStatus.PUBLISHED);
      expect(result.publishedAt).toBeInstanceOf(Date);
    });

    it('does not overwrite publishedAt if already set (re-publishing after archive)', async () => {
      const firstPublish = new Date('2026-01-01T00:00:00Z');
      (articlesRepo.findOne as jest.Mock).mockResolvedValue({
        id: 'a1',
        tenantId: TENANT_ID,
        status: ArticleStatus.ARCHIVED,
        publishedAt: firstPublish,
      });

      const result = await service.changeArticleStatus(TENANT_ID, 'a1', ArticleStatus.PUBLISHED);
      expect(result.publishedAt).toEqual(firstPublish);
    });
  });
});
