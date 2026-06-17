import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Migration 0002 — Core CRM: companies, contacts, leads + lead activity/followups.
 * Run via: npm run migration:run --workspace=apps/api
 */
export class CrmCoreSchema1718700000002 implements MigrationInterface {
  name = 'CrmCoreSchema1718700000002';

  public async up(queryRunner: QueryRunner): Promise<void> {
    // ───────────────────────── companies ─────────────────────────
    await queryRunner.query(`
      CREATE TABLE companies (
        id                      UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
        "tenantId"              UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
        name                    VARCHAR(255) NOT NULL,
        industry                VARCHAR(255),
        website                 VARCHAR(255),
        phone                   VARCHAR(60),
        email                   VARCHAR(255),
        address                 JSONB,
        size                    VARCHAR(30),
        "annualRevenue"         DECIMAL(15,2),
        currency                VARCHAR(10) NOT NULL DEFAULT 'GBP',
        "logoUrl"               TEXT,
        "vatNumber"             VARCHAR(30),
        "companiesHouseNumber"  VARCHAR(30),
        notes                   TEXT,
        tags                    TEXT[] NOT NULL DEFAULT '{}',
        "customFields"          JSONB NOT NULL DEFAULT '{}',
        "createdById"           UUID REFERENCES users(id) ON DELETE SET NULL,
        "assignedToId"          UUID REFERENCES users(id) ON DELETE SET NULL,
        "createdAt"             TIMESTAMPTZ NOT NULL DEFAULT now(),
        "updatedAt"             TIMESTAMPTZ NOT NULL DEFAULT now(),
        "deletedAt"             TIMESTAMPTZ
      );
      CREATE INDEX idx_companies_tenant ON companies("tenantId");
      CREATE INDEX idx_companies_name ON companies("tenantId", name);
    `);

    // ───────────────────────── contacts ─────────────────────────
    await queryRunner.query(`
      CREATE TABLE contacts (
        id                  UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
        "tenantId"          UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
        "companyId"         UUID REFERENCES companies(id) ON DELETE SET NULL,
        "firstName"         VARCHAR(100) NOT NULL,
        "lastName"          VARCHAR(100),
        email               VARCHAR(255),
        phone               VARCHAR(60),
        "jobTitle"          VARCHAR(150),
        department          VARCHAR(150),
        "avatarUrl"         TEXT,
        timezone            VARCHAR(60) NOT NULL DEFAULT 'Europe/London',
        "preferredContact"  VARCHAR(20) NOT NULL DEFAULT 'email',
        "isPrimary"         BOOLEAN NOT NULL DEFAULT false,
        notes               TEXT,
        tags                TEXT[] NOT NULL DEFAULT '{}',
        "customFields"      JSONB NOT NULL DEFAULT '{}',
        "isClientUser"      BOOLEAN NOT NULL DEFAULT false,
        "clientUserId"      UUID,
        "createdById"       UUID REFERENCES users(id) ON DELETE SET NULL,
        "createdAt"         TIMESTAMPTZ NOT NULL DEFAULT now(),
        "updatedAt"         TIMESTAMPTZ NOT NULL DEFAULT now(),
        "deletedAt"         TIMESTAMPTZ
      );
      CREATE INDEX idx_contacts_tenant ON contacts("tenantId");
      CREATE INDEX idx_contacts_company ON contacts("companyId");
    `);

    // ───────────────────────── leads ─────────────────────────
    await queryRunner.query(`
      CREATE TYPE lead_status AS ENUM (
        'new','contacted','requirement_gathering','proposal_sent','negotiation','won','lost'
      );
      CREATE TYPE lead_priority AS ENUM ('low','medium','high');

      CREATE TABLE leads (
        id                  UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
        "tenantId"          UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
        "contactId"         UUID REFERENCES contacts(id) ON DELETE SET NULL,
        "companyId"         UUID REFERENCES companies(id) ON DELETE SET NULL,
        title               VARCHAR(255) NOT NULL,
        source              VARCHAR(60),
        status              lead_status NOT NULL DEFAULT 'new',
        priority            lead_priority NOT NULL DEFAULT 'medium',
        "estimatedValue"    DECIMAL(15,2),
        currency            VARCHAR(10) NOT NULL DEFAULT 'GBP',
        probability         INT NOT NULL DEFAULT 0,
        "expectedClose"     DATE,
        "serviceType"       TEXT[] NOT NULL DEFAULT '{}',
        description         TEXT,
        "lostReason"        TEXT,
        "lostAt"            TIMESTAMPTZ,
        "wonAt"             TIMESTAMPTZ,
        "assignedToId"      UUID REFERENCES users(id) ON DELETE SET NULL,
        "createdById"       UUID REFERENCES users(id) ON DELETE SET NULL,
        tags                TEXT[] NOT NULL DEFAULT '{}',
        "customFields"      JSONB NOT NULL DEFAULT '{}',
        "createdAt"         TIMESTAMPTZ NOT NULL DEFAULT now(),
        "updatedAt"         TIMESTAMPTZ NOT NULL DEFAULT now(),
        "deletedAt"         TIMESTAMPTZ
      );
      CREATE INDEX idx_leads_tenant ON leads("tenantId");
      CREATE INDEX idx_leads_tenant_status ON leads("tenantId", status);
      CREATE INDEX idx_leads_assigned ON leads("assignedToId");
    `);

    // ───────────────────────── lead_activities ─────────────────────────
    await queryRunner.query(`
      CREATE TYPE lead_activity_type AS ENUM ('call','email','meeting','note','status_change');

      CREATE TABLE lead_activities (
        id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
        "tenantId"      UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
        "leadId"        UUID NOT NULL REFERENCES leads(id) ON DELETE CASCADE,
        "userId"        UUID REFERENCES users(id) ON DELETE SET NULL,
        type            lead_activity_type NOT NULL,
        title           VARCHAR(255),
        description     TEXT,
        metadata        JSONB NOT NULL DEFAULT '{}',
        "scheduledAt"   TIMESTAMPTZ,
        "completedAt"   TIMESTAMPTZ,
        "createdAt"     TIMESTAMPTZ NOT NULL DEFAULT now(),
        "updatedAt"     TIMESTAMPTZ NOT NULL DEFAULT now(),
        "deletedAt"     TIMESTAMPTZ
      );
      CREATE INDEX idx_lead_activities_tenant ON lead_activities("tenantId");
      CREATE INDEX idx_lead_activities_lead ON lead_activities("leadId");
    `);

    // ───────────────────────── lead_followups ─────────────────────────
    await queryRunner.query(`
      CREATE TYPE followup_status AS ENUM ('pending','completed','cancelled');

      CREATE TABLE lead_followups (
        id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
        "tenantId"      UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
        "leadId"        UUID NOT NULL REFERENCES leads(id) ON DELETE CASCADE,
        "assignedToId"  UUID NOT NULL REFERENCES users(id),
        "dueDate"       TIMESTAMPTZ NOT NULL,
        notes           TEXT,
        status          followup_status NOT NULL DEFAULT 'pending',
        "completedAt"   TIMESTAMPTZ,
        "createdById"   UUID REFERENCES users(id) ON DELETE SET NULL,
        "createdAt"     TIMESTAMPTZ NOT NULL DEFAULT now(),
        "updatedAt"     TIMESTAMPTZ NOT NULL DEFAULT now(),
        "deletedAt"     TIMESTAMPTZ
      );
      CREATE INDEX idx_followups_tenant ON lead_followups("tenantId");
      CREATE INDEX idx_followups_lead ON lead_followups("leadId");
      CREATE INDEX idx_followups_assigned_status ON lead_followups("assignedToId", status);
    `);

    // ───────────────────────── Row Level Security ─────────────────────────
    await queryRunner.query(`
      ALTER TABLE companies ENABLE ROW LEVEL SECURITY;
      CREATE POLICY tenant_isolation_companies ON companies
        USING ("tenantId" = current_setting('app.tenant_id', true)::uuid);

      ALTER TABLE contacts ENABLE ROW LEVEL SECURITY;
      CREATE POLICY tenant_isolation_contacts ON contacts
        USING ("tenantId" = current_setting('app.tenant_id', true)::uuid);

      ALTER TABLE leads ENABLE ROW LEVEL SECURITY;
      CREATE POLICY tenant_isolation_leads ON leads
        USING ("tenantId" = current_setting('app.tenant_id', true)::uuid);

      ALTER TABLE lead_activities ENABLE ROW LEVEL SECURITY;
      CREATE POLICY tenant_isolation_lead_activities ON lead_activities
        USING ("tenantId" = current_setting('app.tenant_id', true)::uuid);

      ALTER TABLE lead_followups ENABLE ROW LEVEL SECURITY;
      CREATE POLICY tenant_isolation_lead_followups ON lead_followups
        USING ("tenantId" = current_setting('app.tenant_id', true)::uuid);
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE IF EXISTS lead_followups`);
    await queryRunner.query(`DROP TYPE IF EXISTS followup_status`);
    await queryRunner.query(`DROP TABLE IF EXISTS lead_activities`);
    await queryRunner.query(`DROP TYPE IF EXISTS lead_activity_type`);
    await queryRunner.query(`DROP TABLE IF EXISTS leads`);
    await queryRunner.query(`DROP TYPE IF EXISTS lead_priority`);
    await queryRunner.query(`DROP TYPE IF EXISTS lead_status`);
    await queryRunner.query(`DROP TABLE IF EXISTS contacts`);
    await queryRunner.query(`DROP TABLE IF EXISTS companies`);
  }
}
