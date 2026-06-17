import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Migration 0006 — Knowledge Base: categories and articles.
 */
export class KnowledgeBaseSchema1719100000006 implements MigrationInterface {
  name = 'KnowledgeBaseSchema1719100000006';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE kb_categories (
        id                UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
        "tenantId"        UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
        name              VARCHAR(150) NOT NULL,
        description       VARCHAR(255),
        "sortOrder"       INT NOT NULL DEFAULT 0,
        "isClientVisible" BOOLEAN NOT NULL DEFAULT true,
        "createdAt"       TIMESTAMPTZ NOT NULL DEFAULT now(),
        "updatedAt"       TIMESTAMPTZ NOT NULL DEFAULT now(),
        "deletedAt"       TIMESTAMPTZ
      );
      CREATE INDEX idx_kb_categories_tenant ON kb_categories("tenantId");
    `);

    await queryRunner.query(`
      CREATE TYPE article_status AS ENUM ('draft','published','archived');

      CREATE TABLE kb_articles (
        id                UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
        "tenantId"        UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
        "categoryId"      UUID REFERENCES kb_categories(id) ON DELETE SET NULL,
        title             VARCHAR(255) NOT NULL,
        slug              VARCHAR(300) NOT NULL UNIQUE,
        content           TEXT NOT NULL,
        excerpt           TEXT,
        status            article_status NOT NULL DEFAULT 'draft',
        "isClientVisible" BOOLEAN NOT NULL DEFAULT true,
        "viewCount"       INT NOT NULL DEFAULT 0,
        tags              TEXT[] NOT NULL DEFAULT '{}',
        "authorId"        UUID REFERENCES users(id) ON DELETE SET NULL,
        "publishedAt"     TIMESTAMPTZ,
        "createdAt"       TIMESTAMPTZ NOT NULL DEFAULT now(),
        "updatedAt"       TIMESTAMPTZ NOT NULL DEFAULT now(),
        "deletedAt"       TIMESTAMPTZ
      );
      CREATE INDEX idx_kb_articles_tenant ON kb_articles("tenantId");
      CREATE INDEX idx_kb_articles_tenant_status ON kb_articles("tenantId", status);
      CREATE INDEX idx_kb_articles_category ON kb_articles("categoryId");
    `);

    await queryRunner.query(`
      ALTER TABLE kb_categories ENABLE ROW LEVEL SECURITY;
      CREATE POLICY tenant_isolation_kb_categories ON kb_categories
        USING ("tenantId" = current_setting('app.tenant_id', true)::uuid);

      ALTER TABLE kb_articles ENABLE ROW LEVEL SECURITY;
      CREATE POLICY tenant_isolation_kb_articles ON kb_articles
        USING ("tenantId" = current_setting('app.tenant_id', true)::uuid);
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE IF EXISTS kb_articles`);
    await queryRunner.query(`DROP TYPE IF EXISTS article_status`);
    await queryRunner.query(`DROP TABLE IF EXISTS kb_categories`);
  }
}
