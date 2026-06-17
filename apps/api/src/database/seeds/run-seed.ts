import 'dotenv/config';
import { AppDataSource } from '../data-source';
import { PERMISSIONS_SEED, ROLE_PERMISSION_MAP } from './permissions.data';

/**
 * Idempotent seed script — safe to run multiple times in any environment.
 * Run with: npm run seed --workspace=apps/api
 *
 * What it does:
 *  1. Upserts the global permissions list (permissions are NOT tenant-scoped)
 *  2. For every existing tenant, wires up role_permissions for its 5 system roles
 *  3. In development only, creates a demo tenant + super-admin login if none exists
 */
async function run() {
  const ds = await AppDataSource.initialize();
  console.log('🔌 Connected to database for seeding...');

  // ── 1. Upsert permissions ──
  for (const p of PERMISSIONS_SEED) {
    const slug = `${p.module}.${p.action}`;
    await ds.query(
      `INSERT INTO permissions (module, action, slug, description)
       VALUES ($1, $2, $3, $4)
       ON CONFLICT (slug) DO UPDATE SET description = EXCLUDED.description`,
      [p.module, p.action, slug, p.description],
    );
  }
  console.log(`✅ Seeded ${PERMISSIONS_SEED.length} permissions`);

  // ── 2. Wire role_permissions for every tenant's system roles ──
  const tenants: Array<{ id: string }> = await ds.query(`SELECT id FROM tenants`);
  const allPermissions: Array<{ id: string; slug: string }> = await ds.query(
    `SELECT id, slug FROM permissions`,
  );
  const permBySlug = new Map(allPermissions.map((p) => [p.slug, p.id]));

  for (const tenant of tenants) {
    const roles: Array<{ id: string; slug: string }> = await ds.query(
      `SELECT id, slug FROM roles WHERE "tenantId" = $1`,
      [tenant.id],
    );

    for (const role of roles) {
      const slugs = ROLE_PERMISSION_MAP[role.slug];
      if (!slugs) continue;

      const permissionIds =
        slugs[0] === '*'
          ? allPermissions.map((p) => p.id)
          : slugs.map((s) => permBySlug.get(s)).filter(Boolean);

      for (const permId of permissionIds) {
        await ds.query(
          `INSERT INTO role_permissions (role_id, permission_id)
           VALUES ($1, $2) ON CONFLICT DO NOTHING`,
          [role.id, permId],
        );
      }
    }
  }
  console.log(`✅ Wired role_permissions for ${tenants.length} tenant(s)`);

  // ── 3. Dev-only demo tenant ──
  if (process.env.NODE_ENV === 'development') {
    const existing = await ds.query(`SELECT id FROM tenants WHERE slug LIKE 'knockit-demo%'`);
    if (existing.length === 0) {
      console.log('ℹ️  No demo tenant found. Register one via POST /api/v1/auth/register, e.g.:');
      console.log(`
   curl -X POST http://localhost:3000/api/v1/auth/register \\
     -H "Content-Type: application/json" \\
     -d '{
       "companyName": "Knockit Demo",
       "email": "admin@knockit.local",
       "password": "DevPassword123",
       "firstName": "James",
       "lastName": "Patel"
     }'
      `);
    } else {
      console.log('ℹ️  Demo tenant already exists, skipping.');
    }
  }

  await ds.destroy();
  console.log('🌱 Seeding complete.');
}

run().catch((err) => {
  console.error('❌ Seed failed:', err);
  process.exit(1);
});
