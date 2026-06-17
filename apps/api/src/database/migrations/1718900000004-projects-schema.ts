import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Migration 0004 — Projects, Milestones, Tasks, Time Logs.
 */
export class ProjectsSchema1718900000004 implements MigrationInterface {
  name = 'ProjectsSchema1718900000004';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TYPE project_status AS ENUM ('planning','in_progress','on_hold','completed','cancelled');
      CREATE TYPE project_type AS ENUM ('mobile_app','website','crm','custom_software','amc_support');

      CREATE TABLE projects (
        id                  UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
        "tenantId"          UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
        name                VARCHAR(255) NOT NULL,
        description         TEXT,
        type                project_type,
        status              project_status NOT NULL DEFAULT 'planning',
        "companyId"         UUID REFERENCES companies(id) ON DELETE SET NULL,
        "originLeadId"      UUID REFERENCES leads(id) ON DELETE SET NULL,
        "startDate"         DATE,
        "targetEndDate"     DATE,
        "actualEndDate"     DATE,
        budget              DECIMAL(15,2),
        currency            VARCHAR(10) NOT NULL DEFAULT 'GBP',
        "loggedHours"       DECIMAL(10,2) NOT NULL DEFAULT 0,
        "projectManagerId"  UUID REFERENCES users(id) ON DELETE SET NULL,
        "teamMemberIds"     TEXT[] NOT NULL DEFAULT '{}',
        "progressPercent"   INT NOT NULL DEFAULT 0,
        "createdById"       UUID REFERENCES users(id) ON DELETE SET NULL,
        "createdAt"         TIMESTAMPTZ NOT NULL DEFAULT now(),
        "updatedAt"         TIMESTAMPTZ NOT NULL DEFAULT now(),
        "deletedAt"         TIMESTAMPTZ
      );
      CREATE INDEX idx_projects_tenant ON projects("tenantId");
      CREATE INDEX idx_projects_tenant_status ON projects("tenantId", status);
    `);

    await queryRunner.query(`
      CREATE TYPE milestone_status AS ENUM ('pending','in_progress','completed','delayed');

      CREATE TABLE milestones (
        id            UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
        "tenantId"    UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
        "projectId"   UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
        title         VARCHAR(255) NOT NULL,
        description   TEXT,
        "dueDate"     DATE,
        status        milestone_status NOT NULL DEFAULT 'pending',
        "completedAt" TIMESTAMPTZ,
        "sortOrder"   INT NOT NULL DEFAULT 0,
        "createdAt"   TIMESTAMPTZ NOT NULL DEFAULT now(),
        "updatedAt"   TIMESTAMPTZ NOT NULL DEFAULT now(),
        "deletedAt"   TIMESTAMPTZ
      );
      CREATE INDEX idx_milestones_tenant ON milestones("tenantId");
      CREATE INDEX idx_milestones_project ON milestones("projectId");
    `);

    await queryRunner.query(`
      CREATE TYPE task_status AS ENUM ('todo','in_progress','in_review','done');
      CREATE TYPE task_priority AS ENUM ('low','medium','high');

      CREATE TABLE tasks (
        id                UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
        "tenantId"        UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
        "projectId"       UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
        "milestoneId"     UUID REFERENCES milestones(id) ON DELETE SET NULL,
        title             VARCHAR(255) NOT NULL,
        description       TEXT,
        status            task_status NOT NULL DEFAULT 'todo',
        priority          task_priority NOT NULL DEFAULT 'medium',
        "assignedToId"    UUID REFERENCES users(id) ON DELETE SET NULL,
        "dueDate"         DATE,
        "estimatedHours"  DECIMAL(10,2),
        "completedAt"     TIMESTAMPTZ,
        tags              TEXT[] NOT NULL DEFAULT '{}',
        "sortOrder"       INT NOT NULL DEFAULT 0,
        "createdById"     UUID REFERENCES users(id) ON DELETE SET NULL,
        "createdAt"       TIMESTAMPTZ NOT NULL DEFAULT now(),
        "updatedAt"       TIMESTAMPTZ NOT NULL DEFAULT now(),
        "deletedAt"       TIMESTAMPTZ
      );
      CREATE INDEX idx_tasks_tenant ON tasks("tenantId");
      CREATE INDEX idx_tasks_project ON tasks("projectId");
      CREATE INDEX idx_tasks_assigned_status ON tasks("assignedToId", status);
    `);

    await queryRunner.query(`
      CREATE TABLE time_logs (
        id            UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
        "tenantId"    UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
        "projectId"   UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
        "taskId"      UUID REFERENCES tasks(id) ON DELETE SET NULL,
        "userId"      UUID NOT NULL REFERENCES users(id),
        date          DATE NOT NULL,
        hours         DECIMAL(5,2) NOT NULL,
        notes         TEXT,
        "isAmcHours"  BOOLEAN NOT NULL DEFAULT false,
        "isBillable"  BOOLEAN NOT NULL DEFAULT false,
        "createdAt"   TIMESTAMPTZ NOT NULL DEFAULT now(),
        "updatedAt"   TIMESTAMPTZ NOT NULL DEFAULT now(),
        "deletedAt"   TIMESTAMPTZ
      );
      CREATE INDEX idx_timelogs_tenant ON time_logs("tenantId");
      CREATE INDEX idx_timelogs_project ON time_logs("projectId");
      CREATE INDEX idx_timelogs_user_date ON time_logs("userId", date);
    `);

    await queryRunner.query(`
      ALTER TABLE projects ENABLE ROW LEVEL SECURITY;
      CREATE POLICY tenant_isolation_projects ON projects
        USING ("tenantId" = current_setting('app.tenant_id', true)::uuid);

      ALTER TABLE milestones ENABLE ROW LEVEL SECURITY;
      CREATE POLICY tenant_isolation_milestones ON milestones
        USING ("tenantId" = current_setting('app.tenant_id', true)::uuid);

      ALTER TABLE tasks ENABLE ROW LEVEL SECURITY;
      CREATE POLICY tenant_isolation_tasks ON tasks
        USING ("tenantId" = current_setting('app.tenant_id', true)::uuid);

      ALTER TABLE time_logs ENABLE ROW LEVEL SECURITY;
      CREATE POLICY tenant_isolation_time_logs ON time_logs
        USING ("tenantId" = current_setting('app.tenant_id', true)::uuid);
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE IF EXISTS time_logs`);
    await queryRunner.query(`DROP TABLE IF EXISTS tasks`);
    await queryRunner.query(`DROP TYPE IF EXISTS task_priority`);
    await queryRunner.query(`DROP TYPE IF EXISTS task_status`);
    await queryRunner.query(`DROP TABLE IF EXISTS milestones`);
    await queryRunner.query(`DROP TYPE IF EXISTS milestone_status`);
    await queryRunner.query(`DROP TABLE IF EXISTS projects`);
    await queryRunner.query(`DROP TYPE IF EXISTS project_type`);
    await queryRunner.query(`DROP TYPE IF EXISTS project_status`);
  }
}
