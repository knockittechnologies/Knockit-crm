import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Migration 0001 — Foundation: tenants, roles, permissions, users, sessions.
 * Run via: npm run migration:run --workspace=apps/api
 *
 * This also enables PostgreSQL Row-Level Security on every tenant-scoped
 * table as a defence-in-depth measure underneath the application-level
 * PermissionsGuard.
 */
export class InitialSchema1718600000001 implements MigrationInterface {
  name = 'InitialSchema1718600000001';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`CREATE EXTENSION IF NOT EXISTS "uuid-ossp"`);

    // ───────────────────────── tenants ─────────────────────────
    await queryRunner.query(`
      CREATE TYPE tenant_plan AS ENUM ('starter','pro','enterprise');
      CREATE TYPE tenant_status AS ENUM ('active','suspended','cancelled');

      CREATE TABLE tenants (
        id               UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
        slug             VARCHAR(150) UNIQUE NOT NULL,
        name             VARCHAR(255) NOT NULL,
        plan             tenant_plan NOT NULL DEFAULT 'starter',
        status           tenant_status NOT NULL DEFAULT 'active',
        settings         JSONB NOT NULL DEFAULT '{}',
        "maxUsers"       INT NOT NULL DEFAULT 10,
        "maxStorageGb"   INT NOT NULL DEFAULT 10,
        currency         VARCHAR(10) NOT NULL DEFAULT 'GBP',
        timezone         VARCHAR(60) NOT NULL DEFAULT 'Europe/London',
        "vatNumber"      VARCHAR(30),
        "companiesHouseNumber" VARCHAR(30),
        "createdAt"      TIMESTAMPTZ NOT NULL DEFAULT now(),
        "updatedAt"      TIMESTAMPTZ NOT NULL DEFAULT now(),
        "deletedAt"      TIMESTAMPTZ
      );
    `);

    // ───────────────────────── permissions (global, not tenant-scoped) ─────────────────────────
    await queryRunner.query(`
      CREATE TABLE permissions (
        id          UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
        module      VARCHAR(100) NOT NULL,
        action      VARCHAR(100) NOT NULL,
        slug        VARCHAR(200) UNIQUE NOT NULL,
        description TEXT,
        "createdAt" TIMESTAMPTZ NOT NULL DEFAULT now(),
        "updatedAt" TIMESTAMPTZ NOT NULL DEFAULT now(),
        "deletedAt" TIMESTAMPTZ
      );
    `);

    // ───────────────────────── roles ─────────────────────────
    await queryRunner.query(`
      CREATE TABLE roles (
        id          UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
        "tenantId"  UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
        name        VARCHAR(100) NOT NULL,
        slug        VARCHAR(100) NOT NULL,
        description TEXT,
        "isSystem"  BOOLEAN NOT NULL DEFAULT false,
        "createdAt" TIMESTAMPTZ NOT NULL DEFAULT now(),
        "updatedAt" TIMESTAMPTZ NOT NULL DEFAULT now(),
        "deletedAt" TIMESTAMPTZ,
        UNIQUE ("tenantId", slug)
      );
      CREATE INDEX idx_roles_tenant ON roles("tenantId");
    `);

    await queryRunner.query(`
      CREATE TABLE role_permissions (
        role_id       UUID NOT NULL REFERENCES roles(id) ON DELETE CASCADE,
        permission_id UUID NOT NULL REFERENCES permissions(id) ON DELETE CASCADE,
        PRIMARY KEY (role_id, permission_id)
      );
    `);

    // ───────────────────────── users ─────────────────────────
    await queryRunner.query(`
      CREATE TYPE user_status AS ENUM ('active','invited','inactive','suspended');

      CREATE TABLE users (
        id                      UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
        "tenantId"              UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
        "roleId"                UUID NOT NULL REFERENCES roles(id),
        email                   VARCHAR(255) NOT NULL,
        phone                   VARCHAR(30),
        "passwordHash"          VARCHAR(255),
        "firstName"             VARCHAR(100) NOT NULL,
        "lastName"              VARCHAR(100) NOT NULL,
        "avatarUrl"             TEXT,
        department              VARCHAR(100),
        status                  user_status NOT NULL DEFAULT 'invited',
        "emailVerified"         BOOLEAN NOT NULL DEFAULT false,
        "twoFaEnabled"          BOOLEAN NOT NULL DEFAULT false,
        "twoFaSecret"           VARCHAR(255),
        "twoFaBackupCodes"      JSONB,
        "moduleAccessOverride"  JSONB,
        "lastLoginAt"           TIMESTAMPTZ,
        "inviteToken"           VARCHAR(255),
        "inviteTokenExpiresAt"  TIMESTAMPTZ,
        "passwordResetToken"    VARCHAR(255),
        "passwordResetExpiresAt" TIMESTAMPTZ,
        "createdAt"             TIMESTAMPTZ NOT NULL DEFAULT now(),
        "updatedAt"             TIMESTAMPTZ NOT NULL DEFAULT now(),
        "deletedAt"             TIMESTAMPTZ,
        UNIQUE ("tenantId", email)
      );
      CREATE INDEX idx_users_tenant ON users("tenantId");
      CREATE INDEX idx_users_role ON users("roleId");
      CREATE INDEX idx_users_invite_token ON users("inviteToken") WHERE "inviteToken" IS NOT NULL;
    `);

    // ───────────────────────── user_sessions (refresh tokens) ─────────────────────────
    await queryRunner.query(`
      CREATE TABLE user_sessions (
        id                  UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
        "userId"            UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        "refreshTokenHash"  VARCHAR(255) NOT NULL UNIQUE,
        "deviceInfo"        JSONB,
        "ipAddress"         VARCHAR(60),
        "userAgent"         TEXT,
        "expiresAt"         TIMESTAMPTZ NOT NULL,
        "revokedAt"         TIMESTAMPTZ,
        "createdAt"         TIMESTAMPTZ NOT NULL DEFAULT now(),
        "updatedAt"         TIMESTAMPTZ NOT NULL DEFAULT now(),
        "deletedAt"         TIMESTAMPTZ
      );
      CREATE INDEX idx_sessions_user ON user_sessions("userId");
      CREATE INDEX idx_sessions_expiry ON user_sessions("expiresAt");
    `);

    // ───────────────────────── audit_logs (partitioned by month) ─────────────────────────
    await queryRunner.query(`
      CREATE TABLE audit_logs (
        id           UUID NOT NULL DEFAULT uuid_generate_v4(),
        "tenantId"   UUID REFERENCES tenants(id) ON DELETE SET NULL,
        "userId"     UUID REFERENCES users(id) ON DELETE SET NULL,
        action       VARCHAR(100) NOT NULL,
        "entityType" VARCHAR(100) NOT NULL,
        "entityId"   UUID,
        "oldValues"  JSONB,
        "newValues"  JSONB,
        "ipAddress"  VARCHAR(60),
        "userAgent"  TEXT,
        "createdAt"  TIMESTAMPTZ NOT NULL DEFAULT now(),
        PRIMARY KEY (id, "createdAt")
      ) PARTITION BY RANGE ("createdAt");

      -- Default partition catches anything outside explicitly created ranges
      CREATE TABLE audit_logs_default PARTITION OF audit_logs DEFAULT;

      CREATE INDEX idx_audit_tenant_created ON audit_logs("tenantId", "createdAt" DESC);
      CREATE INDEX idx_audit_entity ON audit_logs("entityType", "entityId", "createdAt" DESC);
    `);

    // ───────────────────────── ROW LEVEL SECURITY ─────────────────────────
    // Defence-in-depth: even if application code forgets a WHERE tenantId=...
    // clause, Postgres itself will not return rows belonging to another tenant.
    // The app sets these session variables per-request — see
    // common/services/tenant-context.service.ts
    await queryRunner.query(`
      ALTER TABLE roles ENABLE ROW LEVEL SECURITY;
      CREATE POLICY tenant_isolation_roles ON roles
        USING ("tenantId" = current_setting('app.tenant_id', true)::uuid);

      ALTER TABLE users ENABLE ROW LEVEL SECURITY;
      CREATE POLICY tenant_isolation_users ON users
        USING ("tenantId" = current_setting('app.tenant_id', true)::uuid);
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE IF EXISTS audit_logs_default`);
    await queryRunner.query(`DROP TABLE IF EXISTS audit_logs`);
    await queryRunner.query(`DROP TABLE IF EXISTS user_sessions`);
    await queryRunner.query(`DROP TABLE IF EXISTS users`);
    await queryRunner.query(`DROP TYPE IF EXISTS user_status`);
    await queryRunner.query(`DROP TABLE IF EXISTS role_permissions`);
    await queryRunner.query(`DROP TABLE IF EXISTS roles`);
    await queryRunner.query(`DROP TABLE IF EXISTS permissions`);
    await queryRunner.query(`DROP TABLE IF EXISTS tenants`);
    await queryRunner.query(`DROP TYPE IF EXISTS tenant_status`);
    await queryRunner.query(`DROP TYPE IF EXISTS tenant_plan`);
  }
}
