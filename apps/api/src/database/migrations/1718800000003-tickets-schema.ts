import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Migration 0003 — Tickets + SLA tracking + comments.
 */
export class TicketsSchema1718800000003 implements MigrationInterface {
  name = 'TicketsSchema1718800000003';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TYPE ticket_priority AS ENUM ('low','medium','high','critical');
      CREATE TYPE ticket_status AS ENUM (
        'open','assigned','in_progress','waiting_on_client','resolved','closed','reopened'
      );
      CREATE TYPE ticket_source AS ENUM ('portal','email','phone','internal');

      CREATE TABLE tickets (
        id                        UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
        "tenantId"                UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
        reference                 VARCHAR(20) NOT NULL,
        subject                   VARCHAR(255) NOT NULL,
        description               TEXT NOT NULL,
        category                  VARCHAR(60),
        priority                  ticket_priority NOT NULL DEFAULT 'medium',
        status                    ticket_status NOT NULL DEFAULT 'open',
        source                    ticket_source NOT NULL DEFAULT 'portal',
        "raisedByContactId"       UUID REFERENCES contacts(id) ON DELETE SET NULL,
        "raisedByUserId"          UUID REFERENCES users(id) ON DELETE SET NULL,
        "companyId"               UUID REFERENCES companies(id) ON DELETE SET NULL,
        "assignedToId"            UUID REFERENCES users(id) ON DELETE SET NULL,
        "firstResponseDueAt"      TIMESTAMPTZ,
        "firstRespondedAt"        TIMESTAMPTZ,
        "resolutionDueAt"         TIMESTAMPTZ,
        "resolvedAt"              TIMESTAMPTZ,
        "slaResponseBreached"     BOOLEAN NOT NULL DEFAULT false,
        "slaResolutionBreached"   BOOLEAN NOT NULL DEFAULT false,
        "closedAt"                TIMESTAMPTZ,
        tags                      TEXT[] NOT NULL DEFAULT '{}',
        "createdById"             UUID REFERENCES users(id) ON DELETE SET NULL,
        "createdAt"               TIMESTAMPTZ NOT NULL DEFAULT now(),
        "updatedAt"               TIMESTAMPTZ NOT NULL DEFAULT now(),
        "deletedAt"               TIMESTAMPTZ,
        UNIQUE ("tenantId", reference)
      );
      CREATE INDEX idx_tickets_tenant ON tickets("tenantId");
      CREATE INDEX idx_tickets_tenant_status ON tickets("tenantId", status);
      CREATE INDEX idx_tickets_assigned ON tickets("tenantId", "assignedToId");
      CREATE INDEX idx_tickets_sla_response ON tickets("firstResponseDueAt") WHERE "firstRespondedAt" IS NULL;
      CREATE INDEX idx_tickets_sla_resolution ON tickets("resolutionDueAt") WHERE "resolvedAt" IS NULL;
    `);

    await queryRunner.query(`
      CREATE TABLE ticket_comments (
        id                UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
        "tenantId"        UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
        "ticketId"        UUID NOT NULL REFERENCES tickets(id) ON DELETE CASCADE,
        body              TEXT NOT NULL,
        "isInternal"      BOOLEAN NOT NULL DEFAULT false,
        "authorUserId"    UUID REFERENCES users(id) ON DELETE SET NULL,
        "authorContactId" UUID REFERENCES contacts(id) ON DELETE SET NULL,
        attachments       JSONB NOT NULL DEFAULT '[]',
        "createdAt"       TIMESTAMPTZ NOT NULL DEFAULT now(),
        "updatedAt"       TIMESTAMPTZ NOT NULL DEFAULT now(),
        "deletedAt"       TIMESTAMPTZ
      );
      CREATE INDEX idx_ticket_comments_tenant ON ticket_comments("tenantId");
      CREATE INDEX idx_ticket_comments_ticket ON ticket_comments("ticketId");
    `);

    await queryRunner.query(`
      ALTER TABLE tickets ENABLE ROW LEVEL SECURITY;
      CREATE POLICY tenant_isolation_tickets ON tickets
        USING ("tenantId" = current_setting('app.tenant_id', true)::uuid);

      ALTER TABLE ticket_comments ENABLE ROW LEVEL SECURITY;
      CREATE POLICY tenant_isolation_ticket_comments ON ticket_comments
        USING ("tenantId" = current_setting('app.tenant_id', true)::uuid);
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE IF EXISTS ticket_comments`);
    await queryRunner.query(`DROP TABLE IF EXISTS tickets`);
    await queryRunner.query(`DROP TYPE IF EXISTS ticket_source`);
    await queryRunner.query(`DROP TYPE IF EXISTS ticket_status`);
    await queryRunner.query(`DROP TYPE IF EXISTS ticket_priority`);
  }
}
