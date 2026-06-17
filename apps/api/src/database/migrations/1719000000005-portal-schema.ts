import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Migration 0005 — Client portal: auth fields on contacts (replacing the
 * earlier clientUserId indirection) + the approvals table the portal's
 * "Approvals" tab needs.
 */
export class PortalSchema1719000000005 implements MigrationInterface {
  name = 'PortalSchema1719000000005';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE contacts DROP COLUMN IF EXISTS "clientUserId";

      ALTER TABLE contacts ADD COLUMN "passwordHash" VARCHAR(255);
      ALTER TABLE contacts ADD COLUMN "inviteToken" VARCHAR(255);
      ALTER TABLE contacts ADD COLUMN "inviteTokenExpiresAt" TIMESTAMPTZ;
      ALTER TABLE contacts ADD COLUMN "lastPortalLoginAt" TIMESTAMPTZ;

      CREATE INDEX idx_contacts_invite_token ON contacts("inviteToken") WHERE "inviteToken" IS NOT NULL;
    `);

    await queryRunner.query(`
      CREATE TYPE approval_status AS ENUM ('pending','approved','revision_requested');
      CREATE TYPE approval_type AS ENUM ('design','document','deliverable','milestone');

      CREATE TABLE approvals (
        id                  UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
        "tenantId"          UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
        "projectId"         UUID REFERENCES projects(id) ON DELETE CASCADE,
        title               VARCHAR(255) NOT NULL,
        description         TEXT,
        type                approval_type NOT NULL DEFAULT 'deliverable',
        status              approval_status NOT NULL DEFAULT 'pending',
        "fileUrl"           TEXT,
        "fileName"          VARCHAR(255),
        "requestedByUserId" UUID REFERENCES users(id) ON DELETE SET NULL,
        "respondedByContactId" UUID REFERENCES contacts(id) ON DELETE SET NULL,
        "responseNotes"     TEXT,
        "respondedAt"       TIMESTAMPTZ,
        "createdAt"         TIMESTAMPTZ NOT NULL DEFAULT now(),
        "updatedAt"         TIMESTAMPTZ NOT NULL DEFAULT now(),
        "deletedAt"         TIMESTAMPTZ
      );
      CREATE INDEX idx_approvals_tenant ON approvals("tenantId");
      CREATE INDEX idx_approvals_project ON approvals("projectId");
      CREATE INDEX idx_approvals_tenant_status ON approvals("tenantId", status);
    `);

    await queryRunner.query(`
      ALTER TABLE approvals ENABLE ROW LEVEL SECURITY;
      CREATE POLICY tenant_isolation_approvals ON approvals
        USING ("tenantId" = current_setting('app.tenant_id', true)::uuid);
    `);

    await queryRunner.query(`
      CREATE TABLE portal_sessions (
        id                 UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
        "contactId"        UUID NOT NULL REFERENCES contacts(id) ON DELETE CASCADE,
        "refreshTokenHash" VARCHAR(255) NOT NULL UNIQUE,
        "ipAddress"        VARCHAR(60),
        "userAgent"        TEXT,
        "expiresAt"        TIMESTAMPTZ NOT NULL,
        "revokedAt"        TIMESTAMPTZ,
        "createdAt"        TIMESTAMPTZ NOT NULL DEFAULT now(),
        "updatedAt"        TIMESTAMPTZ NOT NULL DEFAULT now(),
        "deletedAt"        TIMESTAMPTZ
      );
      CREATE INDEX idx_portal_sessions_contact ON portal_sessions("contactId");
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE IF EXISTS portal_sessions`);
    await queryRunner.query(`DROP TABLE IF EXISTS approvals`);
    await queryRunner.query(`DROP TYPE IF EXISTS approval_type`);
    await queryRunner.query(`DROP TYPE IF EXISTS approval_status`);

    await queryRunner.query(`
      ALTER TABLE contacts DROP COLUMN IF EXISTS "passwordHash";
      ALTER TABLE contacts DROP COLUMN IF EXISTS "inviteToken";
      ALTER TABLE contacts DROP COLUMN IF EXISTS "inviteTokenExpiresAt";
      ALTER TABLE contacts DROP COLUMN IF EXISTS "lastPortalLoginAt";
      ALTER TABLE contacts ADD COLUMN "clientUserId" VARCHAR;
    `);
  }
}
