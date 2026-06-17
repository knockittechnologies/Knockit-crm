import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Migration 0007 — AMC (Annual Maintenance Contract) tracking.
 */
export class AmcSchema1719200000007 implements MigrationInterface {
  name = 'AmcSchema1719200000007';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TYPE amc_contract_status AS ENUM ('active','expired','cancelled');
      CREATE TYPE amc_renewal_cycle AS ENUM ('monthly','quarterly','annual');

      CREATE TABLE amc_contracts (
        id                       UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
        "tenantId"               UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
        "companyId"              UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
        name                     VARCHAR(255) NOT NULL,
        status                   amc_contract_status NOT NULL DEFAULT 'active',
        "renewalCycle"           amc_renewal_cycle NOT NULL DEFAULT 'annual',
        "startDate"              DATE NOT NULL,
        "currentPeriodEnd"       DATE NOT NULL,
        "hoursIncludedPerPeriod" DECIMAL(10,2) NOT NULL,
        "overageRate"            DECIMAL(10,2),
        currency                 VARCHAR(10) NOT NULL DEFAULT 'GBP',
        notes                    TEXT,
        "accountManagerId"       UUID REFERENCES users(id) ON DELETE SET NULL,
        "createdAt"              TIMESTAMPTZ NOT NULL DEFAULT now(),
        "updatedAt"              TIMESTAMPTZ NOT NULL DEFAULT now(),
        "deletedAt"              TIMESTAMPTZ
      );
      CREATE INDEX idx_amc_contracts_tenant ON amc_contracts("tenantId");
      CREATE INDEX idx_amc_contracts_tenant_status ON amc_contracts("tenantId", status);
      CREATE INDEX idx_amc_contracts_company ON amc_contracts("companyId");
    `);

    await queryRunner.query(`
      ALTER TABLE amc_contracts ENABLE ROW LEVEL SECURITY;
      CREATE POLICY tenant_isolation_amc_contracts ON amc_contracts
        USING ("tenantId" = current_setting('app.tenant_id', true)::uuid);
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE IF EXISTS amc_contracts`);
    await queryRunner.query(`DROP TYPE IF EXISTS amc_renewal_cycle`);
    await queryRunner.query(`DROP TYPE IF EXISTS amc_contract_status`);
  }
}
